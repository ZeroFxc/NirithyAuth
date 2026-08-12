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
  constantTimeEquals, extractClientCredentials,
  type Env, type AppStores,
} from '../lib/shared'
import { verifyJWT as verifyHs256JWT, constantTimeEquals as ctEquals } from '../lib/auth'

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

  if (responseType !== 'code') {
    return { status: 400, body: { error: 'invalid_request', error_description: 'Only response_type=code is supported' } }
  }

  // OAuth 2.1 强制 PKCE
  if (!codeChallenge) {
    return { status: 400, body: { error: 'invalid_request', error_description: 'PKCE parameter missing: code_challenge' } }
  }
  if (codeChallengeMethod !== 'S256') {
    return { status: 400, body: { error: 'invalid_request', error_description: 'Only code_challenge_method=S256 is supported' } }
  }

  if (!clientId) {
    return { status: 400, body: { error: 'invalid_request', error_description: 'Missing client_id' } }
  }

  const stores = createStores(env)
  const client = await stores.clientStore.findByClientId(clientId)
  if (!client) {
    return { status: 400, body: { error: 'invalid_client', error_description: 'Invalid client ID' } }
  }

  if (!redirectUri) {
    return { status: 400, body: { error: 'invalid_request', error_description: 'Missing redirect_uri' } }
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return { status: 400, body: { error: 'invalid_request', error_description: 'redirect_uri does not match' } }
  }

  const sessionToken = getSessionToken(request)
  let userId: string | null = null
  if (sessionToken) {
    userId = await stores.kvStore.session.getUserId(sessionToken)
  }

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

    const sessionToken = getSessionToken(request)
    if (!sessionToken) {
      return jsonResponse({ error: 'unauthorized', error_description: 'Please login first' }, 401, request)
    }

    const userId = await stores.kvStore.session.getUserId(sessionToken)
    if (!userId) {
      return jsonResponse({ error: 'unauthorized', error_description: 'Session expired' }, 401, request)
    }

    const client = await stores.clientStore.findByClientId(clientId)
    if (!client) {
      return jsonResponse({ error: 'invalid_client', error_description: 'Invalid client ID' }, 400, request)
    }

    if (!client.redirectUris.includes(redirectUri)) {
      return jsonResponse({ error: 'invalid_request', error_description: 'redirect_uri does not match' }, 400, request)
    }

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
 * 验证客户端身份（支持 client_secret_post 和 client_secret_basic）
 * 使用常量时间比较防止时序攻击
 */
async function authenticateClient(
  request: Request,
  body: Record<string, string>,
  stores: AppStores,
): Promise<{ ok: true; clientId: string } | { ok: false; response: Response }> {
  const creds = extractClientCredentials(request, body)
  if (!creds) {
    return {
      ok: false,
      response: jsonResponse({ error: 'invalid_client', error_description: 'Missing client credentials' }, 401, request),
    }
  }

  const client = await stores.clientStore.findByClientId(creds.clientId)
  if (!client || !constantTimeEquals(creds.clientSecret, client.clientSecret)) {
    return {
      ok: false,
      response: jsonResponse({ error: 'invalid_client', error_description: 'Client authentication failed' }, 401, request),
    }
  }

  return { ok: true, clientId: creds.clientId }
}

/**
 * POST /api/oauth/token — 授权码换 token / 刷新 token
 */
