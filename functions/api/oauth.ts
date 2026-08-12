/**
 * OAuth 2.1 API 端点
 * 
 * GET  /authorize          — 授权页面（参数验证）
 * POST /api/oauth/authorize — 处理授权确认
 * POST /api/oauth/token     — 换 token / 刷新 token
 * GET  /api/oauth/userinfo  — 获取用户信息
 * POST /api/oauth/revoke    — 吊销 token
 * POST /api/oauth/introspect — Token 内省 (RFC 7662)
 * GET  /.well-known/openid-configuration — OAuth2 发现
 * GET  /.well-known/jwks.json — JWKS 公钥
 */

import {
  createStores, jsonResponse, getSessionToken, getBearerToken,
  handleCorsPreflight, isCorsPreflight, getJwtSecret, CONSTANTS,
  type Env, type AppStores,
} from '../lib/shared'
import { createJWT, verifyJWT } from '../lib/auth'

/**
 * 处理 /authorize 的 GET 请求
 * 验证参数并返回授权页面所需的上下文数据
 */
export async function handleAuthorizePage(request: Request, env: Env): Promise<{
  status: number
  body?: Record<string, unknown>
  redirect?: string
}> {
  const url = new URL(request.url)
  const clientId = url.searchParams.get('client_id')
  const redirectUri = url.searchParams.get('redirect_uri')
  const responseType = url.searchParams.get('response_type')
  const codeChallenge = url.searchParams.get('code_challenge')
  const codeChallengeMethod = url.searchParams.get('code_challenge_method')
  const scope = url.searchParams.get('scope') || 'profile'
  const state = url.searchParams.get('state') || ''

  // 验证 response_type
  if (responseType !== 'code') {
    return { status: 400, body: { error: 'invalid_request', error_description: 'Only response_type=code is supported' } }
  }

  // 强制 PKCE
  if (!codeChallenge) {
    return { status: 400, body: { error: 'invalid_request', error_description: 'PKCE parameter missing: code_challenge' } }
  }
  if (codeChallengeMethod !== 'S256') {
    return { status: 400, body: { error: 'invalid_request', error_description: 'Only code_challenge_method=S256 is supported' } }
  }

  // 验证 client_id
  if (!clientId) {
    return { status: 400, body: { error: 'invalid_request', error_description: 'Missing client_id' } }
  }

  const stores = createStores(env)
  const client = await stores.clientStore.findByClientId(clientId)
  if (!client) {
    return { status: 400, body: { error: 'invalid_client', error_description: 'Invalid client ID' } }
  }

  // 精确 redirect_uri 匹配
  if (!redirectUri) {
    return { status: 400, body: { error: 'invalid_request', error_description: 'Missing redirect_uri' } }
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return { status: 400, body: { error: 'invalid_request', error_description: 'redirect_uri does not match' } }
  }

  // 检查用户是否已登录
  const sessionToken = getSessionToken(request)
  let userId: string | null = null
  if (sessionToken) {
    userId = await stores.kvStore.session.getUserId(sessionToken)
  }

  // 返回授权页面上下文
  return {
    status: 200,
    body: {
      client: { name: client.name, description: client.description, homepageUrl: client.homepageUrl },
      scope,
      redirectUri,
      codeChallenge,
      state,
      clientId,
      isLoggedIn: !!userId,
      userId,
    },
  }
}

export async function handleOAuthRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace('/api/oauth', '')

  if (isCorsPreflight(request)) {
    return handleCorsPreflight(request)
  }

  const stores = createStores(env)
  const jwtSecret = getJwtSecret(env)

  switch (path) {
    case '/authorize':
      return handleAuthorizeConfirm(request, stores)
    case '/token':
      return handleToken(request, stores, jwtSecret)
    case '/userinfo':
      return handleUserInfo(request, stores, jwtSecret)
    case '/revoke':
      return handleRevoke(request, stores)
    case '/introspect':
      return handleIntrospect(request, stores, jwtSecret)
    default:
      return jsonResponse({ error: 'invalid_request', error_description: 'Not Found' }, 404, request)
  }
}

/**
 * POST /api/oauth/authorize — 用户确认或拒绝授权
 * 修复：确认授权时创建授权记录
 */
