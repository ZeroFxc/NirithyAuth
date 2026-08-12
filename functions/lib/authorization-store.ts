/**
 * 授权记录存储
 * 
 * 独立追踪用户对客户端的授权关系
 * R2 存储结构：
 *   authorizations/{userId}/{clientId}.json — 授权记录
 *   indexes/auth/{userId}.json             — 用户授权列表索引
 * 
 * 替代之前通过 KV token 扫描实现的授权列表功能
 */

import type { StorageAdapter } from './storage'

/** 授权记录 */
export interface AuthorizationRecord {
  userId: string
  clientId: string
  scope: string
  authorizedAt: string    // ISO 日期
  updatedAt: string
}

/** 用户授权索引 */
export interface UserAuthIndex {
  clientIds: string[]
}

export function createAuthorizationStore(storage: StorageAdapter) {
  /**
   * 获取授权记录的 R2 key
   */
  function getKey(userId: string, clientId: string): string {
    return `authorizations/${userId}/${clientId}.json`
  }

  /**
   * 获取用户授权索引 key
   */
  function getIndexKey(userId: string): string {
    return `indexes/auth/${userId}.json`
  }

  /**
   * 创建或更新授权记录
   * 用户确认授权时调用
   */
  async function upsert(userId: string, clientId: string, scope: string): Promise<AuthorizationRecord> {
    const now = new Date().toISOString()
    const key = getKey(userId, clientId)

    // 检查是否已有授权记录
    const existing = await storage.getJSON<AuthorizationRecord>(key)
    const record: AuthorizationRecord = {
      userId,
      clientId,
      scope,
      authorizedAt: existing?.authorizedAt || now,
      updatedAt: now,
    }

    await storage.putJSON(key, record)

    // 更新索引
    const indexKey = getIndexKey(userId)
    const index = await storage.getJSON<UserAuthIndex>(indexKey)
    const clientIds = index?.clientIds || []
    if (!clientIds.includes(clientId)) {
      clientIds.push(clientId)
      await storage.putJSON(indexKey, { clientIds })
    }

    return record
  }

  /**
   * 列出用户的所有授权
   */
  async function listByUser(userId: string): Promise<AuthorizationRecord[]> {
    const index = await storage.getJSON<UserAuthIndex>(getIndexKey(userId))
    if (!index || !index.clientIds || index.clientIds.length === 0) {
      return []
    }

    const records: AuthorizationRecord[] = []
    for (const clientId of index.clientIds) {
      const record = await storage.getJSON<AuthorizationRecord>(getKey(userId, clientId))
      if (record) {
        records.push(record)
      }
    }

    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  /**
   * 撤销用户对某客户端的授权
   */
  async function revoke(userId: string, clientId: string): Promise<boolean> {
    const key = getKey(userId, clientId)
    const existing = await storage.getJSON<AuthorizationRecord>(key)
    if (!existing) return false

    await storage.delete(key)

    // 更新索引
    const indexKey = getIndexKey(userId)
    const index = await storage.getJSON<UserAuthIndex>(indexKey)
    if (index) {
      index.clientIds = index.clientIds.filter(id => id !== clientId)
      await storage.putJSON(indexKey, index)
    }

    return true
  }

  /**
   * 检查用户是否已授权某客户端
   */
  async function exists(userId: string, clientId: string): Promise<boolean> {
    const record = await storage.getJSON<AuthorizationRecord>(getKey(userId, clientId))
    return !!record
  }

  return { upsert, listByUser, revoke, exists }
}
