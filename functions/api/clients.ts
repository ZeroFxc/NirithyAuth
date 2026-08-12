/**
 * OAuth 客户端管理 API
 * 
 * GET    /api/clients          — 获取当前用户的客户端列表
 * POST   /api/clients          — 创建新客户端
 * GET    /api/clients/:id      — 获取客户端详情
 * PUT    /api/clients/:id      — 更新客户端
 * DELETE /api/clients/:id      — 删除客户端
 * POST   /api/clients/:id/regenerate-secret — 重新生成 secret
 */

import {
  createStores, jsonResponse, getSessionToken,
  handleCorsPreflight, isCorsPreflight,
  type Env, type AppStores,
} from '../lib/shared'

export async function handleClientsRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace('/api/clients', '')

  if (isCorsPreflight(request)) {
    return handleCorsPreflight(request)
  }

  const stores = createStores(env)

  // 所有路由都需要登录
  const authResult = await requireAuth(request, stores)
  if (!authResult.ok) {
    return jsonResponse({ success: false, error: authResult.error }, 401, request)
  }

  const userId = authResult.userId!

  // 路由匹配
  if (path === '' || path === '/') {
    if (request.method === 'GET') return listClients(stores, userId, request)
    if (request.method === 'POST') return createClient(request, stores, userId)
    return jsonResponse({ success: false, error: 'Method Not Allowed' }, 405, request)
  }

  // /:id/regenerate-secret
  const regenMatch = path.match(/^\/([^/]+)\/regenerate-secret$/)
  if (regenMatch) {
    if (request.method !== 'POST') {
      return jsonResponse({ success: false, error: 'Method Not Allowed' }, 405, request)
    }
    return regenerateSecret(stores, userId, regenMatch[1], request)
  }

  // /:id
  const idMatch = path.match(/^\/([^/]+)$/)
  if (idMatch) {
    const clientId = idMatch[1]
    if (request.method === 'GET') return getClient(stores, userId, clientId, request)
    if (request.method === 'PUT') return updateClient(request, stores, userId, clientId)
    if (request.method === 'DELETE') return deleteClient(stores, userId, clientId, request)
    return jsonResponse({ success: false, error: 'Method Not Allowed' }, 405, request)
  }

  return jsonResponse({ success: false, error: 'Not Found' }, 404, request)
}

/** 验证登录 */
async function requireAuth(
  request: Request,
  stores: AppStores,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const sessionToken = getSessionToken(request)
  if (!sessionToken) return { ok: false, error: 'Please login first' }

  const userId = await stores.kvStore.session.getUserId(sessionToken)
  if (!userId) return { ok: false, error: 'Session expired' }

  return { ok: true, userId }
}

/** 获取客户端列表 */
async function listClients(stores: AppStores, userId: string, request: Request): Promise<Response> {
  const clients = await stores.clientStore.listByOwner(userId)
  const sanitized = clients.map(({ clientSecret, ...rest }) => rest)
  return jsonResponse({ success: true, data: sanitized }, 200, request)
}

/** 创建客户端 */
async function createClient(request: Request, stores: AppStores, userId: string): Promise<Response> {
  try {
    const body = await request.json() as {
      name?: string
      description?: string
      redirectUris?: string[]
      homepageUrl?: string
      logoUrl?: string
    }

    if (!body.name || !body.redirectUris || body.redirectUris.length === 0) {
      return jsonResponse({ success: false, error: 'Missing name or redirectUris' }, 400, request)
    }

    // 验证 redirect_uri 格式
    for (const uri of body.redirectUris) {
      try {
        new URL(uri)
      } catch {
        return jsonResponse({ success: false, error: `Invalid redirect_uri: ${uri}` }, 400, request)
      }
    }

    const client = await stores.clientStore.createClient({
      name: body.name,
      description: body.description || '',
      redirectUris: body.redirectUris,
      homepageUrl: body.homepageUrl || '',
      ownerId: userId,
    })

    // 创建时返回 secret（仅此一次明文返回）
    return jsonResponse({ success: true, data: client }, 201, request)
  } catch (err) {
    console.error('Create client error:', err)
    return jsonResponse({ success: false, error: 'Failed to create client' }, 500, request)
  }
}

/** 获取客户端详情 */
async function getClient(stores: AppStores, userId: string, clientId: string, request: Request): Promise<Response> {
  const client = await stores.clientStore.findByClientId(clientId)
  if (!client || client.ownerId !== userId) {
    return jsonResponse({ success: false, error: 'Client not found' }, 404, request)
  }

  const { clientSecret, ...safe } = client
  return jsonResponse({ success: true, data: safe }, 200, request)
}

/** 更新客户端 */
async function updateClient(request: Request, stores: AppStores, userId: string, clientId: string): Promise<Response> {
  try {
    const client = await stores.clientStore.findByClientId(clientId)
    if (!client || client.ownerId !== userId) {
      return jsonResponse({ success: false, error: 'Client not found' }, 404, request)
    }

    const body = await request.json() as {
      name?: string
      description?: string
      redirectUris?: string[]
      homepageUrl?: string
      logoUrl?: string
    }

    const updates: Partial<Pick<typeof client, 'name' | 'description' | 'homepageUrl' | 'redirectUris'>> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.redirectUris !== undefined) {
      for (const uri of body.redirectUris) {
        try {
          new URL(uri)
        } catch {
          return jsonResponse({ success: false, error: `Invalid redirect_uri: ${uri}` }, 400, request)
        }
      }
      updates.redirectUris = body.redirectUris
    }
    if (body.homepageUrl !== undefined) updates.homepageUrl = body.homepageUrl

    const updated = await stores.clientStore.updateClient(clientId, updates)
    if (!updated) {
      return jsonResponse({ success: false, error: 'Update failed' }, 500, request)
    }

    const { clientSecret, ...safe } = updated
    return jsonResponse({ success: true, data: safe }, 200, request)
  } catch (err) {
    console.error('Update client error:', err)
    return jsonResponse({ success: false, error: 'Failed to update client' }, 500, request)
  }
}

/** 删除客户端 */
async function deleteClient(stores: AppStores, userId: string, clientId: string, request: Request): Promise<Response> {
  const client = await stores.clientStore.findByClientId(clientId)
  if (!client || client.ownerId !== userId) {
    return jsonResponse({ success: false, error: 'Client not found' }, 404, request)
  }

  await stores.clientStore.deleteClient(clientId)
  return jsonResponse({ success: true, message: 'Client deleted' }, 200, request)
}

/** 重新生成 secret */
async function regenerateSecret(stores: AppStores, userId: string, clientId: string, request: Request): Promise<Response> {
  const client = await stores.clientStore.findByClientId(clientId)
  if (!client || client.ownerId !== userId) {
    return jsonResponse({ success: false, error: 'Client not found' }, 404, request)
  }

  const updated = await stores.clientStore.regenerateSecret(clientId)
  if (!updated) {
    return jsonResponse({ success: false, error: 'Failed to regenerate secret' }, 500, request)
  }

  return jsonResponse({ success: true, data: { clientSecret: updated.clientSecret } }, 200, request)
}
