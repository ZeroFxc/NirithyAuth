/**
 * 用户认证 API
 * 
 * POST /api/auth/register  — 注册
 * POST /api/auth/login     — 登录
 * POST /api/auth/logout    — 退出
 * GET  /api/auth/session   — 获取当前 session
 * PUT  /api/auth/password  — 修改密码
 */

import {
  createStores, jsonResponse, getSessionToken, setSessionCookie, clearSessionCookie,
  handleCorsPreflight, isCorsPreflight, checkRateLimit, CONSTANTS,
  type Env, type AppStores,
} from '../lib/shared'
import { hashPassword, verifyPassword } from '../lib/auth'

export async function handleAuthRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace('/api/auth', '')

  if (isCorsPreflight(request)) {
    return handleCorsPreflight(request)
  }

  const stores = createStores(env)

  switch (path) {
    case '/register':
      return handleRegister(request, stores, env)
    case '/login':
      return handleLogin(request, stores, env)
    case '/logout':
      return handleLogout(request, stores)
    case '/session':
      return handleSession(request, stores)
    case '/password':
      return handleChangePassword(request, stores, env)
    default:
      return jsonResponse({ success: false, error: 'Not Found' }, 404, request)
  }
}

/** 注册 */
async function handleRegister(
  request: Request,
  stores: AppStores,
  env: Env,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method Not Allowed' }, 405, request)
  }

  // 速率限制
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown'
  const allowed = await checkRateLimit(
    env.AUTH_KV,
    `register:${clientIp}`,
    CONSTANTS.RATE_LIMIT_REGISTER_MAX,
    CONSTANTS.RATE_LIMIT_REGISTER_WINDOW,
  )
  if (!allowed) {
    return jsonResponse({ success: false, error: 'Too many registration attempts. Please try again later.' }, 429, request)
  }

  try {
    const body = await request.json() as { email?: string; password?: string; name?: string }
    const { email, password, name } = body

    // 参数校验
    if (!email || !password || !name) {
      return jsonResponse({ success: false, error: 'Please fill in all required fields' }, 400, request)
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ success: false, error: 'Invalid email format' }, 400, request)
    }
    if (password.length < 8) {
      return jsonResponse({ success: false, error: 'Password must be at least 8 characters' }, 400, request)
    }
    if (name.length < 1 || name.length > 50) {
      return jsonResponse({ success: false, error: 'Nickname must be 1-50 characters' }, 400, request)
    }

    const passwordHash = await hashPassword(password)
    const user = await stores.userStore.createUser(email, passwordHash, name)

    // 自动登录：生成 session
    const sessionToken = await stores.kvStore.session.create(user.id)

    const response = jsonResponse({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
    }, 200, request)

    setSessionCookie(response, sessionToken)
    return response
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_EXISTS') {
      return jsonResponse({ success: false, error: 'Email already registered' }, 409, request)
    }
    console.error('Register error:', err instanceof Error ? err.message : String(err))
    return jsonResponse({ success: false, error: 'Registration failed' }, 500, request)
  }
}

/** 登录 */
async function handleLogin(
  request: Request,
  stores: AppStores,
  env: Env,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method Not Allowed' }, 405, request)
  }

  // 速率限制
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown'
  const allowed = await checkRateLimit(
    env.AUTH_KV,
    `login:${clientIp}`,
    CONSTANTS.RATE_LIMIT_LOGIN_MAX,
    CONSTANTS.RATE_LIMIT_LOGIN_WINDOW,
  )
  if (!allowed) {
    return jsonResponse({ success: false, error: 'Too many login attempts. Please try again later.' }, 429, request)
  }

  try {
    const body = await request.json() as { email?: string; password?: string }
    const { email, password } = body

    if (!email || !password) {
      return jsonResponse({ success: false, error: 'Please enter email and password' }, 400, request)
    }

    const user = await stores.userStore.findByEmail(email)
    if (!user) {
      return jsonResponse({ success: false, error: 'Invalid email or password' }, 401, request)
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return jsonResponse({ success: false, error: 'Invalid email or password' }, 401, request)
    }

    const sessionToken = await stores.kvStore.session.create(user.id)

    const response = jsonResponse({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    }, 200, request)

    setSessionCookie(response, sessionToken)
    return response
  } catch (err) {
    console.error('Login error:', err)
    return jsonResponse({ success: false, error: 'Login failed, please try again later' }, 500, request)
  }
}

