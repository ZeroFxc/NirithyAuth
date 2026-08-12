/**
 * /authorize 页面处理
 * 处理 GET 请求，验证参数并渲染授权页面
 */

import { handleAuthorizePage } from './api/oauth'
import type { Env } from './lib/shared'

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const result = await handleAuthorizePage(context.request, context.env)

  if (result.redirect) {
    return new Response(null, {
      status: 302,
      headers: { Location: result.redirect },
    })
  }

  // 返回 JSON 给前端 SPA 处理
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
