/**
 * 管理 API (Admin API)
 * 
 * 通过 URL 参数或 JSON Body 即可完成管理操作，返回 JSON。
 * 所有操作需要 Admin Token 认证（通过 ?admin_token= 或 Authorization header）。
 * 
 * 支持的 URL 驱动操作：
 *   GET  /api/admin/users?action=list                    — 列出用户
 *   GET  /api/admin/users?action=create&email=x&password=x&name=x — 创建用户
 *   GET  /api/admin/users?action=get&id=x                — 获取用户
 *   GET  /api/admin/users?action=delete&id=x             — 删除用户
 *   GET  /api/admin/clients?action=list&owner_id=x      — 列出客户端
 *   GET  /api/admin/clients?action=create&name=x&redirect_uris=x  — 创建客户端
 *   GET  /api/admin/clients?action=get&client_id=x      — 获取客户端
 *   GET  /api/admin/clients?action=delete&client_id=x   — 删除客户端
 *   GET  /api/admin/system?action=health                — 系统健康检查
 *   GET  /api/admin/system?action=stats                  — 系统统计
 *   GET  /api/admin/system?action=rotate_keys            — 轮换 JWT 签名密钥
 * 
 * 也支持 POST + JSON Body（参数同上，字段名使用 snake_case）
 */

import {
  createStores, jsonResponse, handleCorsPreflight, isCorsPreflight,
  checkRateLimit, CONSTANTS, constantTimeEquals,
  type Env, type AppStores,
} from '../lib/shared'
import { hashPassword } from '../lib/auth'

/** 从请求中提取 admin token */
function getAdminToken(request: Request, env: Env): string | null {
  // 1. URL 参数 ?admin_token=xxx
  const url = new URL(request.url)
  const urlToken = url.searchParams.get('admin_token')
  if (urlToken) return urlToken

  // 2. Authorization header
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  // 3. X-Admin-Token header
  const headerToken = request.headers.get('X-Admin-Token')
  if (headerToken) return headerToken

  // 4. Body 中的 admin_token（POST JSON 时）
  return null
}

/** 验证 admin token */
function isAdmin(env: Env, token: string | null): boolean {
  if (!token) return false
  const adminToken = env.ADMIN_TOKEN
  if (!adminToken) return false
  return constantTimeEquals(token, adminToken)
}

/** 解析参数：优先 URL query，其次 JSON body */
async function parseParams(request: Request): Promise<Record<string, string>> {
  const url = new URL(request.url)
  const params: Record<string, string> = {}

  // URL query params
  for (const [key, value] of url.searchParams.entries()) {
    if (key !== 'admin_token') {
      params[key] = value
    }
  }

  // POST JSON body 覆盖 URL params
  if (request.method === 'POST') {
    const contentType = request.headers.get('Content-Type') || ''
    if (contentType.includes('application/json')) {
      try {
        const body = await request.json() as Record<string, unknown>
        for (const [key, value] of Object.entries(body)) {
          if (key !== 'admin_token' && typeof value === 'string') {
            params[key] = value
          }
          // redirect_uris 可以是数组
          if (key === 'redirect_uris' && Array.isArray(value)) {
            params[key] = (value as string[]).join(',')
          }
        }
      } catch {
        // body 解析失败，使用 URL params
      }
    }
  }

  return params
}

export async function handleAdminRequest(request: Request, env: Env): Promise<Response> {
  if (isCorsPreflight(request)) {
    return handleCorsPreflight(request)
  }

  // 速率限制
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown'
  const allowed = await checkRateLimit(
    env.AUTH_KV,
    `admin:${clientIp}`,
    60,    // 60 requests
    60,    // per minute
  )
  if (!allowed) {
    return jsonResponse({ success: false, error: 'Rate limited' }, 429, request)
  }

  // 认证
  let adminToken = getAdminToken(request, env)

  // POST 时可能需要从 body 提取 admin_token
  if (!adminToken && request.method === 'POST') {
    const contentType = request.headers.get('Content-Type') || ''
    if (contentType.includes('application/json')) {
      try {
        const body = await request.clone().json() as Record<string, unknown>
        if (typeof body.admin_token === 'string') {
          adminToken = body.admin_token
        }
      } catch {
        // ignore
      }
    }
  }

  if (!isAdmin(env, adminToken)) {
    return jsonResponse({ success: false, error: 'Unauthorized: invalid or missing admin_token' }, 401, request)
  }

  const url = new URL(request.url)
  const path = url.pathname.replace('/api/admin', '')
  const stores = createStores(env)

  // 路由
  if (path.startsWith('/users')) {
    return handleUsersAdmin(request, stores, env)
  }
  if (path.startsWith('/clients')) {
    return handleClientsAdmin(request, stores)
  }
  if (path.startsWith('/system')) {
    return handleSystemAdmin(request, stores, env)
  }

  return jsonResponse({ success: false, error: 'Not Found' }, 404, request)
}

