/**
 * 用户个人中心 API
 * 
 * GET    /api/user/profile          — 获取个人信息
 * PUT    /api/user/profile          — 更新个人信息
 * GET    /api/user/authorizations   — 获取已授权应用列表
 * DELETE /api/user/authorizations/:clientId — 撤销授权
 */

import {
  createStores, jsonResponse, getSessionToken,
  handleCorsPreflight, isCorsPreflight,
  type Env, type AppStores,
} from '../lib/shared'

export async function handleUserRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace('/api/user', '')

  if (isCorsPreflight(request)) {
    return handleCorsPreflight(request)
  }

  const stores = createStores(env)

  // 验证登录状态
  const sessionToken = getSessionToken(request)
  if (!sessionToken) {
    return jsonResponse({ success: false, error: '请先登录' }, 401, request)
  }
  const userId = await stores.kvStore.session.getUserId(sessionToken)
  if (!userId) {
    return jsonResponse({ success: false, error: '会话已过期' }, 401, request)
  }

  // /authorizations/:clientId
  if (path.startsWith('/authorizations/')) {
    const clientId = path.replace('/authorizations/', '')
    if (request.method === 'DELETE') {
      return handleRevokeAuthorization(stores, userId, clientId, request)
    }
    return jsonResponse({ success: false, error: 'Method Not Allowed' }, 405, request)
  }

  if (path === '/authorizations') {
    return handleListAuthorizations(stores, userId, request)
  }

  if (path === '/profile') {
    return handleProfile(request, stores, userId)
  }

  return jsonResponse({ success: false, error: 'Not Found' }, 404, request)
}

/** 获取/更新个人信息 */
async function handleProfile(
  request: Request,
  stores: AppStores,
  userId: string,
): Promise<Response> {
  if (request.method === 'GET') {
    const user = await stores.userStore.findById(userId)
    if (!user) {
      return jsonResponse({ success: false, error: '用户不存在' }, 404, request)
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

  if (request.method === 'PUT') {
    try {
      const body = await request.json() as { name?: string; avatar?: string }
      const updates: Record<string, string> = {}

      if (body.name !== undefined) {
        const trimmed = body.name.trim()
        if (!trimmed || trimmed.length > 50) {
          return jsonResponse({ success: false, error: '昵称长度为1-50个字符' }, 400, request)
        }
        updates.name = trimmed
      }
      if (body.avatar !== undefined) {
        updates.avatar = body.avatar
      }

      const updated = await stores.userStore.updateUser(userId, updates)
      if (!updated) {
        return jsonResponse({ success: false, error: '更新失败' }, 500, request)
      }

      return jsonResponse({
        success: true,
        data: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          avatar: updated.avatar,
        },
      }, 200, request)
    } catch (err) {
      console.error('Update profile error:', err)
      return jsonResponse({ success: false, error: '更新失败' }, 500, request)
    }
  }

  return jsonResponse({ success: false, error: 'Method Not Allowed' }, 405, request)
}

/**
 * 获取已授权应用列表
 * 修复：使用 authorization-store 替代 KV 扫描
 */
async function handleListAuthorizations(
  stores: AppStores,
  userId: string,
  request: Request,
): Promise<Response> {
  const authRecords = await stores.authStore.listByUser(userId)
  if (authRecords.length === 0) {
    return jsonResponse({ success: true, data: [] }, 200, request)
  }

  // 关联客户端信息
  const data: Array<{
    clientId: string
    clientName: string
    clientDescription?: string
    scope: string
    authorizedAt: string
    updatedAt: string
  }> = []

  for (const record of authRecords) {
    const client = await stores.clientStore.findByClientId(record.clientId)
    data.push({
      clientId: record.clientId,
      clientName: client?.name || record.clientId,
      clientDescription: client?.description,
      scope: record.scope,
      authorizedAt: record.authorizedAt,
      updatedAt: record.updatedAt,
    })
  }

  return jsonResponse({ success: true, data }, 200, request)
}

/**
 * 撤销授权
 * 修复：使用 authorization-store + revokeByUserAndClient
 */
async function handleRevokeAuthorization(
  stores: AppStores,
  userId: string,
  clientId: string,
  request: Request,
): Promise<Response> {
  // 撤销授权记录
  await stores.authStore.revoke(userId, clientId)

  // 撤销该用户对该客户端的所有 token
  await stores.kvStore.accessToken.revokeByUserAndClient(userId, clientId)
  await stores.kvStore.refreshToken.revokeByUserAndClient(userId, clientId)

  return jsonResponse({ success: true, message: '授权已撤销' }, 200, request)
}