/** 退出 */
async function handleLogout(request: Request, stores: AppStores): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method Not Allowed' }, 405, request)
  }

  const sessionToken = getSessionToken(request)
  if (sessionToken) {
    await stores.kvStore.session.delete(sessionToken)
  }

  const response = jsonResponse({ success: true }, 200, request)
  clearSessionCookie(response)
  return response
}

/** 获取当前 session */
async function handleSession(request: Request, stores: AppStores): Promise<Response> {
  const sessionToken = getSessionToken(request)
  if (!sessionToken) {
    return jsonResponse({ success: false, error: 'Not logged in' }, 401, request)
  }

  const userId = await stores.kvStore.session.getUserId(sessionToken)
  if (!userId) {
    return jsonResponse({ success: false, error: 'Session expired' }, 401, request)
  }

  const user = await stores.userStore.findById(userId)
  if (!user) {
    return jsonResponse({ success: false, error: 'User not found' }, 401, request)
  }

  return jsonResponse({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    },
  }, 200, request)
}

/** 修改密码 */
async function handleChangePassword(
  request: Request,
  stores: AppStores,
  env: Env,
): Promise<Response> {
  if (request.method !== 'PUT') {
    return jsonResponse({ success: false, error: 'Method Not Allowed' }, 405, request)
  }

  // 验证登录状态
  const sessionToken = getSessionToken(request)
  if (!sessionToken) {
    return jsonResponse({ success: false, error: 'Please login first' }, 401, request)
  }
  const userId = await stores.kvStore.session.getUserId(sessionToken)
  if (!userId) {
    return jsonResponse({ success: false, error: 'Session expired' }, 401, request)
  }

  // 速率限制
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown'
  const allowed = await checkRateLimit(
    env.AUTH_KV,
    `password:${clientIp}`,
    CONSTANTS.RATE_LIMIT_LOGIN_MAX,
    CONSTANTS.RATE_LIMIT_LOGIN_WINDOW,
  )
  if (!allowed) {
    return jsonResponse({ success: false, error: 'Too many attempts. Please try again later.' }, 429, request)
  }

  try {
    const body = await request.json() as { currentPassword?: string; newPassword?: string }
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return jsonResponse({ success: false, error: 'Please provide current and new password' }, 400, request)
    }
    if (newPassword.length < 8) {
      return jsonResponse({ success: false, error: 'New password must be at least 8 characters' }, 400, request)
    }

    const user = await stores.userStore.findById(userId)
    if (!user) {
      return jsonResponse({ success: false, error: 'User not found' }, 404, request)
    }

    // 验证旧密码
    const valid = await verifyPassword(currentPassword, user.passwordHash)
    if (!valid) {
      return jsonResponse({ success: false, error: 'Current password is incorrect' }, 401, request)
    }

    // 更新密码
    const newHash = await hashPassword(newPassword)
    await stores.userStore.updateUser(userId, { passwordHash: newHash })

    // 撤销该用户的所有 session（强制所有设备重新登录）
    const revokedCount = await stores.kvStore.session.deleteAllByUser(userId)

    return jsonResponse({
      success: true,
      message: `Password changed successfully. ${revokedCount} session(s) revoked. Please login again.`,
    }, 200, request)
  } catch (err) {
    console.error('Change password error:', err)
    return jsonResponse({ success: false, error: 'Failed to change password' }, 500, request)
  }
}
