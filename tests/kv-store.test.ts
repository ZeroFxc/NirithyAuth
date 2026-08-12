/**
 * kv-store.ts 单元测试
 * 使用 Mock KVNamespace 测试 session、authCode、accessToken、refreshToken
 */

/// <reference types="@cloudflare/workers-types" />

import { describe, it, expect, beforeEach } from 'vitest'
import { createKVStore } from '../functions/lib/kv-store'

/**
 * Minimal KV-like store for testing
 */
class MockKV {
  private store = new Map<string, { value: string; expiration?: number }>()

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    if (entry.expiration && entry.expiration < Date.now()) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const expiration = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined
    this.store.set(key, { value, expiration })
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }

  async list(options?: { prefix?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean }> {
    const prefix = options?.prefix || ''
    const keys: { name: string }[] = []
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix) && !key.endsWith(':consumed')) {
        const entry = this.store.get(key)!
        if (!entry.expiration || entry.expiration >= Date.now()) {
          keys.push({ name: key })
        }
      }
    }
    return { keys, list_complete: true }
  }

  clear() {
    this.store.clear()
  }
}

describe('Session management', () => {
  let kv: MockKV
  let store: ReturnType<typeof createKVStore>

  beforeEach(() => {
    kv = new MockKV()
    store = createKVStore(kv as any)
  })

  it('should create a session and get userId', async () => {
    const token = await store.session.create('user-123')
    expect(token).toBeTruthy()
    expect(token.length).toBe(48)

    const userId = await store.session.getUserId(token)
    expect(userId).toBe('user-123')
  })

  it('should return null for invalid session token', async () => {
    const userId = await store.session.getUserId('invalid-token')
    expect(userId).toBeNull()
  })

  it('should delete a session', async () => {
    const token = await store.session.create('user-123')
    await store.session.delete(token)
    
    const userId = await store.session.getUserId(token)
    expect(userId).toBeNull()
  })

  it('should generate unique tokens', async () => {
    const token1 = await store.session.create('user-1')
    const token2 = await store.session.create('user-1')
    expect(token1).not.toBe(token2)
  })
})

describe('Auth Code management', () => {
  let kv: MockKV
  let store: ReturnType<typeof createKVStore>

  beforeEach(() => {
    kv = new MockKV()
    store = createKVStore(kv as any)
  })

  it('should create and consume an auth code', async () => {
    const code = await store.authCode.create({
      userId: 'user-1',
      clientId: 'client-1',
      redirectUri: 'https://app.example.com/callback',
      codeChallenge: 'challenge-abc',
      scope: 'profile',
    })

    expect(code).toBeTruthy()

    const data = await store.authCode.consume(code)
    expect(data).not.toBeNull()
    expect(data!.userId).toBe('user-1')
    expect(data!.clientId).toBe('client-1')
    expect(data!.scope).toBe('profile')
  })

  it('should return null when consuming non-existent code', async () => {
    const data = await store.authCode.consume('non-existent')
    expect(data).toBeNull()
  })

  it('should detect replay attack (code reused)', async () => {
    const code = await store.authCode.create({
      userId: 'user-1',
      clientId: 'client-1',
      redirectUri: 'https://app.example.com/callback',
      codeChallenge: 'challenge-abc',
      scope: 'profile',
    })

    // First consumption - should succeed
    const first = await store.authCode.consume(code)
    expect(first).not.toBeNull()

    // Second consumption - should return REPLAY
    const second = await store.authCode.consume(code)
    expect(second).toBe('REPLAY' as any)
  })

  it('should get consumed info after consumption', async () => {
    const code = await store.authCode.create({
      userId: 'user-1',
      clientId: 'client-1',
      redirectUri: 'https://app.example.com/callback',
      codeChallenge: 'challenge-abc',
      scope: 'profile',
    })

    await store.authCode.consume(code)
    const info = await store.authCode.getConsumedInfo(code)
    expect(info).not.toBeNull()
    expect(info!.userId).toBe('user-1')
    expect(info!.clientId).toBe('client-1')
  })
})

