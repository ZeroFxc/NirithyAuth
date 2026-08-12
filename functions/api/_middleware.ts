/**
 * API 路由中间件 (/api/*)
 * 根据路径前缀分发到不同的处理器
 */

import { handleAuthRequest } from './auth'
import { handleOAuthRequest } from './oauth'
import { handleUserRequest } from './user'
import { handleClientsRequest } from './clients'
import { handleAdminRequest } from './admin'
import { jsonResponse, type Env } from '../lib/shared'

interface PagesContext {
  request: Request
  env: Env
  next: () => Promise<Response>
}

export async function onRequest(context: PagesContext): Promise<Response> {
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

  if (url.pathname.startsWith('/api/admin')) {
    return handleAdminRequest(context.request, context.env)
  }

  return jsonResponse({ success: false, error: 'Not Found' }, 404, context.request)
}
