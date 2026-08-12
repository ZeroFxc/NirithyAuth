/**
 * crypto.ts 单元测试
 * 测试 RS256 密钥对生成、JWT 签名验证、JWKS 导出
 */

/// <reference types="@cloudflare/workers-types" />

import { describe, it, expect, beforeEach } from 'vitest'
import { createCrypto } from '../functions/lib/crypto'

class MockKV {
  private store = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }

  async list(options?: { prefix?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean }> {
    const prefix = options?.prefix || ''
    const keys: { name: string }[] = []
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        keys.push({ name: key })
      }
    }
    return { keys, list_complete: true }
  }

  clear() {
    this.store.clear()
  }
}

describe('RS256 Crypto - Key Management', () => {
  let kv: MockKV
  let crypto: ReturnType<typeof createCrypto>

  beforeEach(() => {
    kv = new MockKV()
    crypto = createCrypto(kv as any)
  })

  it('should generate and persist RSA key pair on first use', async () => {
    // First sign will trigger key generation
    const token = await crypto.signJWT({ sub: 'user1' }, 3600)
    expect(token).toBeTruthy()
    expect(token.split('.').length).toBe(3)

    // Key should be persisted in KV
    const stored = await kv.get('jwt_key_store')
    expect(stored).toBeTruthy()
    const keyStore = JSON.parse(stored!)
    expect(keyStore.current.kid).toBeTruthy()
    expect(keyStore.current.privateKeyJwk).toBeTruthy()
    expect(keyStore.current.publicKeyJwk).toBeTruthy()
  })

  it('should reuse key pair on subsequent calls', async () => {
    const token1 = await crypto.signJWT({ sub: 'user1' }, 3600)
    const token2 = await crypto.signJWT({ sub: 'user2' }, 3600)

    // Both tokens should use the same key
    const header1 = JSON.parse(atob(token1.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')))
    const header2 = JSON.parse(atob(token2.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')))

    expect(header1.kid).toBe(header2.kid)
  })

  it('should include kid and alg in JWT header', async () => {
    const token = await crypto.signJWT({ sub: 'user1' }, 3600)
    const header = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')))

    expect(header.alg).toBe('RS256')
    expect(header.typ).toBe('JWT')
    expect(header.kid).toBeTruthy()
  })
})

describe('RS256 Crypto - JWT Sign and Verify', () => {
  let kv: MockKV
  let crypto: ReturnType<typeof createCrypto>

  beforeEach(() => {
    kv = new MockKV()
    crypto = createCrypto(kv as any)
  })

  it('should create and verify a valid RS256 JWT', async () => {
    const payload = {
      sub: 'user123',
      client_id: 'client456',
      scope: 'profile email',
    }

    const token = await crypto.signJWT(payload, 3600)

    const verified = await crypto.verifyJWT(token)
    expect(verified).not.toBeNull()
    expect(verified!.sub).toBe('user123')
    expect(verified!.client_id).toBe('client456')
    expect(verified!.scope).toBe('profile email')
    expect(verified!.jti).toBeDefined()
    expect(typeof verified!.jti).toBe('string')
  })

  it('should reject tampered JWT', async () => {
    const token = await crypto.signJWT({ sub: 'user1' }, 3600)

    // Tamper with payload
    const parts = token.split('.')
    const tamperedPayload = btoa(JSON.stringify({ sub: 'hacker', exp: 9999999999 }))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`

    const verified = await crypto.verifyJWT(tamperedToken)
    expect(verified).toBeNull()
  })

  it('should reject expired JWT', async () => {
    const token = await crypto.signJWT({ sub: 'user1' }, -1)
    await new Promise(resolve => setTimeout(resolve, 100))
    const verified = await crypto.verifyJWT(token)
    expect(verified).toBeNull()
  })

  it('should reject JWT with unknown kid', async () => {
    const token = await crypto.signJWT({ sub: 'user1' }, 3600)

    // Replace kid in header
    const parts = token.split('.')
    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')))
    header.kid = 'unknown-kid'
    const fakeHeader = btoa(JSON.stringify(header))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const fakeToken = `${fakeHeader}.${parts[1]}.${parts[2]}`

    const verified = await crypto.verifyJWT(fakeToken)
    expect(verified).toBeNull()
  })

  it('should preserve caller-provided jti', async () => {
    const customJti = 'my-custom-jti-12345'
    const token = await crypto.signJWT({ sub: 'user1', jti: customJti }, 3600)

    const verified = await crypto.verifyJWT(token)
    expect(verified!.jti).toBe(customJti)
  })
})

describe('RS256 Crypto - JWKS', () => {
  let kv: MockKV
  let crypto: ReturnType<typeof createCrypto>

  beforeEach(() => {
    kv = new MockKV()
    crypto = createCrypto(kv as any)
  })

  it('should return JWKS with at least one key', async () => {
    // Trigger key generation
    await crypto.signJWT({ sub: 'user1' }, 3600)

    const jwks = await crypto.getJwks()
    expect(jwks.keys.length).toBeGreaterThanOrEqual(1)

    const key = jwks.keys[0]
    expect(key.kty).toBe('RSA')
    expect(key.alg).toBe('RS256')
    expect(key.use).toBe('sig')
    expect(key.kid).toBeTruthy()
    expect(key.n).toBeTruthy()  // RSA modulus
    expect(key.e).toBeTruthy()  // RSA exponent
  })

  it('should return previous key after rotation', async () => {
    await crypto.signJWT({ sub: 'user1' }, 3600)
    const jwksBefore = await crypto.getJwks()
    expect(jwksBefore.keys.length).toBe(1)

    await crypto.rotateKeys()

    const jwksAfter = await crypto.getJwks()
    expect(jwksAfter.keys.length).toBe(2)

    // New key should be first
    const newKey = jwksAfter.keys[0]
    const oldKey = jwksAfter.keys[1]
    expect(newKey.kid).not.toBe(oldKey.kid)
  })

  it('should verify tokens signed with old key after rotation', async () => {
    const token = await crypto.signJWT({ sub: 'user1' }, 3600)
    await crypto.rotateKeys()

    // Old token should still verify (previous key is retained)
    const verified = await crypto.verifyJWT(token)
    expect(verified).not.toBeNull()
    expect(verified!.sub).toBe('user1')
  })
})