async function handleAuthorizeConfirm(request: Request, stores: AppStores): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'invalid_request', error_description: 'Method Not Allowed' }, 405, request)
  }

  try {
    const body = await request.json() as {
      clientId: string
      redirectUri: string
      codeChallenge: string
      scope: string
      state: string
      action: 'confirm' | 'cancel'
    }

    const { clientId, redirectUri, codeChallenge, scope, state, action } = body

    // 验证登录状态
    const sessionToken = getSessionToken(request)
    if (!sessionToken) {
      return jsonResponse({ error: 'unauthorized', error_description: 'Please login first' }, 401, request)
    }

    const userId = await stores.kvStore.session.getUserId(sessionToken)
    if (!userId) {
      return jsonResponse({ error: 'unauthorized', error_description: 'Session expired' }, 401, request)
    }

    // 验证客户端
    const client = await stores.clientStore.findByClientId(clientId)
    if (!client) {
      return jsonResponse({ error: 'invalid_client', error_description: 'Invalid client ID' }, 400, request)
    }

    // 验证 redirect_uri
    if (!client.redirectUris.includes(redirectUri)) {
      return jsonResponse({ error: 'invalid_request', error_description: 'redirect_uri does not match' }, 400, request)
    }

    // 用户拒绝授权
    if (action === 'cancel') {
      const redirectUrl = new URL(redirectUri)
      redirectUrl.searchParams.set('error', 'access_denied')
      redirectUrl.searchParams.set('error_description', 'User denied the authorization')
      if (state) redirectUrl.searchParams.set('state', state)
      return new Response(null, { status: 302, headers: { Location: redirectUrl.toString() } })
    }

    // 用户确认授权：创建/更新授权记录
    await stores.authStore.upsert(userId, clientId, scope)

    // 生成授权码
    const code = await stores.kvStore.authCode.create({
      userId,
      clientId,
      redirectUri,
      codeChallenge,
      scope,
    })

    const redirectUrl = new URL(redirectUri)
    redirectUrl.searchParams.set('code', code)
    if (state) redirectUrl.searchParams.set('state', state)

    return new Response(null, { status: 302, headers: { Location: redirectUrl.toString() } })
  } catch (err) {
    console.error('Authorize confirm error:', err)
    return jsonResponse({ error: 'server_error', error_description: 'Internal server error' }, 500, request)
  }
}

/**
 * POST /api/oauth/token — 授权码换 token / 刷新 token
 * 修复：完整重放攻击处理，JTI 注册，授权码消费后删除
 */
async function handleToken(request: Request, stores: AppStores, jwtSecret: string): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'invalid_request', error_description: 'Method Not Allowed' }, 405, request)
  }

  try {
    const contentType = request.headers.get('Content-Type') || ''
    let body: Record<string, string>

    if (contentType.includes('application/json')) {
      body = await request.json() as Record<string, string>
    } else {
      const formData = await request.formData()
      body = Object.fromEntries(formData.entries()) as Record<string, string>
    }

    const grantType = body.grant_type

    if (grantType === 'authorization_code') {
      return handleAuthorizationCodeGrant(body, stores, jwtSecret, request)
    } else if (grantType === 'refresh_token') {
      return handleRefreshTokenGrant(body, stores, jwtSecret, request)
    } else {
      return jsonResponse({ error: 'unsupported_grant_type', error_description: 'Unsupported grant_type' }, 400, request)
    }
  } catch (err) {
    console.error('Token error:', err)
    return jsonResponse({ error: 'server_error', error_description: 'Internal server error' }, 500, request)
  }
}