// ============================================================================
// 用户管理
// ============================================================================

async function handleUsersAdmin(request: Request, stores: AppStores, env: Env): Promise<Response> {
  const params = await parseParams(request)
  const action = params.action

  switch (action) {
    case 'list':
      return listUsers(stores, request)
    case 'create':
      return createUserAdmin(params, stores, env, request)
    case 'get':
      return getUser(stores, params.id, request)
    case 'delete':
      return deleteUser(stores, params.id, request)
    default:
      return jsonResponse({ success: false, error: 'Invalid action. Use: list, create, get, delete' }, 400, request)
  }
}

async function listUsers(stores: AppStores, request: Request): Promise<Response> {
  const userIds = await stores.storage.list('users/')
  const users: Array<Record<string, unknown>> = []

  for (const key of userIds) {
    const user = await stores.userStore.findById(key.replace('users/', '').replace('.json', ''))
    if (user) {
      users.push({
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        createdAt: user.createdAt,
      })
    }
  }

  return jsonResponse({ success: true, data: users, count: users.length }, 200, request)
}

async function createUserAdmin(
  params: Record<string, string>,
  stores: AppStores,
  env: Env,
  request: Request,
): Promise<Response> {
  const { email, password, name } = params

  if (!email || !password || !name) {
    return jsonResponse({ success: false, error: 'Missing required params: email, password, name' }, 400, request)
  }
  if (password.length < 8) {
    return jsonResponse({ success: false, error: 'Password must be at least 8 characters' }, 400, request)
  }

  try {
    const passwordHash = await hashPassword(password)
    const user = await stores.userStore.createUser(email, passwordHash, name)
    return jsonResponse({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
    }, 201, request)
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_EXISTS') {
      return jsonResponse({ success: false, error: 'Email already registered' }, 409, request)
    }
    console.error('Admin create user error:', err)
    return jsonResponse({ success: false, error: 'Failed to create user' }, 500, request)
  }
}

async function getUser(stores: AppStores, id: string, request: Request): Promise<Response> {
  if (!id) {
    return jsonResponse({ success: false, error: 'Missing param: id' }, 400, request)
  }
  const user = await stores.userStore.findById(id)
  if (!user) {
    return jsonResponse({ success: false, error: 'User not found' }, 404, request)
  }
  return jsonResponse({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      createdAt: user.createdAt,
    },
  }, 200, request)
}

async function deleteUser(stores: AppStores, id: string, request: Request): Promise<Response> {
  if (!id) {
    return jsonResponse({ success: false, error: 'Missing param: id' }, 400, request)
  }
  const user = await stores.userStore.findById(id)
  if (!user) {
    return jsonResponse({ success: false, error: 'User not found' }, 404, request)
  }

  // 删除用户数据
  await stores.storage.delete(`users/${id}.json`)
  await stores.storage.delete(`indexes/email/${user.emailHash}.json`)

  // 撤销所有 session
  await stores.kvStore.session.deleteAllByUser(id)

  return jsonResponse({ success: true, message: 'User deleted' }, 200, request)
}

// ============================================================================
// 客户端管理
// ============================================================================

async function handleClientsAdmin(request: Request, stores: AppStores): Promise<Response> {
  const params = await parseParams(request)
  const action = params.action

  switch (action) {
    case 'list':
      return listClientsAdmin(stores, params.owner_id, request)
    case 'create':
      return createClientAdmin(params, stores, request)
    case 'get':
      return getClientAdmin(stores, params.client_id, request)
    case 'delete':
      return deleteClientAdmin(stores, params.client_id, request)
    default:
      return jsonResponse({ success: false, error: 'Invalid action. Use: list, create, get, delete' }, 400, request)
  }
}

