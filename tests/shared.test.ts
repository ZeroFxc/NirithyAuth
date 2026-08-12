/**
 * shared.ts 单元测试
 * 测试 CORS、Cookie 提取、常量
 */

import { describe, it, expect } from 'vitest'
import {
  jsonResponse, handleCorsPreflight, isCorsPreflight,
  getSessionToken, getBearerToken, constantTimeEquals,
  extractBasicAuth, extractClientCredentials,
  CONSTANTS,
} from '../functions/lib/shared'

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

  it('should return false for non-string inputs', () => {
    expect(constantTimeEquals('abc', null as any)).toBe(false)
    expect(constantTimeEquals(null as any, 'abc')).toBe(false)
    expect(constantTimeEquals(undefined as any, undefined as any)).toBe(false)
  })
})

describe('extractBasicAuth', () => {
  it('should extract credentials from Basic auth header', () => {
    const encoded = btoa('client123:secret456')
    const req = new Request('https://example.com', {
      headers: { Authorization: `Basic ${encoded}` },
    })
    const creds = extractBasicAuth(req)
    expect(creds).not.toBeNull()
    expect(creds!.clientId).toBe('client123')
    expect(creds!.clientSecret).toBe('secret456')
  })

  it('should return null for non-Basic auth', () => {
    const req = new Request('https://example.com', {
      headers: { Authorization: 'Bearer token123' },
    })
    expect(extractBasicAuth(req)).toBeNull()
  })

  it('should return null when no Authorization header', () => {
    const req = new Request('https://example.com')
    expect(extractBasicAuth(req)).toBeNull()
  })

  it('should handle client_id with colon in password', () => {
    const encoded = btoa('client:pass:with:colons')
    const req = new Request('https://example.com', {
      headers: { Authorization: `Basic ${encoded}` },
    })
    const creds = extractBasicAuth(req)
    expect(creds!.clientId).toBe('client')
    expect(creds!.clientSecret).toBe('pass:with:colons')
  })
})

describe('extractClientCredentials', () => {
  it('should prefer body credentials (client_secret_post)', () => {
    const req = new Request('https://example.com', { method: 'POST' })
    const body = { client_id: 'body-client', client_secret: 'body-secret' }
    const creds = extractClientCredentials(req, body)
    expect(creds!.clientId).toBe('body-client')
    expect(creds!.clientSecret).toBe('body-secret')
  })

  it('should fall back to Basic auth when body has no credentials', () => {
    const encoded = btoa('basic-client:basic-secret')
    const req = new Request('https://example.com', {
      headers: { Authorization: `Basic ${encoded}` },
    })
    const body = { grant_type: 'authorization_code' }
    const creds = extractClientCredentials(req, body)
    expect(creds!.clientId).toBe('basic-client')
    expect(creds!.clientSecret).toBe('basic-secret')
  })

  it('should return null when no credentials found', () => {
    const req = new Request('https://example.com')
    const body = { grant_type: 'authorization_code' }
    expect(extractClientCredentials(req, body)).toBeNull()
  })
})
