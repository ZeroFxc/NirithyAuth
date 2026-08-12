/**
 * 全局登录状态管理
 * 共享 isLoggedIn 状态，确保导航栏和路由守卫同步
 */
import { ref } from 'vue'

export const isLoggedIn = ref(false)

/** 检查登录状态 */
export async function checkSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/session')
    isLoggedIn.value = res.ok
    return res.ok
  } catch {
    isLoggedIn.value = false
    return false
  }
}

/** 退出登录 */
export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' })
  isLoggedIn.value = false
}