async function handleToken(
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
  const { code, code_verifier, redirect_uri } = body

  if (!code || !code_verifier || !redirect_uri) {
    return jsonResponse({ error: 'invalid_request', error_description: 'Missing required parameters' }, 400, request)
  }

  // 验证客户端身份（支持 post + basic）
  const authResult = await authenticateClient(request, body, stores)
  if (!authResult.ok) return authResult.response
  const client_id = authResult.clientId

  // 消费授权码（单次使用，消费后删除）
  const authData = await stores.kvStore.authCode.consume(code)

  // 检测重放攻击
  if (authData === ('REPLAY' as any)) {
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

  if (!constantTimeEquals(computedChallenge, authData.codeChallenge)) {
    return jsonResponse({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400, request)
  }

  // 生成 access_token（RS256 JWT，1小时）
  const jti = crypto.randomUUID()
  const accessToken = await stores.crypto.signJWT(
    {
      sub: authData.userId,
      client_id: client_id,
      scope: authData.scope,
      jti,
    },
    CONSTANTS.ACCESS_TOKEN_TTL
  )

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
  const { refresh_token } = body

  if (!refresh_token) {
    return jsonResponse({ error: 'invalid_request', error_description: 'Missing required parameters' }, 400, request)
  }

  // 验证客户端身份
  const authResult = await authenticateClient(request, body, stores)
  if (!authResult.ok) return authResult.response

  // 轮换 refresh_token
  const tokenData = await stores.kvStore.refreshToken.rotate(refresh_token)

  if (tokenData === ('REPLAY' as any)) {
    return jsonResponse({
      error: 'invalid_grant',
      error_description: 'refresh_token has been used (replay detected). All tokens for this session have been revoked.',
    }, 400, request)
  }

  if (!tokenData) {
    return jsonResponse({ error: 'invalid_grant', error_description: 'refresh_token is invalid or expired' }, 400, request)
  }

  // 生成新的 access_token（RS256）
  const jti = crypto.randomUUID()
  const accessToken = await stores.crypto.signJWT(
    {
      sub: tokenData.userId,
      client_id: tokenData.clientId,
      scope: tokenData.scope,
      jti,
    },
    CONSTANTS.ACCESS_TOKEN_TTL
  )

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
 * 验证 access_token（优先 RS256，兼容旧 HS256）
 * 返回 payload 或 null
 */
async function verifyAccessToken(token: string, stores: AppStores, jwtSecret: string): Promise<Record<string, unknown> | null> {
  // 先尝试 RS256（新 token）
  const rs256Payload = await stores.crypto.verifyJWT(token)
  if (rs256Payload) return rs256Payload

  // 兼容旧 HS256 token（向后兼容）
  return verifyHs256JWT(token, jwtSecret)
}

/**
 * GET /api/oauth/userinfo — 获取用户信息
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

  const payload = await verifyAccessToken(token, stores, jwtSecret)
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

  const scope = payload.scope as string || ''
  const response: Record<string, unknown> = { sub: user.id }

  // 根据 scope 返回不同信息
  if (scope.includes('profile')) {
    response.name = user.name
    response.avatar = user.avatar || null
  }
  if (scope.includes('email')) {
    response.email = user.email
  }

  return jsonResponse(response, 200, request)
}

/**
 * POST /api/oauth/revoke — 吊销 token (RFC 7009)
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

    const { token, token_type_hint } = body

    if (!token) {
      return jsonResponse({ error: 'invalid_request', error_description: 'Missing token' }, 400, request)
    }

    // 验证 client 身份（支持 post + basic）
    const authResult = await authenticateClient(request, body, stores)
    if (!authResult.ok) return authResult.response

    // 尝试作为 JWT 撤销（RS256 和 HS256 都处理）
    // 从 JWT header 判断算法
    const parts = token.split('.')
    if (parts.length === 3) {
      try {
        const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')))
        if (header.alg === 'RS256') {
          // RS256 token：通过 crypto 模块验证获取 payload
          const payload = await stores.crypto.verifyJWT(token)
          if (payload?.jti) {
            await stores.kvStore.accessToken.revokeJti(payload.jti as string)
          }
        } else if (header.alg === 'HS256') {
          // HS256 token：直接解码 payload（revoke 不需要验证签名）
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
          if (payload.jti) {
            await stores.kvStore.accessToken.revokeJti(payload.jti)
          }
        }
      } catch {
        // 解码失败，继续尝试作为 refresh_token
      }
    }

    // 尝试吊销 refresh_token
    if (token_type_hint === 'refresh_token' || parts.length !== 3) {
      await stores.kvStore.refreshToken.delete(token)
    }

    // RFC 7009: revoke 端点总是返回 200（即使 token 无效）
    return jsonResponse({}, 200, request)
  } catch (err) {
    console.error('Revoke error:', err)
    // RFC 7009: 即使出错也返回 200
    return jsonResponse({}, 200, request)
  }
}

/**
 * POST /api/oauth/introspect — Token 内省 (RFC 7662)
 * 完整支持 access_token (RS256 JWT) 和 refresh_token 的内省
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

    const { token, token_type_hint } = body

    if (!token) {
      return jsonResponse({ active: false }, 200, request)
    }

    // 验证 client 身份
    const authResult = await authenticateClient(request, body, stores)
    if (!authResult.ok) return authResult.response

    // 1. 尝试作为 access_token (JWT) 验证
    const payload = await verifyAccessToken(token, stores, jwtSecret)
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
          jti: payload.jti as string,
        }, 200, request)
      } else {
        return jsonResponse({ active: false }, 200, request)
      }
    }

    // 2. 尝试作为 refresh_token 验证
    // 通过 KV 直接查询 token 是否存在
    const refreshTokenData = await stores.kvStore.refreshToken.getData(token)
    if (refreshTokenData) {
      return jsonResponse({
        active: true,
        scope: refreshTokenData.scope,
        client_id: refreshTokenData.clientId,
        username: refreshTokenData.userId,
        token_type: 'refresh_token',
        exp: Math.floor(refreshTokenData.createdAt / 1000) + CONSTANTS.REFRESH_TOKEN_TTL,
        sub: refreshTokenData.userId,
      }, 200, request)
    }

    // 3. token 无效或已过期
    return jsonResponse({ active: false }, 200, request)
  } catch (err) {
    console.error('Introspect error:', err)
    return jsonResponse({ error: 'server_error', error_description: 'Internal server error' }, 500, request)
  }
}
