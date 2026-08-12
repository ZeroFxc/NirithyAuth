/**
 * 认证辅助函数
 * 密码哈希和 JWT 操作
 * 
 * 改进：
 * 1. PBKDF2 迭代次数提升至 NIST 推荐的 600000 次
 * 2. JWT 添加 jti (JWT ID) 用于撤销追踪
 * 3. 常量时间比较防止时序攻击
 */

import { CONSTANTS } from './shared'

/**
 * PBKDF2 密码哈希
 * 使用 Web Crypto API（Workers 环境原生支持）
 * 
 * 格式: pbkdf2:{iterations}:{saltHex}:{hashHex}
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const saltHex = bufferToHex(salt)

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: CONSTANTS.PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    CONSTANTS.PBKDF2_KEY_LENGTH
  )
  const hashHex = bufferToHex(new Uint8Array(hash))
  return `pbkdf2:${CONSTANTS.PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`
}

/**
 * 验证密码
 * 支持不同迭代次数的哈希（向后兼容旧哈希）
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false

  const [, iterStr, saltHex, hashHex] = parts
  const iterations = parseInt(iterStr, 10)
  const salt = hexToBuffer(saltHex) as BufferSource
  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256',
    },
    key,
    CONSTANTS.PBKDF2_KEY_LENGTH
  )
  const computedHex = bufferToHex(new Uint8Array(hash))

  // 常量时间比较，防止时序攻击
  return constantTimeEquals(computedHex, hashHex)
}

/**
 * 生成 JWT access_token
 * 使用 HMAC-SHA256 签名
 * 包含 jti (JWT ID) 用于撤销追踪
 */
export async function createJWT(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds: number
): Promise<string> {
  const encoder = new TextEncoder()
  const header = { alg: CONSTANTS.JWT_ALG, typ: CONSTANTS.JWT_TYP }

  const now = Math.floor(Date.now() / 1000)
  // 如果调用方传入了 jti 则使用，否则生成新的
  const jti = (payload.jti as string) || crypto.randomUUID()
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds, jti }

  const base64Header = base64urlEncode(JSON.stringify(header))
  const base64Payload = base64urlEncode(JSON.stringify(fullPayload))

  const signingInput = `${base64Header}.${base64Payload}`

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput))
  const base64Signature = base64urlEncodeFromBytes(new Uint8Array(signature))

  return `${signingInput}.${base64Signature}`
}

/**
 * 验证 JWT
 * 返回 payload（包含 jti）或 null
 */
export async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [base64Header, base64Payload, base64Signature] = parts
    const signingInput = `${base64Header}.${base64Payload}`

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )

    const signature = base64urlDecodeToBytes(base64Signature) as BufferSource

    const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(signingInput))
    if (!valid) return null

    const payload = JSON.parse(base64urlDecode(base64Payload)) as Record<string, unknown>

    // 检查过期
    if (payload.exp && typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

/** Uint8Array 转 hex 字符串 */
function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** hex 字符串转 Uint8Array */
function hexToBuffer(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return arr
}

/** 字符串转 base64url */
function base64urlEncode(str: string): string {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** bytes 转 base64url */
function base64urlEncodeFromBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** base64url 解码为字符串 */
function base64urlDecode(str: string): string {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'))
}

/** base64url 解码为 Uint8Array */
function base64urlDecodeToBytes(str: string): Uint8Array {
  const binary = base64urlDecode(str)
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}

/** 常量时间字符串比较，防止时序攻击 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