/** 处理 authorization_code grant */
async function handleAuthorizationCodeGrant(
  body: Record<string, string>,
  stores: AppStores,
  jwtSecret: string,
  request: Request,
): Promise<Response> {
  const { code, code_verifier, client_id, client_secret, redirect_uri } = body

  if (!code || !code_verifier || !client_id || !client_secret || !redirect_uri) {
    return jsonResponse({ error: 'invalid_request', error_description: 'Missing required parameters' }, 400, request)
  }

  // 验证客户端
  const client = await stores.clientStore.findByClientId(client_id)
  if (!client || client.clientSecret !== client_secret) {
    return jsonResponse({ error: 'invalid_client', error_description: 'Client authentication failed' }, 401, request)
  }

  // 消费授权码（单次使用，消费后删除）
  const authData = await stores.kvStore.authCode.consume(code)

  // 检测重放攻击
  if (authData === ('REPLAY' as any)) {
    // 授权码重放攻击！撤销该用户对该客户端的所有 token
    const consumedInfo = await stores.kvStore.authCode.getConsumedInfo(code)
    if (consumedInfo) {
      await stores.kvStore.accessToken.revokeByUserAndClient(consumedInfo.userId, consumedInfo.clientId)
      await stores.kvStore.refreshToken.revokeByUserAndClient(consumedInfo.userId, consumedInfo.clientId)
    }
    return jsonResponse({ error: 'invalid_grant', error_description: 'Authorization code has been used (replay detected)' }, 400, request)
  }

  if (!authData) {
    return jsonResponse({ error: 'invalid_grant', error_description: 'Authorization code is invalid or expired' }, 400, request)
  }

  // 验证 redirect_uri
  if (authData.redirectUri !== redirect_uri) {
    return jsonResponse({ error: 'invalid_grant', error_description: 'redirect_uri does not match' }, 400, request)
  }

  // PKCE 验证：S256(code_verifier) === code_challenge
  const encoder = new TextEncoder()
  const verifierHash = await crypto.subtle.digest('SHA-256', encoder.encode(code_verifier))
  const computedChallenge = btoa(String.fromCharCode(...new Uint8Array(verifierHash)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  if (computedChallenge !== authData.codeChallenge) {
    return jsonResponse({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400, request)
  }

  // 生成 access_token（JWT，1小时）
  const jti = crypto.randomUUID()
  const accessToken = await createJWT({
    sub: authData.userId,
    client_id: client_id,
    scope: authData.scope,
    jti,
  }, jwtSecret, CONSTANTS.ACCESS_TOKEN_TTL)

  // 注册 JTI（用于撤销追踪）
  await stores.kvStore.accessToken.registerJti(jti, authData.userId, client_id, authData.scope)

  // 生成 refresh_token（随机字符串，30天）
  const { token: refreshToken } = await stores.kvStore.refreshToken.create(
    authData.userId, client_id, authData.scope
  )

  return jsonResponse({
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: CONSTANTS.ACCESS_TOKEN_TTL,
    refresh_token: refreshToken,
    scope: authData.scope,
  }, 200, request)
}

/** 处理 refresh_token grant（轮换机制） */
async function handleRefreshTokenGrant(
  body: Record<string, string>,
  stores: AppStores,
  jwtSecret: string,
  request: Request,
): Promise<Response> {
  const { refresh_token, client_id, client_secret } = body

  if (!refresh_token || !client_id || !client_secret) {
    return jsonResponse({ error: 'invalid_request', error_description: 'Missing required parameters' }, 400, request)
  }

  // 验证客户端
  const client = await stores.clientStore.findByClientId(client_id)
  if (!client || client.clientSecret !== client_secret) {
    return jsonResponse({ error: 'invalid_client', error_description: 'Client authentication failed' }, 401, request)
  }

  // 轮换 refresh_token
  const tokenData = await stores.kvStore.refreshToken.rotate(refresh_token)

  // 检测重放攻击
  if (tokenData === ('REPLAY' as any)) {
    return jsonResponse({
      error: 'invalid_grant',
      error_description: 'refresh_token has been used (replay detected). All tokens for this session have been revoked.',
    }, 400, request)
  }

  if (!tokenData) {
    return jsonResponse({ error: 'invalid_grant', error_description: 'refresh_token is invalid or expired' }, 400, request)
  }

  // 生成新的 access_token
  const jti = crypto.randomUUID()
  const accessToken = await createJWT({
    sub: tokenData.userId,
    client_id: tokenData.clientId,
    scope: tokenData.scope,
    jti,
  }, jwtSecret, CONSTANTS.ACCESS_TOKEN_TTL)

  // 注册新 JTI
  await stores.kvStore.accessToken.registerJti(jti, tokenData.userId, tokenData.clientId, tokenData.scope)

  // 生成新的 refresh_token
  const { token: newRefreshToken } = await stores.kvStore.refreshToken.create(
    tokenData.userId, tokenData.clientId, tokenData.scope
  )

  return jsonResponse({
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: CONSTANTS.ACCESS_TOKEN_TTL,
    refresh_token: newRefreshToken,
    scope: tokenData.scope,
  }, 200, request)
}

/**
 * GET /api/oauth/userinfo — 获取用户信息
 * 修复：检查 JTI 是否已撤销
 */
async function handleUserInfo(
  request: Request,
  stores: AppStores,
  jwtSecret: string,
): Promise<Response> {
  const token = getBearerToken(request)
  if (!token) {
    return new Response(JSON.stringify({ error: 'invalid_token', error_description: 'Missing access_token' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="auth-system"',
      },
    })
  }

  // 验证 JWT
  const payload = await verifyJWT(token, jwtSecret)
  if (!payload) {
    return new Response(JSON.stringify({ error: 'invalid_token', error_description: 'token is invalid or expired' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="auth-system", error="invalid_token"',
      },
    })
  }

  // 检查 JTI 是否已被撤销
  const jti = payload.jti as string
  if (jti) {
    const revoked = await stores.kvStore.accessToken.isRevoked(jti)
    if (revoked) {
      return new Response(JSON.stringify({ error: 'invalid_token', error_description: 'token has been revoked' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer realm="auth-system", error="invalid_token"',
        },
      })
    }
  }

  const userId = payload.sub as string
  const user = await stores.userStore.findById(userId)
  if (!user) {
    return jsonResponse({ error: 'invalid_token', error_description: 'User not found' }, 401, request)
  }

  return jsonResponse({
    sub: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar || null,
  }, 200, request)
}

/**
 * POST /api/oauth/revoke — 吊销 token
 * 修复：验证 client 身份，正确处理 JWT 和 refresh_token
 */
async function handleRevoke(request: Request, stores: AppStores): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'invalid_request', error_description: 'Method Not Allowed' }, 405, request)
  }

  try {
    const contentType = request.headers.get('Content-Type') || ''
    let body: Record<string, string>

    if (contentType.includes('application/json')) {
      body = await request.json() as Record<string, string>
    } else {
      const formData = await request.formData()
      body = Object.fromEntries(formData.entries()) as Record<string, string>
    }

    const { token, token_type_hint, client_id, client_secret } = body

    if (!token) {
      return jsonResponse({ error: 'invalid_request', error_description: 'Missing token' }, 400, request)
    }

    // 验证 client 身份
    if (client_id) {
      const client = await stores.clientStore.findByClientId(client_id)
      if (!client || (client_secret && client.clientSecret !== client_secret)) {
        return jsonResponse({ error: 'invalid_client', error_description: 'Client authentication failed' }, 401, request)
      }
    }

    // 尝试作为 JWT 撤销
    // 从 JWT 中提取 JTI 不需要验证（revoke 应该总是成功）
    try {
      const parts = token.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (payload.jti) {
          await stores.kvStore.accessToken.revokeJti(payload.jti)
        }
      }
    } catch {
      // 不是 JWT，继续尝试作为 refresh_token
    }

    // 尝试吊销 refresh_token
    await stores.kvStore.refreshToken.delete(token)

    return jsonResponse({}, 200, request)
  } catch (err) {
    console.error('Revoke error:', err)
    return jsonResponse({ error: 'server_error', error_description: 'Internal server error' }, 500, request)
  }
}

