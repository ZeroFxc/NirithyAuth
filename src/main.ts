import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './styles/theme.css'
import { checkSession } from './lib/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./pages/HomePage.vue') },
    { path: '/login', name: 'login', component: () => import('./pages/LoginPage.vue') },
    { path: '/register', name: 'register', component: () => import('./pages/RegisterPage.vue') },
    { path: '/authorize', name: 'authorize', component: () => import('./pages/AuthorizePage.vue') },
    { path: '/dashboard', name: 'dashboard', component: () => import('./pages/DashboardPage.vue'), meta: { requiresAuth: true } },
    { path: '/developer', name: 'developer', component: () => import('./pages/DeveloperPage.vue'), meta: { requiresAuth: true } },
    { path: '/docs', name: 'docs', component: () => import('./pages/DocsPage.vue') },
  ]
})

// 路由守卫：未登录跳转到登录页
router.beforeEach(async (to, _from, next) => {
  if (to.meta.requiresAuth) {
    const loggedIn = await checkSession()
    if (loggedIn) {
      next()
    } else {
      next({ path: '/login', query: { redirect: to.fullPath } })
    }
  } else {
    next()
  }
})

// 每次导航后刷新登录状态（确保导航栏同步）
router.afterEach(() => {
  checkSession()
})

const app = createApp(App)
app.use(router)
app.mount('#app')