async function listClientsAdmin(stores: AppStores, ownerId: string, request: Request): Promise<Response> {
  let clients
  if (ownerId) {
    clients = await stores.clientStore.listByOwner(ownerId)
  } else {
    // 列出所有客户端
    const keys = await stores.storage.list('clients/')
    clients = []
    for (const key of keys) {
      const client = await stores.clientStore.findByClientId(
        key.replace('clients/', '').replace('.json', '')
      )
      if (client) clients.push(client)
    }
  }

  const sanitized = clients.map(({ clientSecret, ...rest }) => rest)
  return jsonResponse({ success: true, data: sanitized, count: sanitized.length }, 200, request)
}

async function createClientAdmin(
  params: Record<string, string>,
  stores: AppStores,
  request: Request,
): Promise<Response> {
  const { name, redirect_uris, homepage_url, owner_id, description } = params

  if (!name || !redirect_uris || !owner_id) {
    return jsonResponse({
      success: false,
      error: 'Missing required params: name, redirect_uris, owner_id',
    }, 400, request)
  }

  // redirect_uris 用逗号分隔
  const uris = redirect_uris.split(',').map(u => u.trim()).filter(Boolean)

  // 验证 URL 格式
  for (const uri of uris) {
    try {
      new URL(uri)
    } catch {
      return jsonResponse({ success: false, error: `Invalid redirect_uri: ${uri}` }, 400, request)
    }
  }

  // 检查 owner 是否存在
  const owner = await stores.userStore.findById(owner_id)
  if (!owner) {
    return jsonResponse({ success: false, error: 'Owner user not found' }, 404, request)
  }

  const client = await stores.clientStore.createClient({
    name,
    description: description || '',
    redirectUris: uris,
    homepageUrl: homepage_url || '',
    ownerId: owner_id,
  })

  // 返回完整数据（含 secret，仅此一次）
  return jsonResponse({ success: true, data: client }, 201, request)
}

async function getClientAdmin(stores: AppStores, clientId: string, request: Request): Promise<Response> {
  if (!clientId) {
    return jsonResponse({ success: false, error: 'Missing param: client_id' }, 400, request)
  }
  const client = await stores.clientStore.findByClientId(clientId)
  if (!client) {
    return jsonResponse({ success: false, error: 'Client not found' }, 404, request)
  }
  return jsonResponse({ success: true, data: client }, 200, request)
}

async function deleteClientAdmin(stores: AppStores, clientId: string, request: Request): Promise<Response> {
  if (!clientId) {
    return jsonResponse({ success: false, error: 'Missing param: client_id' }, 400, request)
  }
  const client = await stores.clientStore.findByClientId(clientId)
  if (!client) {
    return jsonResponse({ success: false, error: 'Client not found' }, 404, request)
  }

  await stores.clientStore.deleteClient(clientId)
  return jsonResponse({ success: true, message: 'Client deleted' }, 200, request)
}

// ============================================================================
// 系统管理
// ============================================================================

async function handleSystemAdmin(request: Request, stores: AppStores, env: Env): Promise<Response> {
  const params = await parseParams(request)
  const action = params.action

  switch (action) {
    case 'health':
      return systemHealth(stores, env, request)
    case 'stats':
      return systemStats(stores, request)
    case 'rotate_keys':
      return rotateKeys(stores, request)
    default:
      return jsonResponse({ success: false, error: 'Invalid action. Use: health, stats, rotate_keys' }, 400, request)
  }
}

async function systemHealth(stores: AppStores, env: Env, request: Request): Promise<Response> {
  return jsonResponse({
    success: true,
    data: {
      status: 'healthy',
      bindings: {
        r2: !!env.AUTH_BUCKET,
        kv: !!env.AUTH_KV,
      },
      jwt_algorithm: 'RS256',
      pbkdf2_iterations: CONSTANTS.PBKDF2_ITERATIONS,
      timestamp: new Date().toISOString(),
    },
  }, 200, request)
}

async function systemStats(stores: AppStores, request: Request): Promise<Response> {
  const userKeys = await stores.storage.list('users/')
  const clientKeys = await stores.storage.list('clients/')

  return jsonResponse({
    success: true,
    data: {
      users: userKeys.length,
      clients: clientKeys.length,
    },
  }, 200, request)
}

async function rotateKeys(stores: AppStores, request: Request): Promise<Response> {
  const newKid = await stores.crypto.rotateKeys()
  return jsonResponse({
    success: true,
    data: {
      new_key_id: newKid,
      message: 'JWT signing key rotated. Old key remains valid for verification until next rotation.',
    },
  }, 200, request)
}