describe('Access Token (JTI) management', () => {
  let kv: MockKV
  let store: ReturnType<typeof createKVStore>

  beforeEach(() => {
    kv = new MockKV()
    store = createKVStore(kv as any)
  })

  it('should register and check JTI', async () => {
    await store.accessToken.registerJti('jti-1', 'user-1', 'client-1', 'profile')
    
    // Not revoked initially
    const revoked = await store.accessToken.isRevoked('jti-1')
    expect(revoked).toBe(false)
  })

  it('should revoke a JTI', async () => {
    await store.accessToken.registerJti('jti-2', 'user-1', 'client-1', 'profile')
    await store.accessToken.revokeJti('jti-2')
    
    const revoked = await store.accessToken.isRevoked('jti-2')
    expect(revoked).toBe(true)
  })

  it('should revoke by user and client', async () => {
    await store.accessToken.registerJti('jti-a', 'user-1', 'client-1', 'profile')
    await store.accessToken.registerJti('jti-b', 'user-1', 'client-1', 'email')
    await store.accessToken.registerJti('jti-c', 'user-2', 'client-1', 'profile')

    await store.accessToken.revokeByUserAndClient('user-1', 'client-1')

    expect(await store.accessToken.isRevoked('jti-a')).toBe(true)
    expect(await store.accessToken.isRevoked('jti-b')).toBe(true)
    // user-2's token should not be affected
    expect(await store.accessToken.isRevoked('jti-c')).toBe(false)
  })
})

describe('Refresh Token management', () => {
  let kv: MockKV
  let store: ReturnType<typeof createKVStore>

  beforeEach(() => {
    kv = new MockKV()
    store = createKVStore(kv as any)
  })

  it('should create a refresh token', async () => {
    const { token, familyId } = await store.refreshToken.create('user-1', 'client-1', 'profile')
    expect(token).toBeTruthy()
    expect(familyId).toBeTruthy()
  })

  it('should rotate a refresh token', async () => {
    const { token } = await store.refreshToken.create('user-1', 'client-1', 'profile')
    
    const data = await store.refreshToken.rotate(token)
    expect(data).not.toBeNull()
    expect(data!.userId).toBe('user-1')
    expect(data!.clientId).toBe('client-1')
    expect(data!.scope).toBe('profile')
  })

  it('should return null for invalid token rotation', async () => {
    const data = await store.refreshToken.rotate('invalid-token')
    expect(data).toBeNull()
  })

  it('should detect replay attack on rotation', async () => {
    const { token } = await store.refreshToken.create('user-1', 'client-1', 'profile')
    
    // First rotation succeeds
    await store.refreshToken.rotate(token)
    
    // Second rotation should detect replay
    const result = await store.refreshToken.rotate(token)
    expect(result).toBe('REPLAY' as any)
  })

  it('should delete a refresh token', async () => {
    const { token } = await store.refreshToken.create('user-1', 'client-1', 'profile')
    await store.refreshToken.delete(token)
    
    // Token should no longer be rotatable
    const data = await store.refreshToken.rotate(token)
    // delete doesn't set consumed flag, so it returns null (not REPLAY)
    expect(data).toBeNull()
  })

  it('should revoke by user and client', async () => {
    const { token: t1 } = await store.refreshToken.create('user-1', 'client-1', 'profile')
    const { token: t2 } = await store.refreshToken.create('user-1', 'client-1', 'email')
    const { token: t3 } = await store.refreshToken.create('user-2', 'client-1', 'profile')

    await store.refreshToken.revokeByUserAndClient('user-1', 'client-1')

    // t1 and t2 should be gone
    expect(await store.refreshToken.rotate(t1)).toBeNull()
    expect(await store.refreshToken.rotate(t2)).toBeNull()
    // t3 should still be valid
    const data = await store.refreshToken.rotate(t3)
    expect(data).not.toBeNull()
  })
})
