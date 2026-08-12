/**
 * OAuth2 客户端应用数据模型
 * 
 * R2 存储结构：
 *   clients/{client_id}.json            — 客户端应用数据
 *   indexes/client_owner/{ownerId}.json  — 用户 → clientId 列表索引
 * 
 * 改进：添加 owner 索引避免全表扫描
 */

import type { StorageAdapter } from './storage'

/** OAuth2 客户端应用 */
export interface OAuth2Client {
  clientId: string
  clientSecret: string
  name: string
  description?: string
  homepageUrl: string
  redirectUris: string[]       // 允许的回调 URL 列表
  ownerId: string               // 所属用户 ID
  createdAt: string
  updatedAt: string
}

/** Owner 索引 */
export interface ClientOwnerIndex {
  clientIds: string[]
}

/** 生成随机字符串 */
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, b => chars[b % chars.length]).join('')
}

export function createClientStore(storage: StorageAdapter) {
  /**
   * 获取 owner 索引 key
   */
  function getOwnerIndexKey(ownerId: string): string {
    return `indexes/client_owner/${ownerId}.json`
  }

  /**
   * 创建 OAuth2 客户端应用
   */
  async function createClient(data: {
    name: string
    description?: string
    homepageUrl: string
    redirectUris: string[]
    ownerId: string
  }): Promise<OAuth2Client> {
    const now = new Date().toISOString()
    const client: OAuth2Client = {
      clientId: `cli_${generateRandomString(24)}`,
      clientSecret: `sec_${generateRandomString(48)}`,
      name: data.name,
      description: data.description,
      homepageUrl: data.homepageUrl,
      redirectUris: data.redirectUris,
      ownerId: data.ownerId,
      createdAt: now,
      updatedAt: now,
    }

    // 写入客户端数据
    await storage.putJSON(`clients/${client.clientId}.json`, client)

    // 更新 owner 索引
    const indexKey = getOwnerIndexKey(data.ownerId)
    const index = await storage.getJSON<ClientOwnerIndex>(indexKey)
    const clientIds = index?.clientIds || []
    clientIds.push(client.clientId)
    await storage.putJSON(indexKey, { clientIds })

    return client
  }

  /**
   * 按 client_id 查找
   */
  async function findByClientId(clientId: string): Promise<OAuth2Client | null> {
    return storage.getJSON<OAuth2Client>(`clients/${clientId}.json`)
  }

  /**
   * 列出某用户的所有应用
   * 改进：使用 owner 索引，避免全表扫描
   */
  async function listByOwner(ownerId: string): Promise<OAuth2Client[]> {
    const index = await storage.getJSON<ClientOwnerIndex>(getOwnerIndexKey(ownerId))
    if (!index || !index.clientIds || index.clientIds.length === 0) {
      return []
    }

    const clients: OAuth2Client[] = []
    for (const clientId of index.clientIds) {
      const client = await storage.getJSON<OAuth2Client>(`clients/${clientId}.json`)
      if (client) {
        clients.push(client)
      }
    }

    return clients.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /**
   * 更新应用信息
   */
  async function updateClient(
    clientId: string,
    updates: Partial<Pick<OAuth2Client, 'name' | 'description' | 'homepageUrl' | 'redirectUris'>>
  ): Promise<OAuth2Client | null> {
    const client = await storage.getJSON<OAuth2Client>(`clients/${clientId}.json`)
    if (!client) return null

    Object.assign(client, updates, { updatedAt: new Date().toISOString() })
    await storage.putJSON(`clients/${clientId}.json`, client)
    return client
  }

  /**
   * 删除应用
   * 改进：同时清理 owner 索引
   */
  async function deleteClient(clientId: string): Promise<boolean> {
    const client = await storage.getJSON<OAuth2Client>(`clients/${clientId}.json`)
    if (!client) return false

    await storage.delete(`clients/${clientId}.json`)

    // 清理 owner 索引
    const indexKey = getOwnerIndexKey(client.ownerId)
    const index = await storage.getJSON<ClientOwnerIndex>(indexKey)
    if (index) {
      index.clientIds = index.clientIds.filter(id => id !== clientId)
      await storage.putJSON(indexKey, index)
    }

    return true
  }

  /**
   * 重新生成 client_secret
   */
  async function regenerateSecret(clientId: string): Promise<OAuth2Client | null> {
    const client = await storage.getJSON<OAuth2Client>(`clients/${clientId}.json`)
    if (!client) return null

    client.clientSecret = `sec_${generateRandomString(48)}`
    client.updatedAt = new Date().toISOString()
    await storage.putJSON(`clients/${clientId}.json`, client)
    return client
  }

  return { createClient, findByClientId, listByOwner, updateClient, deleteClient, regenerateSecret }
}
