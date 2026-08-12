/**
 * 用户数据模型
 * 
 * R2 存储结构：
 *   users/{user_id}.json          — 用户完整数据
 *   indexes/email/{sha256}.json   — 邮箱 → user_id 索引
 */

import type { StorageAdapter } from './storage'

/** 用户数据结构 */
export interface User {
  id: string
  email: string
  emailHash: string       // SHA256(email) 用于索引
  name: string
  passwordHash: string    // bcrypt 哈希
  avatar?: string
  createdAt: string       // ISO 日期
  updatedAt: string
}

/** 邮箱索引 */
export interface EmailIndex {
  userId: string
}

export function createUserStore(storage: StorageAdapter) {
  /**
   * 计算邮箱的 SHA256 哈希（用于索引 key）
   */
  async function hashEmail(email: string): Promise<string> {
    const normalized = email.toLowerCase().trim()
    const encoder = new TextEncoder()
    const data = encoder.encode(normalized)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * 创建用户
   */
  async function createUser(email: string, passwordHash: string, name: string): Promise<User> {
    const emailHash = await hashEmail(email)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    // 检查邮箱是否已注册
    const existingIndex = await storage.getJSON<EmailIndex>(`indexes/email/${emailHash}.json`)
    if (existingIndex) {
      throw new Error('EMAIL_EXISTS')
    }

    const user: User = {
      id,
      email: email.toLowerCase().trim(),
      emailHash,
      name,
      passwordHash,
      createdAt: now,
      updatedAt: now
    }

    try {
      // 写用户数据
      await storage.putJSON(`users/${id}.json`, user)
      // 写邮箱索引
      await storage.putJSON(`indexes/email/${emailHash}.json`, { userId: id })
    } catch (err) {
      console.error('R2 write error:', err instanceof Error ? err.message : String(err))
      throw new Error('R2_WRITE_ERROR: ' + (err instanceof Error ? err.message : 'Unknown'))
    }

    return user
  }

  /**
   * 按邮箱查找用户
   */
  async function findByEmail(email: string): Promise<User | null> {
    const emailHash = await hashEmail(email)
    const index = await storage.getJSON<EmailIndex>(`indexes/email/${emailHash}.json`)
    if (!index) return null
    return storage.getJSON<User>(`users/${index.userId}.json`)
  }

  /**
   * 按 ID 查找用户
   */
  async function findById(id: string): Promise<User | null> {
    return storage.getJSON<User>(`users/${id}.json`)
  }

  /**
   * 更新用户信息
   */
  async function updateUser(id: string, updates: Partial<Pick<User, 'name' | 'avatar' | 'passwordHash'>>): Promise<User | null> {
    const user = await storage.getJSON<User>(`users/${id}.json`)
    if (!user) return null

    Object.assign(user, updates, { updatedAt: new Date().toISOString() })
    await storage.putJSON(`users/${id}.json`, user)
    return user
  }

  return { createUser, findByEmail, findById, updateUser, hashEmail }
}