<template>
  <MdContainer>
    <MdCard variant="elevated" class="login-card">
      <h1 class="login-card__title">登录</h1>
      <p class="login-card__subtitle">登录您的 Auth System 账号</p>

      <form @submit.prevent="handleLogin" class="login-card__form">
        <MdTextField
          v-model="email"
          label="邮箱"
          type="email"
          required
          :error="errors.email"
        />
        <MdTextField
          v-model="password"
          label="密码"
          type="password"
          required
          :error="errors.password"
        />

        <div v-if="error" class="login-card__error">{{ error }}</div>

        <MdButton
          variant="filled"
          :disabled="loading"
          class="login-card__submit"
          @click="handleLogin"
        >
          {{ loading ? '登录中...' : '登录' }}
        </MdButton>
      </form>

      <p class="login-card__footer">
        还没有账号？
        <router-link to="/register" class="login-card__link">注册</router-link>
      </p>
    </MdCard>
  </MdContainer>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MdButton, MdTextField, MdCard, MdContainer } from '../components'

const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const errors = reactive({ email: '', password: '' })

async function handleLogin() {
  // 清除错误
  error.value = ''
  errors.email = ''
  errors.password = ''

  // 前端校验
  if (!email.value) { errors.email = '请输入邮箱'; return }
  if (!password.value) { errors.password = '请输入密码'; return }

  loading.value = true
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, password: password.value })
    })
    const data = await res.json() as { success: boolean; error?: string; data?: { id: string; email: string; name: string; avatar?: string } }

    if (data.success) {
      // 跳转到 redirect 参数指定的页面，或 dashboard
      const redirect = (route.query.redirect as string) || '/dashboard'
      router.push(redirect)
    } else {
      error.value = data.error || '登录失败'
    }
  } catch {
    error.value = '网络错误，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-card {
  margin-top: 48px;
}
.login-card__title {
  font-size: 32px;
  font-weight: 400;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 4px;
}
.login-card__subtitle {
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 32px;
}
.login-card__form {
  display: flex;
  flex-direction: column;
}
.login-card__submit {
  width: 100%;
  margin-top: 8px;
}
.login-card__error {
  background: var(--md-sys-color-error-container);
  color: var(--md-sys-color-on-error-container);
  padding: 12px 16px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  font-size: 14px;
  margin-bottom: 16px;
}
.login-card__footer {
  text-align: center;
  margin-top: 24px;
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
}
.login-card__link {
  color: var(--md-sys-color-primary);
  font-weight: 500;
}
</style>