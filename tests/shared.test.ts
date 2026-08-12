/**
 * shared.ts 单元测试
 * 测试 CORS、Cookie 提取、常量
 */

import { describe, it, expect } from 'vitest'
import { jsonResponse, handleCorsPreflight, isCorsPreflight, getSessionToken, getBearerToken, CONSTANTS } from '../functions/lib/shared'

describe('jsonResponse', () => {
  it('should create a JSON response with correct headers', () => {
    const req = new Request('https://example.com/api/test', {
      headers: { Origin: 'https://app.example.com' },
    })
    const res = jsonResponse({ success: true }, 200, req)
    
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(res.headers.get('Vary')).toBe('Origin')
  })

  it('should default to * when no Origin header', () => {
    const res = jsonResponse({ success: true })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('should handle different status codes', () => {
    const req = new Request('https://example.com')
    const res = jsonResponse({ error: 'Not Found' }, 404, req)
    expect(res.status).toBe(404)
  })
})

describe('CORS preflight', () => {
  it('should detect OPTIONS requests', () => {
    const req = new Request('https://example.com', { method: 'OPTIONS' })
    expect(isCorsPreflight(req)).toBe(true)
  })

  it('should not detect non-OPTIONS requests', () => {
    const req = new Request('https://example.com', { method: 'GET' })
    expect(isCorsPreflight(req)).toBe(false)
  })

  it('should return 204 with CORS headers', () => {
    const req = new Request('https://example.com', {
      method: 'OPTIONS',
      headers: { Origin: 'https://app.example.com' },
    })
    const res = handleCorsPreflight(req)
    
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET')
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
  })
})

describe('Token extraction', () => {
  it('should extract session token from Cookie', () => {
    const req = new Request('https://example.com', {
      headers: { Cookie: 'session=abc123; other=xyz' },
    })
    expect(getSessionToken(req)).toBe('abc123')
  })

  it('should return null when no session cookie', () => {
    const req = new Request('https://example.com')
    expect(getSessionToken(req)).toBeNull()
  })

  it('should return null when cookie header has no session', () => {
    const req = new Request('https://example.com', {
      headers: { Cookie: 'other=xyz' },
    })
    expect(getSessionToken(req)).toBeNull()
  })

  it('should extract Bearer token from Authorization header', () => {
    const req = new Request('https://example.com', {
      headers: { Authorization: 'Bearer my-token-123' },
    })
    expect(getBearerToken(req)).toBe('my-token-123')
  })

  it('should return null when no Authorization header', () => {
    const req = new Request('https://example.com')
    expect(getBearerToken(req)).toBeNull()
  })

  it('should return null for non-Bearer auth', () => {
    const req = new Request('https://example.com', {
      headers: { Authorization: 'Basic abc123' },
    })
    expect(getBearerToken(req)).toBeNull()
  })
})

describe('Constants', () => {
  it('should have correct TTL values', () => {
    expect(CONSTANTS.AUTH_CODE_TTL).toBe(300)        // 5 min
    expect(CONSTANTS.ACCESS_TOKEN_TTL).toBe(3600)    // 1 hour
    expect(CONSTANTS.REFRESH_TOKEN_TTL).toBe(2592000) // 30 days
    expect(CONSTANTS.SESSION_TTL).toBe(86400)        // 24 hours
  })

  it('should have NIST-recommended PBKDF2 iterations', () => {
    expect(CONSTANTS.PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(100000)
  })

  it('should have rate limit constants', () => {
    expect(CONSTANTS.RATE_LIMIT_LOGIN_MAX).toBeGreaterThan(0)
    expect(CONSTANTS.RATE_LIMIT_REGISTER_MAX).toBeGreaterThan(0)
  })
})
