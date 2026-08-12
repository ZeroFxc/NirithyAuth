/**
 * KV 存储辅助函数
 * 管理 session、授权码、token 的存储和验证
 * 
 * 修复点：
 * 1. authCode.consume 按 spec 删除授权码（不再仅标记 used）
 * 2. 重放攻击时完整吊销关联 token
 * 3. refreshToken 轮换正确删除旧 token 而非标记
 * 4. 添加 revokeByUserAndClient 批量撤销
 */

import { CONSTANTS } from './shared'

export function createKVStore(kv: KVNamespace) {
  /**
   * 生成随机 token 字符串
   */
  function generateToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const array = new Uint8Array(length)
    crypto.getRandomValues(array)
    return Array.from(array, b => chars[b % chars.length]).join('')
  }

  /**
   * Session 管理
   */
  const session = {
    async create(userId: string): Promise<string> {
      const token = generateToken(48)
      await kv.put(`session:${token}`, JSON.stringify({ userId, createdAt: Date.now() }), {
        expirationTtl: CONSTANTS.SESSION_TTL,
      })
      return token
    },

    async getUserId(token: string): Promise<string | null> {
      const data = await kv.get(`session:${token}`)
      if (!data) return null
      const parsed = JSON.parse(data) as { userId: string }
      return parsed.userId
    },

    async delete(token: string): Promise<void> {
      await kv.delete(`session:${token}`)
    },
  }

  /**
   * 授权码管理
   * 
   * KV key: auth_code:{code}
   * Value: JSON { userId, clientId, redirectUri, codeChallenge, scope, createdAt }
   * 
   * 修复：消费后立即删除，重放检测通过检查 key 是否存在但已被标记
   */
  const authCode = {
    async create(data: {
      userId: string
      clientId: string
      redirectUri: string
      codeChallenge: string
      scope: string
    }): Promise<string> {
      const code = generateToken(32)
      await kv.put(
        `auth_code:${code}`,
        JSON.stringify({
          ...data,
          createdAt: Date.now(),
        }),
        { expirationTtl: CONSTANTS.AUTH_CODE_TTL }
      )
      return code
    },

    /**
     * 消费授权码（单次使用）
     * 修复：验证后立即从 KV 删除，而非仅标记 used
     * 
     * 如果授权码已被消费过（已被删除），返回 null 并标记重放
     * 我们使用一个单独的 replay 标记 key 来检测重放
     */
    async consume(code: string): Promise<{
      userId: string
      clientId: string
      redirectUri: string
      codeChallenge: string
      scope: string
    } | null> {
      const raw = await kv.get(`auth_code:${code}`)
      if (!raw) {
        // 授权码不存在 - 可能已过期或已被消费
        // 检查是否为重放（已被消费过的码会有 replay 标记）
        const replayFlag = await kv.get(`auth_code:${code}:consumed`)
        if (replayFlag) {
          // 这是重放攻击！返回特殊标记
          return 'REPLAY' as any
        }
        return null
      }

      const parsed = JSON.parse(raw) as {
        userId: string
        clientId: string
        redirectUri: string
        codeChallenge: string
        scope: string
        createdAt: number
      }

      // 立即删除授权码（单次使用）
      await kv.delete(`auth_code:${code}`)
      // 标记为已消费，用于重放检测（TTL 与授权码一致）
      await kv.put(`auth_code:${code}:consumed`, JSON.stringify({
        userId: parsed.userId,
        clientId: parsed.clientId,
        consumedAt: Date.now(),
      }), { expirationTtl: CONSTANTS.AUTH_CODE_TTL })

      return parsed
    },

    /**
     * 检查是否为重放攻击
     */
    async getConsumedInfo(code: string): Promise<{ userId: string; clientId: string } | null> {
      const raw = await kv.get(`auth_code:${code}:consumed`)
      if (!raw) return null
      return JSON.parse(raw) as { userId: string; clientId: string }
    },
  }

  /**
   * Access Token 管理
   * 
   * 注意：access_token 是 JWT（无状态），不存储在 KV 中
   * 但我们需要存储一个映射用于撤销和授权列表
   * 
   * KV key: access_token_jti:{jti}  — JWT ID 到用户/客户端的映射（用于撤销）
   * Value: JSON { userId, clientId, scope, createdAt }
   */
  const accessToken = {
    /**
     * 记录 JWT token 的 JTI（用于撤销追踪）
     */
    async registerJti(jti: string, userId: string, clientId: string, scope: string): Promise<void> {
      await kv.put(
        `access_token_jti:${jti}`,
        JSON.stringify({ userId, clientId, scope, createdAt: Date.now() }),
        { expirationTtl: CONSTANTS.ACCESS_TOKEN_TTL }
      )
    },

    /**
     * 检查 JWT 是否已被撤销
     */
    async isRevoked(jti: string): Promise<boolean> {
      // 如果 JTI 在 KV 中存在，说明 token 有效
      // 如果不存在，可能是已过期或已被撤销
      // 但我们不能仅凭 JTI 不存在就判定撤销（因为过期也会导致消失）
      // 所以这里检查显式的撤销列表
      const revoked = await kv.get(`access_token_revoked:${jti}`)
      return revoked === '1'
    },

    /**
     * 撤销 JWT token
     */
    async revokeJti(jti: string): Promise<void> {
      await kv.delete(`access_token_jti:${jti}`)
      // 标记为已撤销（TTL 与 token 一致）
      await kv.put(`access_token_revoked:${jti}`, '1', {
        expirationTtl: CONSTANTS.ACCESS_TOKEN_TTL,
      })
    },

    /**
     * 按用户和客户端撤销所有 access_token
     * 遍历 JTI 记录进行撤销
     */
    async revokeByUserAndClient(userId: string, clientId: string): Promise<void> {
      const keys = await kv.list({ prefix: 'access_token_jti:' })
      for (const key of keys.keys) {
        const raw = await kv.get(key.name)
        if (!raw) continue
        try {
          const parsed = JSON.parse(raw) as { userId: string; clientId: string }
          if (parsed.userId === userId && parsed.clientId === clientId) {
            const jti = key.name.replace('access_token_jti:', '')
            await this.revokeJti(jti)
          }
        } catch {
          // skip
        }
      }
    },
  }

  /**
   * Refresh Token 管理
   * 
   * KV key: refresh_token:{token}
   * Value: JSON { userId, clientId, scope, createdAt, familyId }
   * 
   * 修复：轮换时删除旧 token 而非标记
   */
  const refreshToken = {
    async create(userId: string, clientId: string, scope: string): Promise<{ token: string; familyId: string }> {
      const token = generateToken(48)
      const familyId = generateToken(16)
      await kv.put(
        `refresh_token:${token}`,
        JSON.stringify({
          userId,
          clientId,
          scope,
          familyId,
          createdAt: Date.now(),
        }),
        { expirationTtl: CONSTANTS.REFRESH_TOKEN_TTL }
      )
      // 记录 family 成员
      await kv.put(
        `refresh_token_family:${familyId}:${token}`,
        JSON.stringify({ userId, clientId }),
        { expirationTtl: CONSTANTS.REFRESH_TOKEN_TTL }
      )
      return { token, familyId }
    },

    /**
     * 轮换 refresh_token
     * 修复：删除旧 token 而非标记
     */
    async rotate(token: string): Promise<{
      userId: string
      clientId: string
      scope: string
      familyId: string
    } | null> {
      const raw = await kv.get(`refresh_token:${token}`)
      if (!raw) {
        // token 不存在 - 可能已被轮换（重放攻击）
        // 检查是否为已轮换的 token
        const consumed = await kv.get(`refresh_token:${token}:consumed`)
        if (consumed) {
          // 重放攻击！返回特殊标记
          const info = JSON.parse(consumed) as { familyId: string }
          await this.revokeFamily(info.familyId)
          return 'REPLAY' as any
        }
        return null
      }

      const parsed = JSON.parse(raw) as {
        userId: string
        clientId: string
        scope: string
        familyId: string
        createdAt: number
      }

      // 删除旧 token（轮换）
      await kv.delete(`refresh_token:${token}`)
      // 标记为已消费，用于重放检测
      await kv.put(
        `refresh_token:${token}:consumed`,
        JSON.stringify({ familyId: parsed.familyId }),
        { expirationTtl: CONSTANTS.REFRESH_TOKEN_TTL }
      )
      // 从 family 中移除
      await kv.delete(`refresh_token_family:${parsed.familyId}:${token}`)

      return parsed
    },

    /**
     * 撤销单个 refresh_token
     */
    async delete(token: string): Promise<void> {
      const raw = await kv.get(`refresh_token:${token}`)
      if (raw) {
        const parsed = JSON.parse(raw) as { familyId: string }
        await kv.delete(`refresh_token_family:${parsed.familyId}:${token}`)
      }
      await kv.delete(`refresh_token:${token}`)
    },

    /**
     * 撤销整个 token family（重放攻击时调用）
     */
    async revokeFamily(familyId: string): Promise<void> {
      const keys = await kv.list({ prefix: `refresh_token_family:${familyId}:` })
      for (const key of keys.keys) {
        const token = key.name.replace(`refresh_token_family:${familyId}:`, '')
        await kv.delete(`refresh_token:${token}`)
        await kv.delete(key.name)
      }
    },

    /**
     * 按用户和客户端撤销所有 refresh_token
     */
    async revokeByUserAndClient(userId: string, clientId: string): Promise<void> {
      const keys = await kv.list({ prefix: 'refresh_token:' })
      for (const key of keys.keys) {
        if (key.name.endsWith(':consumed')) continue
        const raw = await kv.get(key.name)
        if (!raw) continue
        try {
          const parsed = JSON.parse(raw) as { userId: string; clientId: string; familyId: string }
          if (parsed.userId === userId && parsed.clientId === clientId) {
            const token = key.name.replace('refresh_token:', '')
            await this.delete(token)
          }
        } catch {
          // skip
        }
      }
    },
  }

  return { session, authCode, accessToken, refreshToken, generateToken }
}
