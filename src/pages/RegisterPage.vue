<template>
  <MdContainer>
    <MdCard variant="elevated" class="register-card">
      <h1 class="register-card__title">注册</h1>
      <p class="register-card__subtitle">创建您的 Auth System 账号</p>

      <form @submit.prevent="handleRegister" class="register-card__form">
        <MdTextField
          v-model="name"
          label="昵称"
          required
          :error="errors.name"
        />
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
        <MdTextField
          v-model="confirmPassword"
          label="确认密码"
          type="password"
          required
          :error="errors.confirmPassword"
        />

        <div v-if="error" class="register-card__error">{{ error }}</div>

        <MdButton
          variant="filled"
          :disabled="loading"
          class="register-card__submit"
          @click="handleRegister"
        >
          {{ loading ? '注册中...' : '注册' }}
        </MdButton>
      </form>

      <p class="register-card__footer">
        已有账号？
        <router-link to="/login" class="register-card__link">登录</router-link>
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

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const errors = reactive({ name: '', email: '', password: '', confirmPassword: '' })

async function handleRegister() {
  error.value = ''
  errors.name = ''
  errors.email = ''
  errors.password = ''
  errors.confirmPassword = ''

  // 前端校验
  if (!name.value.trim()) { errors.name = '请输入昵称'; return }
  if (name.value.trim().length > 50) { errors.name = '昵称不能超过50个字符'; return }
  if (!email.value) { errors.email = '请输入邮箱'; return }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) { errors.email = '邮箱格式不正确'; return }
  if (!password.value) { errors.password = '请输入密码'; return }
  if (password.value.length < 6) { errors.password = '密码至少需要6个字符'; return }
  if (password.value !== confirmPassword.value) { errors.confirmPassword = '两次密码不一致'; return }

  loading.value = true
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.value,
        password: password.value,
        name: name.value.trim()
      })
    })
    const data = await res.json() as { success: boolean; error?: string }

    if (data.success) {
      const redirect = (route.query.redirect as string) || '/dashboard'
      router.push(redirect)
    } else {
      error.value = data.error || '注册失败'
    }
  } catch {
    error.value = '网络错误，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.register-card {
  margin-top: 48px;
}
.register-card__title {
  font-size: 32px;
  font-weight: 400;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 4px;
}
.register-card__subtitle {
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 32px;
}
.register-card__form {
  display: flex;
  flex-direction: column;
}
.register-card__submit {
  width: 100%;
  margin-top: 8px;
}
.register-card__error {
  background: var(--md-sys-color-error-container);
  color: var(--md-sys-color-on-error-container);
  padding: 12px 16px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  font-size: 14px;
  margin-bottom: 16px;
}
.register-card__footer {
  text-align: center;
  margin-top: 24px;
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
}
.register-card__link {
  color: var(--md-sys-color-primary);
  font-weight: 500;
}
</style>