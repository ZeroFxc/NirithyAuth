/**
 * API 路由中间件
 * 根据 URL 路径分发到不同的处理器
 * 
 * 新增路由：
 *   GET /.well-known/openid-configuration — OAuth2 发现
 *   GET /.well-known/jwks.json           — JWKS 公钥
 */

import { handleAuthRequest } from './auth'
import { handleOAuthRequest } from './oauth'
import { handleUserRequest } from './user'
import { handleClientsRequest } from './clients'
import { jsonResponse, getJwtSecret, type Env } from '../lib/shared'

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const url = new URL(context.request.url)

  // 健康检查端点
  if (url.pathname === '/api/health') {
    const hasR2 = !!context.env.AUTH_BUCKET
    const hasKV = !!context.env.AUTH_KV
    return jsonResponse({
      success: true,
      bindings: { r2: hasR2, kv: hasKV },
      env: Object.keys(context.env),
    }, 200, context.request)
  }

  // OAuth2 发现端点
  if (url.pathname === '/.well-known/openid-configuration') {
    return handleDiscovery(context.request)
  }

  // JWKS 端点
  if (url.pathname === '/.well-known/jwks.json') {
    return handleJwks(context.request, context.env)
  }

  // 根据路径前缀分发
  if (url.pathname.startsWith('/api/auth')) {
    return handleAuthRequest(context.request, context.env)
  }

  if (url.pathname.startsWith('/api/oauth')) {
    return handleOAuthRequest(context.request, context.env)
  }

  if (url.pathname.startsWith('/api/clients')) {
    return handleClientsRequest(context.request, context.env)
  }

  if (url.pathname.startsWith('/api/user')) {
    return handleUserRequest(context.request, context.env)
  }

  return jsonResponse({ success: false, error: 'Not Found' }, 404, context.request)
}

/**
 * OAuth2 / OpenID Connect 发现端点
 * 允许客户端自动发现 OAuth2 端点
 */
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
    token_endpoint_auth_methods_supported: ['client_secret_post'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['HS256'],
  }

  return jsonResponse(config, 200, request)
}

/**
 * JWKS (JSON Web Key Set) 端点
 * 返回用于验证 JWT 签名的公钥
 * 注意：当前使用 HMAC-SHA256 对称签名，公钥就是提示信息
 * 生产环境应迁移到 RS256 非对称签名
 */
function handleJwks(request: Request, env: Env): Response {
  // HMAC-SHA256 是对称算法，没有独立的公钥
  // 返回空 key set（客户端通过 introspection 或 userinfo 端点验证 token）
  // 未来迁移到 RS256 后这里会返回真正的公钥
  const jwks = {
    keys: [],
  }

  return jsonResponse(jwks, 200, request)
}
