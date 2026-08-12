/**
 * auth.ts 单元测试
 * 测试密码哈希、JWT 签发与验证、常量时间比较
 */

import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, createJWT, verifyJWT, constantTimeEquals } from '../functions/lib/auth'

describe('Password Hashing (PBKDF2)', () => {
  it('should hash a password and verify it', async () => {
    const password = 'TestPass123!'
    const hash = await hashPassword(password)
    
    expect(hash).toContain('pbkdf2:')
    expect(hash.split(':').length).toBe(4) // pbkdf2:iterations:salt:hash
    
    const valid = await verifyPassword(password, hash)
    expect(valid).toBe(true)
  })

  it('should reject wrong password', async () => {
    const password = 'CorrectPassword'
    const hash = await hashPassword(password)
    
    const valid = await verifyPassword('WrongPassword', hash)
    expect(valid).toBe(false)
  })

  it('should generate different salts for same password', async () => {
    const password = 'SamePassword'
    const hash1 = await hashPassword(password)
    const hash2 = await hashPassword(password)
    
    expect(hash1).not.toBe(hash2)
    
    // Both should verify
    expect(await verifyPassword(password, hash1)).toBe(true)
    expect(await verifyPassword(password, hash2)).toBe(true)
  })

  it('should include iteration count in hash format', async () => {
    const hash = await hashPassword('test')
    const parts = hash.split(':')
    expect(parts[0]).toBe('pbkdf2')
    expect(parseInt(parts[1])).toBeGreaterThanOrEqual(100000)
  })
})

describe('JWT Sign and Verify', () => {
  const secret = 'test-secret-key'

  it('should create and verify a valid JWT', async () => {
    const payload = {
      sub: 'user123',
      client_id: 'client456',
      scope: 'profile email',
    }

    const token = await createJWT(payload, secret, 3600)
    expect(token).toBeTruthy()
    expect(token.split('.').length).toBe(3) // header.payload.signature

    const verified = await verifyJWT(token, secret)
    expect(verified).not.toBeNull()
    expect(verified!.sub).toBe('user123')
    expect(verified!.client_id).toBe('client456')
    expect(verified!.scope).toBe('profile email')
    expect(verified!.jti).toBeDefined()
    expect(typeof verified!.jti).toBe('string')
    expect(verified!.iat).toBeDefined()
    expect((verified!.exp as number) - (verified!.iat as number)).toBe(3600)
  })

  it('should reject JWT with wrong secret', async () => {
    const token = await createJWT({ sub: 'user1' }, secret, 3600)
    const verified = await verifyJWT(token, 'wrong-secret')
    expect(verified).toBeNull()
  })

  it('should reject expired JWT', async () => {
    // Create token with negative TTL (already expired)
    const token = await createJWT({ sub: 'user1' }, secret, -1)
    // Wait a tiny bit to ensure it's expired
    await new Promise(resolve => setTimeout(resolve, 100))
    const verified = await verifyJWT(token, secret)
    expect(verified).toBeNull()
  })

  it('should include correct algorithm in header', async () => {
    const token = await createJWT({ sub: 'user1' }, secret, 3600)
    const header = JSON.parse(atob(token.split('.')[0]))
    expect(header.alg).toBe('HS256')
    expect(header.typ).toBe('JWT')
  })
})

describe('constantTimeEquals', () => {
  it('should return true for equal strings', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true)
    expect(constantTimeEquals('', '')).toBe(true)
  })

  it('should return false for unequal strings', () => {
    expect(constantTimeEquals('abc', 'abd')).toBe(false)
    expect(constantTimeEquals('abc', 'abcd')).toBe(false)
    expect(constantTimeEquals('abc', 'ab')).toBe(false)
  })

  it('should return false for different types', () => {
    expect(constantTimeEquals('abc', null as any)).toBe(false)
    expect(constantTimeEquals(null as any, 'abc')).toBe(false)
    expect(constantTimeEquals(null as any, null as any)).toBe(false)
  })
})
