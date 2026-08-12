/**
 * 根级中间件
 * 处理不在 /api/ 下的 Functions 路由
 * 
 * /.well-known/openid-configuration — OIDC Discovery
 * /.well-known/jwks.json           — JWKS 公钥
 */

import { jsonResponse, createStores, type Env } from './lib/shared'

interface PagesContext {
  request: Request
  env: Env
  next: () => Promise<Response>
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url)

  if (url.pathname === '/.well-known/openid-configuration') {
    return handleDiscovery(context.request)
  }

  if (url.pathname === '/.well-known/jwks.json') {
    return handleJwks(context.request, context.env)
  }

  // 其它路径交给 Pages 静态资源处理
  return context.next()
}

function handleDiscovery(request: Request): Response {
  const origin = new URL(request.url).origin

  const config = {
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    userinfo_endpoint: `${origin}/api/oauth/userinfo`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    introspection_endpoint: `${origin}/api/oauth/introspect`,
    jwks_uri: `${origin}/.well-known/jwks.json`,
    registration_endpoint: `${origin}/api/clients`,
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
  }

  return jsonResponse(config, 200, request)
}

async function handleJwks(request: Request, env: Env): Promise<Response> {
  const stores = createStores(env)
  const jwks = await stores.crypto.getJwks()

  return jsonResponse(jwks, 200, request)
}
