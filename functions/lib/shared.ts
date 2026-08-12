/**
 * 共享模块 - 提取公共类型、CORS、Store 工厂和常量
 * 消除各 API 文件中的重复代码
 */

import { createR2Storage } from './storage'
import { createUserStore } from './user-store'
import { createClientStore } from './client-store'
import { createKVStore } from './kv-store'
import { createAuthorizationStore } from './authorization-store'
import { createCrypto } from './crypto'

// ============================================================================
// 环境类型
// ============================================================================

export interface Env {
  AUTH_BUCKET: R2Bucket
  AUTH_KV: KVNamespace
  JWT_SECRET?: string
}

// ============================================================================
// 常量
// ============================================================================

export const CONSTANTS = {
  // Token TTL (seconds)
  AUTH_CODE_TTL: 300,          // 5 minutes
  ACCESS_TOKEN_TTL: 3600,     // 1 hour
  REFRESH_TOKEN_TTL: 2592000,  // 30 days
  SESSION_TTL: 86400,          // 24 hours

  // PBKDF2
  PBKDF2_ITERATIONS: 600000,   // NIST SP 800-132 recommended minimum
  PBKDF2_KEY_LENGTH: 256,      // bits

  // Rate limiting
  RATE_LIMIT_LOGIN_MAX: 10,     // max attempts per window
  RATE_LIMIT_LOGIN_WINDOW: 300, // 5 minutes window
  RATE_LIMIT_REGISTER_MAX: 5,
  RATE_LIMIT_REGISTER_WINDOW: 3600, // 1 hour

  // Cookie
  SESSION_COOKIE_NAME: 'session',
  SESSION_COOKIE_MAX_AGE: 86400,

  // JWT
  JWT_ALG: 'HS256',
  JWT_TYP: 'JWT',

  // Default JWT secret (MUST be overridden in production via env var)
  DEFAULT_JWT_SECRET: 'auth-system-jwt-secret-change-in-production',
} as const

// OAuth2 scope definitions
export const SCOPE_DEFINITIONS: Record<string, { description: string; icon: string; label: string }> = {
  profile: { description: 'Read your public profile (name, avatar)', icon: '\u{1F464}', label: 'Read your public profile (nickname, avatar)' },
  email: { description: 'Read your email address', icon: '\u{1F4E7}', label: 'Read your email address' },
  openid: { description: 'Authenticate your identity', icon: '\u{1F511}', label: 'Verify your identity' },
}

// OAuth2 standard error codes
export const OAUTH_ERRORS = {
  INVALID_REQUEST: 'invalid_request',
  INVALID_CLIENT: 'invalid_client',
  INVALID_GRANT: 'invalid_grant',
  INVALID_TOKEN: 'invalid_token',
  UNSUPPORTED_GRANT_TYPE: 'unsupported_grant_type',
  ACCESS_DENIED: 'access_denied',
  SERVER_ERROR: 'server_error',
  UNAUTHORIZED: 'unauthorized',
} as const

// ============================================================================
// CORS 处理
// ============================================================================

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
}

/**
 * 创建带 CORS 头的 JSON 响应
 * 修复：使用请求 Origin 而非通配符 *，以兼容 credentials: true
 */
export function jsonResponse(data: unknown, status: number = 200, request?: Request): Response {
  const origin = request?.headers.get('Origin') || '*'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    ...CORS_HEADERS,
  }
  return new Response(JSON.stringify(data), { status, headers })
}

/**
 * 处理 CORS 预检请求
 */
export function handleCorsPreflight(request: Request): Response {
  const origin = request.headers.get('Origin') || '*'
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      ...CORS_HEADERS,
    },
  })
}

/**
 * 检查是否为 CORS 预检请求
 */
export function isCorsPreflight(request: Request): boolean {
  return request.method === 'OPTIONS'
}

// ============================================================================
// Cookie / Token 提取
// ============================================================================

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

