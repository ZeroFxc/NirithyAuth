<template>
  <MdContainer>
    <MdCard variant="elevated" class="authorize-card">
      <!-- 加载中 -->
      <div v-if="loading" class="authorize-card__loading">
        <p>正在加载授权信息...</p>
      </div>

      <!-- 错误 -->
      <div v-else-if="error" class="authorize-card__error-block">
        <h2>授权请求无效</h2>
        <p>{{ error }}</p>
        <MdButton variant="text" @click="goHome">返回首页</MdButton>
      </div>

      <!-- 授权确认 -->
      <template v-else-if="authData">
        <!-- 应用信息 -->
        <div class="authorize-card__app-info">
          <div class="authorize-card__app-icon">
            {{ authData.client.name.charAt(0).toUpperCase() }}
          </div>
          <div>
            <h2 class="authorize-card__app-name">{{ authData.client.name }}</h2>
            <p v-if="authData.client.description" class="authorize-card__app-desc">
              {{ authData.client.description }}
            </p>
            <a
              v-if="authData.client.homepageUrl"
              :href="authData.client.homepageUrl"
              target="_blank"
              class="authorize-card__app-url"
            >
              {{ authData.client.homepageUrl }}
            </a>
          </div>
        </div>

        <div class="authorize-card__divider"></div>

        <!-- 请求的权限 -->
        <div class="authorize-card__scopes">
          <h3 class="authorize-card__section-title">此应用将获得以下权限：</h3>
          <ul class="authorize-card__scope-list">
            <li v-for="s in scopeLabels" :key="s.key" class="authorize-card__scope-item">
              <span class="authorize-card__scope-icon">{{ s.icon }}</span>
              <span>{{ s.label }}</span>
            </li>
          </ul>
        </div>

        <div class="authorize-card__divider"></div>

        <!-- 用户信息 -->
        <div class="authorize-card__user-info">
          <MdAvatar :name="userName" :size="40" />
          <div>
            <div class="authorize-card__user-name">{{ userName }}</div>
            <div class="authorize-card__user-hint">授权后，此应用将可以访问您的以上信息</div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="authorize-card__actions">
          <MdButton variant="outlined" :disabled="submitting" @click="handleCancel">
            取消
          </MdButton>
          <MdButton variant="filled" :disabled="submitting" @click="handleConfirm">
            {{ submitting ? '处理中...' : '确认授权' }}
          </MdButton>
        </div>
      </template>
    </MdCard>
  </MdContainer>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MdButton, MdCard, MdContainer, MdAvatar } from '../components'

const router = useRouter()
const route = useRoute()

const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const authData = ref<{
  client: { name: string; description?: string; homepageUrl?: string }
  scope: string
  redirectUri: string
  codeChallenge: string
  state: string
  clientId: string
  isLoggedIn: boolean
  userId: string | null
} | null>(null)

const userName = ref('')

// 权限标签映射
const scopeLabels = computed(() => {
  if (!authData.value) return []
  const scopes = authData.value.scope.split(/\s+/).filter(Boolean)
  const labelMap: Record<string, { key: string; icon: string; label: string }> = {
    profile: { key: 'profile', icon: '👤', label: '读取您的公开个人资料（昵称、头像）' },
    email: { key: 'email', icon: '📧', label: '读取您的邮箱地址' },
    openid: { key: 'openid', icon: '🔑', label: '获取您的用户标识' }
  }
  return scopes.map(s => labelMap[s] || { key: s, icon: '📋', label: `访问您的 ${s} 信息` })
})

onMounted(async () => {
  try {
    // 将当前 URL 的查询参数转发给 /authorize 端点
    const res = await fetch(`/authorize${window.location.search}`)
    const data = await res.json() as { error_description?: string; error?: string } as {
      error?: string
      error_description?: string
      client?: { name: string; description?: string; homepageUrl?: string }
      scope?: string
      redirectUri?: string
      codeChallenge?: string
      state?: string
      clientId?: string
      isLoggedIn?: boolean
      userId?: string | null
    }

    if (res.status === 400 || data.error) {
      error.value = data.error_description || data.error || '授权请求参数无效'
      loading.value = false
      return
    }

    authData.value = data as any

    // 如果未登录，跳转到登录页
    if (!data.isLoggedIn) {
      const loginUrl = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
      router.push(loginUrl)
      return
    }

    // 获取用户信息
    const sessionRes = await fetch('/api/auth/session')
    const sessionData = await sessionRes.json() as { success: boolean; data?: { name: string } }
    if (sessionData.success && sessionData.data) {
      userName.value = sessionData.data.name
    }
  } catch {
    error.value = '网络错误，请稍后重试'
  } finally {
    loading.value = false
  }
})

async function handleConfirm() {
  if (!authData.value) return
  submitting.value = true

  try {
    const res = await fetch('/api/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: authData.value.clientId,
        redirectUri: authData.value.redirectUri,
        codeChallenge: authData.value.codeChallenge,
        scope: authData.value.scope,
        state: authData.value.state,
        action: 'confirm'
      }),
      redirect: 'manual'
    })

    // 读取 302 重定向的 Location 头
    const location = res.headers.get('Location')
    if (location) {
      window.location.href = location
    } else {
      const data = await res.json() as { error_description?: string; error?: string }
      error.value = data.error_description || '授权失败'
    }
  } catch {
    error.value = '网络错误，请稍后重试'
  } finally {
    submitting.value = false
  }
}

async function handleCancel() {
  if (!authData.value) return
  submitting.value = true

  try {
    const res = await fetch('/api/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: authData.value.clientId,
        redirectUri: authData.value.redirectUri,
        codeChallenge: authData.value.codeChallenge,
        scope: authData.value.scope,
        state: authData.value.state,
        action: 'cancel'
      }),
      redirect: 'manual'
    })

    const location = res.headers.get('Location')
    if (location) {
      window.location.href = location
    }
  } catch {
    error.value = '网络错误，请稍后重试'
  } finally {
    submitting.value = false
  }
}

function goHome() {
  router.push('/')
}
</script>

<style scoped>
.authorize-card {
  margin-top: 48px;
  max-width: 440px;
}
.authorize-card__loading {
  text-align: center;
  padding: 48px 0;
  color: var(--md-sys-color-on-surface-variant);
}
.authorize-card__error-block {
  text-align: center;
  padding: 24px 0;
}
.authorize-card__error-block h2 {
  font-size: 24px;
  font-weight: 400;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 8px;
}
.authorize-card__error-block p {
  color: var(--md-sys-color-error);
  margin-bottom: 16px;
}
.authorize-card__app-info {
  display: flex;
  align-items: center;
  gap: 16px;
}
.authorize-card__app-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 500;
  flex-shrink: 0;
}
.authorize-card__app-name {
  font-size: 20px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
}
.authorize-card__app-desc {
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
  margin-top: 4px;
}
.authorize-card__app-url {
  font-size: 13px;
  color: var(--md-sys-color-primary);
  display: inline-block;
  margin-top: 4px;
}
.authorize-card__divider {
  height: 1px;
  background: var(--md-sys-color-outline-variant);
  margin: 20px 0;
}
.authorize-card__section-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 12px;
}
.authorize-card__scope-list {
  list-style: none;
  padding: 0;
}
.authorize-card__scope-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
}
.authorize-card__scope-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
}
.authorize-card__user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}
.authorize-card__user-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
}
.authorize-card__user-hint {
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
  margin-top: 2px;
}
.authorize-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
</style>