/**
 * POST /api/oauth/introspect — Token 内省 (RFC 7662)
 * 查询 token 的状态和信息
 */
async function handleIntrospect(
  request: Request,
  stores: AppStores,
  jwtSecret: string,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'invalid_request', error_description: 'Method Not Allowed' }, 405, request)
  }

  try {
    const contentType = request.headers.get('Content-Type') || ''
    let body: Record<string, string>

    if (contentType.includes('application/json')) {
      body = await request.json() as Record<string, string>
    } else {
      const formData = await request.formData()
      body = Object.fromEntries(formData.entries()) as Record<string, string>
    }

    const { token, client_id, client_secret } = body

    if (!token) {
      return jsonResponse({ active: false }, 200, request)
    }

    // 验证 client 身份
    if (!client_id) {
      return jsonResponse({ error: 'invalid_client', error_description: 'Missing client_id' }, 401, request)
    }
    const client = await stores.clientStore.findByClientId(client_id)
    if (!client || !client_secret || client.clientSecret !== client_secret) {
      return jsonResponse({ error: 'invalid_client', error_description: 'Client authentication failed' }, 401, request)
    }

    // 尝试作为 JWT 验证
    const payload = await verifyJWT(token, jwtSecret)
    if (payload) {
      // 检查是否已撤销
      const jti = payload.jti as string
      let revoked = false
      if (jti) {
        revoked = await stores.kvStore.accessToken.isRevoked(jti)
      }

      if (!revoked) {
        return jsonResponse({
          active: true,
          scope: payload.scope as string,
          client_id: payload.client_id as string,
          username: payload.sub as string,
          token_type: 'Bearer',
          exp: payload.exp as number,
          iat: payload.iat as number,
          sub: payload.sub as string,
        }, 200, request)
      }
    }

    // 尝试作为 refresh_token 验证
    // refresh_token 不存储明文可验证，只能检查是否存在于 KV
    // 这里简化处理：如果 JWT 验证失败，返回 inactive
    return jsonResponse({ active: false }, 200, request)
  } catch (err) {
    console.error('Introspect error:', err)
    return jsonResponse({ error: 'server_error', error_description: 'Internal server error' }, 500, request)
  }
}