/** 从 Cookie 中提取 session token */
export function getSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie')
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`${CONSTANTS.SESSION_COOKIE_NAME}=([^;]+)`))
  return match ? match[1] : null
}

/** 从 Authorization header 提取 Bearer token */
export function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  return authHeader.slice(7)
}

/** 设置 session cookie */
export function setSessionCookie(response: Response, token: string): void {
  const secure = isProductionUrl(response.url)
  response.headers.set(
    'Set-Cookie',
    `${CONSTANTS.SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CONSTANTS.SESSION_COOKIE_MAX_AGE}${secure ? '; Secure' : ''}`
  )
}

/** 清除 session cookie */
export function clearSessionCookie(response: Response): void {
  const secure = isProductionUrl(response.url)
  response.headers.set(
    'Set-Cookie',
    `${CONSTANTS.SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
  )
}

/** 判断是否为 HTTPS 生产环境 */
function isProductionUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

/** 从 Authorization header 提取 HTTP Basic credentials */
export function extractBasicAuth(request: Request): { clientId: string; clientSecret: string } | null {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Basic ')) return null

  try {
    const decoded = atob(authHeader.slice(6))
    const colonIdx = decoded.indexOf(':')
    if (colonIdx === -1) return null
    return {
      clientId: decoded.slice(0, colonIdx),
      clientSecret: decoded.slice(colonIdx + 1),
    }
  } catch {
    return null
  }
}

/**
 * 从请求中提取 client credentials（支持 client_secret_post 和 client_secret_basic）
 */
export function extractClientCredentials(
  request: Request,
  body: Record<string, string>
): { clientId: string; clientSecret: string } | null {
  // 优先从 body 中获取 (client_secret_post)
  if (body.client_id && body.client_secret) {
    return { clientId: body.client_id, clientSecret: body.client_secret }
  }

  // 尝试 HTTP Basic (client_secret_basic)
  return extractBasicAuth(request)
}

// ============================================================================
// Store 工厂
// ============================================================================

export interface AppStores {
  storage: ReturnType<typeof createR2Storage>
  userStore: ReturnType<typeof createUserStore>
  clientStore: ReturnType<typeof createClientStore>
  kvStore: ReturnType<typeof createKVStore>
  authStore: ReturnType<typeof createAuthorizationStore>
  crypto: ReturnType<typeof createCrypto>
}

/**
 * 从 Env 创建所有 Store 实例
 * 消除各 API 文件中重复的初始化代码
 */
export function createStores(env: Env): AppStores {
  const storage = createR2Storage(env.AUTH_BUCKET)
  return {
    storage,
    userStore: createUserStore(storage),
    clientStore: createClientStore(storage),
    kvStore: createKVStore(env.AUTH_KV),
    authStore: createAuthorizationStore(storage),
    crypto: createCrypto(env.AUTH_KV),
  }
}

/**
 * 获取 JWT 密钥
 */
export function getJwtSecret(env: Env): string {
  return env.JWT_SECRET || CONSTANTS.DEFAULT_JWT_SECRET
}

// ============================================================================
// 速率限制（基于 KV 的简易实现）
// ============================================================================

/**
 * 检查速率限制
 * @returns true 如果允许请求, false 如果被限流
 */
export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<boolean> {
  const kvKey = `rate_limit:${key}`
  const raw = await kv.get(kvKey)
  let count = 0
  let timestamp = Date.now()

  if (raw) {
    const parsed = JSON.parse(raw) as { count: number; timestamp: number }
    const elapsed = (Date.now() - parsed.timestamp) / 1000
    if (elapsed < windowSeconds) {
      count = parsed.count
      timestamp = parsed.timestamp
    }
  }

  if (count >= maxAttempts) {
    return false
  }

  await kv.put(kvKey, JSON.stringify({ count: count + 1, timestamp }), {
    expirationTtl: windowSeconds,
  })

  return true
}

// ============================================================================
// API 响应类型
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
}
