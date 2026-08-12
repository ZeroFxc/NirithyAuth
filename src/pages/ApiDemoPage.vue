<template>
  <div class="api-demo">
    <!-- 侧边步骤导航 -->
    <div class="step-nav">
      <button
        v-for="(step, i) in steps"
        :key="i"
        :class="['step-nav__item', { 'step-nav__item--active': currentStep === i }]"
        @click="scrollToStep(i)"
      >
        <span class="step-nav__num">{{ i + 1 }}</span>
        <span class="step-nav__label">{{ step.title }}</span>
        <span v-if="step.done" class="step-nav__check">&#10003;</span>
      </button>
    </div>

    <!-- 主内容区 -->
    <div class="demo-content">
      <!-- Step 0: 环境配置 -->
      <section ref="stepRefs" :data-step="0" :class="['demo-step', { 'demo-step--done': steps[0].done }]">
        <div class="demo-step__header">
          <span class="demo-step__badge">Step 1</span>
          <h2>环境配置</h2>
        </div>
        <p class="demo-step__desc">设置 Auth System 服务地址和管理 Token（用于管理 API）</p>
        <div class="form-row">
          <MdTextField v-model="config.authHost" label="Auth System 地址" />
          <MdTextField v-model="config.adminToken" label="Admin Token（管理 API 用）" type="password" />
        </div>
        <MdButton variant="filled" @click="testHealth">测试连接</MdButton>
        <div v-if="healthResult" class="result-box" :class="healthResult.success ? 'result-box--ok' : 'result-box--err'">
          <pre>{{ JSON.stringify(healthResult, null, 2) }}</pre>
        </div>
      </section>

      <!-- Step 1: 注册 -->
      <section ref="stepRefs" :data-step="1" :class="['demo-step', { 'demo-step--done': steps[1].done }]">
        <div class="demo-step__header">
          <span class="demo-step__badge">Step 2</span>
          <h2>用户注册</h2>
        </div>
        <p class="demo-step__desc">通过 Admin API 创建测试用户</p>
        <div class="form-row">
          <MdTextField v-model="regForm.email" label="邮箱" type="email" />
          <MdTextField v-model="regForm.password" label="密码" type="password" />
          <MdTextField v-model="regForm.name" label="用户名" />
        </div>
        <MdButton variant="filled" @click="doRegister">注册用户</MdButton>
        <MdButton variant="outlined" @click="useAdminCreate">用 Admin API 创建</MdButton>
        <div v-if="regResult" class="result-box" :class="regResult.success ? 'result-box--ok' : 'result-box--err'">
          <pre>{{ JSON.stringify(regResult, null, 2) }}</pre>
        </div>
      </section>

      <!-- Step 2: 登录 -->
      <section ref="stepRefs" :data-step="2" :class="['demo-step', { 'demo-step--done': steps[2].done }]">
        <div class="demo-step__header">
          <span class="demo-step__badge">Step 3</span>
          <h2>用户登录</h2>
        </div>
        <p class="demo-step__desc">获取 Session Cookie</p>
        <div class="form-row">
          <MdTextField v-model="loginForm.email" label="邮箱" type="email" />
          <MdTextField v-model="loginForm.password" label="密码" type="password" />
        </div>
        <MdButton variant="filled" @click="doLogin">登录</MdButton>
        <div v-if="loginResult" class="result-box" :class="loginResult.success ? 'result-box--ok' : 'result-box--err'">
          <pre>{{ JSON.stringify(loginResult, null, 2) }}</pre>
        </div>
      </section>

      <!-- Step 3: 创建 OAuth 客户端 -->
      <section ref="stepRefs" :data-step="3" :class="['demo-step', { 'demo-step--done': steps[3].done }]">
        <div class="demo-step__header">
          <span class="demo-step__badge">Step 4</span>
          <h2>创建 OAuth 客户端</h2>
        </div>
        <p class="demo-step__desc">注册一个 OAuth2 应用，获取 client_id 和 client_secret</p>
        <div class="form-row">
          <MdTextField v-model="clientForm.name" label="应用名称" />
          <MdTextField v-model="clientForm.redirectUri" label="回调 URL" />
          <MdTextField v-model="clientForm.homepageUrl" label="主页 URL（可选）" />
        </div>
        <MdButton variant="filled" @click="createClient">创建客户端</MdButton>
        <MdButton variant="outlined" @click="useAdminCreateClient">用 Admin API 创建</MdButton>
        <div v-if="clientResult" class="result-box" :class="clientResult.success ? 'result-box--ok' : 'result-box--err'">
          <pre>{{ JSON.stringify(clientResult, null, 2) }}</pre>
        </div>
      </section>

      <!-- Step 4: 生成 PKCE -->
      <section ref="stepRefs" :data-step="4" :class="['demo-step', { 'demo-step--done': steps[4].done }]">
        <div class="demo-step__header">
          <span class="demo-step__badge">Step 5</span>
          <h2>生成 PKCE 参数</h2>
        </div>
        <p class="demo-step__desc">OAuth 2.1 强制 PKCE，客户端先生成 code_verifier 和 code_challenge</p>
        <MdButton variant="filled" @click="generatePkce">生成 PKCE</MdButton>
        <div v-if="pkce" class="result-box result-box--info">
          <div class="pkce-field"><strong>code_verifier:</strong> <code>{{ pkce.verifier }}</code></div>
          <div class="pkce-field"><strong>code_challenge:</strong> <code>{{ pkce.challenge }}</code></div>
          <div class="pkce-field"><strong>method:</strong> S256</div>
        </div>
      </section>

      <!-- Step 5: 授权 -->
      <section ref="stepRefs" :data-step="5" :class="['demo-step', { 'demo-step--done': steps[5].done }]">
        <div class="demo-step__header">
          <span class="demo-step__badge">Step 6</span>
          <h2>用户授权</h2>
        </div>
        <p class="demo-step__desc">模拟用户在授权页面点击「确认授权」</p>
        <MdButton variant="filled" @click="doAuthorize" :disabled="!pkce">确认授权</MdButton>
        <div v-if="authResult" class="result-box" :class="authResult.success ? 'result-box--ok' : 'result-box--err'">
          <pre>{{ JSON.stringify(authResult, null, 2) }}</pre>
        </div>
      </section>

      <!-- Step 6: 获取 Token -->
      <section ref="stepRefs" :data-step="6" :class="['demo-step', { 'demo-step--done': steps[6].done }]">
        <div class="demo-step__header">
          <span class="demo-step__badge">Step 7</span>
          <h2>换取 Access Token</h2>
        </div>
        <p class="demo-step__desc">用授权码 + PKCE 换取 access_token 和 refresh_token</p>
        <MdButton variant="filled" @click="exchangeToken" :disabled="!authCode">换取 Token</MdButton>
        <div v-if="tokenResult" class="result-box result-box--ok">
          <div class="token-display">
            <div class="token-display__item">
              <strong>access_token:</strong>
              <code class="token-clip">{{ String(tokenResult.access_token || '').slice(0, 50) }}...</code>
            </div>
            <div class="token-display__item">
              <strong>refresh_token:</strong>
              <code class="token-clip">{{ String(tokenResult.refresh_token || '').slice(0, 50) }}...</code>
            </div>
            <div class="token-display__item">
              <strong>expires_in:</strong> {{ tokenResult.expires_in }}s
            </div>
          </div>
        </div>
      </section>

      <!-- Step 7: 调用 UserInfo -->
      <section ref="stepRefs" :data-step="7" :class="['demo-step', { 'demo-step--done': steps[7].done }]">
        <div class="demo-step__header">
          <span class="demo-step__badge">Step 8</span>
          <h2>调用 UserInfo</h2>
        </div>
        <p class="demo-step__desc">用 access_token 获取用户信息</p>
        <MdButton variant="filled" @click="getUserInfo" :disabled="!accessToken">获取用户信息</MdButton>
        <div v-if="userInfoResult" class="result-box result-box--ok">
          <pre>{{ JSON.stringify(userInfoResult, null, 2) }}</pre>
        </div>
      </section>

      <!-- Step 8: Token Introspection -->
      <section ref="stepRefs" :data-step="8" :class="['demo-step', { 'demo-step--done': steps[8].done }]">
        <div class="demo-step__header">
          <span class="demo-step__badge">Step 9</span>
          <h2>Token 内省</h2>
        </div>
        <p class="demo-step__desc">查询 token 状态（RFC 7662）</p>
        <MdButton variant="filled" @click="introspectToken" :disabled="!accessToken">内省 Token</MdButton>
        <div v-if="introspectResult" class="result-box result-box--info">
          <pre>{{ JSON.stringify(introspectResult, null, 2) }}</pre>
        </div>
      </section>

      <!-- Step 9: 刷新 Token -->
      <section ref="stepRefs" :data-step="9" :class="['demo-step', { 'demo-step--done': steps[9].done }]">
        <div class="demo-step__header">
          <span class="demo-step__badge">Step 10</span>
          <h2>刷新 Token</h2>
        </div>
        <p class="demo-step__desc">用 refresh_token 获取新的 access_token（轮换机制）</p>
        <MdButton variant="filled" @click="refreshToken" :disabled="!refreshTokenValue">刷新 Token</MdButton>
        <div v-if="refreshResult" class="result-box result-box--ok">
          <pre>{{ JSON.stringify(refreshResult, null, 2) }}</pre>
        </div>
      </section>

      <!-- Step 10: 吊销 Token -->
      <section ref="stepRefs" :data-step="10" :class="['demo-step', { 'demo-step--done': steps[10].done }]">
        <div class="demo-step__header">
          <span class="demo-step__badge">Step 11</span>
          <h2>吊销 Token</h2>
        </div>
        <p class="demo-step__desc">吊销 access_token（RFC 7009）</p>
        <MdButton variant="filled" @click="revokeToken" :disabled="!accessToken">吊销 Token</MdButton>
        <div v-if="revokeResult !== null" class="result-box result-box--ok">
          <pre>{{ JSON.stringify(revokeResult, null, 2) }}</pre>
        </div>
      </section>

      <!-- 完整流程日志 -->
      <section class="demo-step demo-step--log">
        <div class="demo-step__header">
          <h2>流程日志</h2>
          <MdButton variant="text" @click="clearLog">清空</MdButton>
        </div>
        <div class="log-box">
          <div v-for="(log, i) in flowLog" :key="i" class="log-entry">
            <span class="log-entry__time">{{ log.time }}</span>
            <span :class="['log-entry__type', `log-entry__type--${log.type}`]">{{ log.type.toUpperCase() }}</span>
            <span class="log-entry__msg">{{ log.message }}</span>
          </div>
          <div v-if="flowLog.length === 0" class="log-empty">暂无日志</div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { MdButton, MdTextField } from '../components'

// =========================================================================
// 状态管理
// =========================================================================

const config = reactive({
  authHost: window.location.origin,
  adminToken: '',
})

const steps = reactive([
  { title: '环境配置', done: false },
  { title: '用户注册', done: false },
  { title: '用户登录', done: false },
  { title: '创建客户端', done: false },
  { title: '生成 PKCE', done: false },
  { title: '用户授权', done: false },
  { title: '换取 Token', done: false },
  { title: '调用 UserInfo', done: false },
  { title: 'Token 内省', done: false },
  { title: '刷新 Token', done: false },
  { title: '吊销 Token', done: false },
])

const currentStep = ref(0)
const stepRefs = ref<HTMLElement[]>([])
const flowLog = ref<Array<{ time: string; type: string; message: string }>>([])

// 表单数据
const regForm = reactive({ email: '', password: '', name: '' })
const loginForm = reactive({ email: '', password: '' })
const clientForm = reactive({ name: '', redirectUri: `${window.location.origin}/callback`, homepageUrl: '' })

// 结果数据
const healthResult = ref<Record<string, unknown> | null>(null)
const regResult = ref<Record<string, unknown> | null>(null)
const loginResult = ref<Record<string, unknown> | null>(null)
const clientResult = ref<Record<string, unknown> | null>(null)
const pkce = ref<{ verifier: string; challenge: string } | null>(null)
const authResult = ref<Record<string, unknown> | null>(null)
const tokenResult = ref<Record<string, unknown> | null>(null)
const userInfoResult = ref<Record<string, unknown> | null>(null)
const introspectResult = ref<Record<string, unknown> | null>(null)
const refreshResult = ref<Record<string, unknown> | null>(null)
const revokeResult = ref<Record<string, unknown> | null>(null)

// 流程中间状态
const authCode = ref('')
const accessToken = ref('')
const refreshTokenValue = ref('')
const clientId = ref('')
const clientSecret = ref('')
const userId = ref('')

// =========================================================================
// 工具函数
// =========================================================================

function log(message: string, type: string = 'info') {
  const now = new Date()
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
  flowLog.value.push({ time, type, message })
}

function clearLog() {
  flowLog.value = []
}

function markStepDone(index: number) {
  steps[index].done = true
  if (index + 1 < steps.length) {
    currentStep.value = index + 1
  }
}

function scrollToStep(index: number) {
  const el = (stepRefs.value as unknown as HTMLElement[])[index]
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function sha256(data: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return new Uint8Array(buf)
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => chars[b % chars.length]).join('')
}

// =========================================================================
// Step 1: 测试连接
// =========================================================================

async function testHealth() {
  try {
    const res = await fetch(`${config.authHost}/api/health`)
    healthResult.value = await res.json() as Record<string, unknown>
    if (res.ok) {
      steps[0].done = true
      currentStep.value = 1
      log('连接成功', 'ok')
    } else {
      log('连接失败', 'error')
    }
  } catch (e) {
    healthResult.value = { error: String(e) }
    log(`连接失败: ${e}`, 'error')
  }
}

// =========================================================================
// Step 2: 注册
// =========================================================================

async function doRegister() {
  log('正在注册用户...')
  try {
    const res = await fetch(`${config.authHost}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(regForm),
      credentials: 'include',
    })
    const data = await res.json() as Record<string, unknown>
    regResult.value = data
    if (res.ok) {
      userId.value = (data.data as Record<string, string>)?.id || ''
      loginForm.email = regForm.email
      loginForm.password = regForm.password
      markStepDone(1)
      log(`注册成功: ${regForm.email}`, 'ok')
    } else {
      log(`注册失败: ${data.error}`, 'error')
    }
  } catch (e) {
    regResult.value = { error: String(e) }
    log(`注册异常: ${e}`, 'error')
  }
}

async function useAdminCreate() {
  if (!config.adminToken) {
    log('请先填写 Admin Token', 'error')
    return
  }
  log('通过 Admin API 创建用户...')
  try {
    const url = new URL(`${config.authHost}/api/admin/users`)
    url.searchParams.set('action', 'create')
    url.searchParams.set('email', regForm.email)
    url.searchParams.set('password', regForm.password)
    url.searchParams.set('name', regForm.name)
    url.searchParams.set('admin_token', config.adminToken)

    const res = await fetch(url.toString())
    const data = await res.json() as Record<string, unknown>
    regResult.value = data
    if (res.ok) {
      userId.value = (data.data as Record<string, string>)?.id || ''
      loginForm.email = regForm.email
      loginForm.password = regForm.password
      markStepDone(1)
      log(`Admin API 创建用户成功: ${regForm.email}`, 'ok')
    } else {
      log(`Admin API 创建失败: ${data.error}`, 'error')
    }
  } catch (e) {
    regResult.value = { error: String(e) }
    log(`Admin API 异常: ${e}`, 'error')
  }
}

// =========================================================================
// Step 3: 登录
// =========================================================================

async function doLogin() {
  log('正在登录...')
  try {
    const res = await fetch(`${config.authHost}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm),
      credentials: 'include',
    })
    const data = await res.json() as Record<string, unknown>
    loginResult.value = data
    if (res.ok) {
      userId.value = (data.data as Record<string, string>)?.id || userId.value
      markStepDone(2)
      log('登录成功', 'ok')
    } else {
      log(`登录失败: ${data.error}`, 'error')
    }
  } catch (e) {
    loginResult.value = { error: String(e) }
    log(`登录异常: ${e}`, 'error')
  }
}

// =========================================================================
// Step 4: 创建客户端
// =========================================================================

async function createClient() {
  log('正在创建 OAuth 客户端...')
  try {
    const res = await fetch(`${config.authHost}/api/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: clientForm.name,
        redirectUris: [clientForm.redirectUri],
        homepageUrl: clientForm.homepageUrl,
      }),
      credentials: 'include',
    })
    const data = await res.json() as Record<string, unknown>
    clientResult.value = data
    if (res.ok) {
      const c = data.data as Record<string, string>
      clientId.value = c.clientId
      clientSecret.value = c.clientSecret
      markStepDone(3)
      log(`客户端创建成功: ${clientId.value}`, 'ok')
    } else {
      log(`创建失败: ${data.error}`, 'error')
    }
  } catch (e) {
    clientResult.value = { error: String(e) }
    log(`创建异常: ${e}`, 'error')
  }
}

async function useAdminCreateClient() {
  if (!config.adminToken) {
    log('请先填写 Admin Token', 'error')
    return
  }
  if (!userId.value) {
    log('请先注册/登录用户（需要 owner_id）', 'error')
    return
  }
  log('通过 Admin API 创建客户端...')
  try {
    const url = new URL(`${config.authHost}/api/admin/clients`)
    url.searchParams.set('action', 'create')
    url.searchParams.set('name', clientForm.name)
    url.searchParams.set('redirect_uris', clientForm.redirectUri)
    url.searchParams.set('owner_id', userId.value)
    url.searchParams.set('admin_token', config.adminToken)

    const res = await fetch(url.toString())
    const data = await res.json() as Record<string, unknown>
    clientResult.value = data
    if (res.ok) {
      const c = data.data as Record<string, string>
      clientId.value = c.clientId
      clientSecret.value = c.clientSecret
      markStepDone(3)
      log(`Admin API 创建客户端成功: ${clientId.value}`, 'ok')
    } else {
      log(`Admin API 创建失败: ${data.error}`, 'error')
    }
  } catch (e) {
    clientResult.value = { error: String(e) }
    log(`Admin API 异常: ${e}`, 'error')
  }
}

// =========================================================================
// Step 5: 生成 PKCE
// =========================================================================

async function generatePkce() {
  const verifier = randomString(64)
  const challenge = base64url(await sha256(verifier))
  pkce.value = { verifier, challenge }
  markStepDone(4)
  log('PKCE 参数已生成', 'ok')
}

// =========================================================================
// Step 6: 授权
// =========================================================================

async function doAuthorize() {
  if (!clientId.value || !pkce.value) {
    log('缺少 client_id 或 PKCE 参数', 'error')
    return
  }
  log('正在请求授权...')
  try {
    const res = await fetch(`${config.authHost}/api/oauth/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: clientId.value,
        redirectUri: clientForm.redirectUri,
        codeChallenge: pkce.value.challenge,
        scope: 'profile email',
        state: 'demo-state',
        action: 'confirm',
      }),
      credentials: 'include',
    })

    // 授权成功返回 302 重定向，Location header 中包含 code
    const location = res.headers.get('Location')
    if (location) {
      const redirectUrl = new URL(location)
      authCode.value = redirectUrl.searchParams.get('code') || ''
      authResult.value = {
        success: true,
        code: authCode.value,
        state: redirectUrl.searchParams.get('state'),
      }
      markStepDone(5)
      log(`授权成功，获得 code: ${authCode.value.slice(0, 20)}...`, 'ok')
    } else {
      const data = await res.json() as Record<string, unknown>
      authResult.value = data
      log(`授权失败: ${data.error}`, 'error')
    }
  } catch (e) {
    authResult.value = { error: String(e) }
    log(`授权异常: ${e}`, 'error')
  }
}

// =========================================================================
// Step 7: 换取 Token
// =========================================================================

async function exchangeToken() {
  if (!authCode.value || !pkce.value || !clientId.value) {
    log('缺少 code、PKCE 或 client_id', 'error')
    return
  }
  log('正在换取 Token...')
  try {
    const res = await fetch(`${config.authHost}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: authCode.value,
        code_verifier: pkce.value.verifier,
        client_id: clientId.value,
        client_secret: clientSecret.value,
        redirect_uri: clientForm.redirectUri,
      }),
    })
    const data = await res.json() as Record<string, unknown>
    tokenResult.value = data
    if (res.ok) {
      accessToken.value = data.access_token as string
      refreshTokenValue.value = data.refresh_token as string
      markStepDone(6)
      log('Token 获取成功', 'ok')
    } else {
      log(`换取失败: ${data.error}`, 'error')
    }
  } catch (e) {
    tokenResult.value = { error: String(e) }
    log(`换取异常: ${e}`, 'error')
  }
}

// =========================================================================
// Step 8: 调用 UserInfo
// =========================================================================

async function getUserInfo() {
  if (!accessToken.value) {
    log('缺少 access_token', 'error')
    return
  }
  log('正在获取用户信息...')
  try {
    const res = await fetch(`${config.authHost}/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken.value}` },
    })
    const data = await res.json() as Record<string, unknown>
    userInfoResult.value = data
    if (res.ok) {
      markStepDone(7)
      log(`获取成功: ${data.name}`, 'ok')
    } else {
      log(`获取失败: ${data.error}`, 'error')
    }
  } catch (e) {
    userInfoResult.value = { error: String(e) }
    log(`获取异常: ${e}`, 'error')
  }
}

// =========================================================================
// Step 9: Token 内省
// =========================================================================

async function introspectToken() {
  if (!accessToken.value) {
    log('缺少 access_token', 'error')
    return
  }
  log('正在内省 Token...')
  try {
    const res = await fetch(`${config.authHost}/api/oauth/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: accessToken.value,
        client_id: clientId.value,
        client_secret: clientSecret.value,
      }),
    })
    const data = await res.json() as Record<string, unknown>
    introspectResult.value = data
    if (res.ok && data.active) {
      markStepDone(8)
      log('Token 状态: active', 'ok')
    } else {
      log('Token 状态: inactive', 'warn')
    }
  } catch (e) {
    introspectResult.value = { error: String(e) }
    log(`内省异常: ${e}`, 'error')
  }
}

// =========================================================================
// Step 10: 刷新 Token
// =========================================================================

async function refreshToken() {
  if (!refreshTokenValue.value) {
    log('缺少 refresh_token', 'error')
    return
  }
  log('正在刷新 Token...')
  try {
    const res = await fetch(`${config.authHost}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshTokenValue.value,
        client_id: clientId.value,
        client_secret: clientSecret.value,
      }),
    })
    const data = await res.json() as Record<string, unknown>
    refreshResult.value = data
    if (res.ok) {
      accessToken.value = data.access_token as string
      refreshTokenValue.value = data.refresh_token as string
      markStepDone(9)
      log('Token 刷新成功（轮换完成）', 'ok')
    } else {
      log(`刷新失败: ${data.error}`, 'error')
    }
  } catch (e) {
    refreshResult.value = { error: String(e) }
    log(`刷新异常: ${e}`, 'error')
  }
}

// =========================================================================
// Step 11: 吊销 Token
// =========================================================================

async function revokeToken() {
  if (!accessToken.value) {
    log('缺少 access_token', 'error')
    return
  }
  log('正在吊销 Token...')
  try {
    const res = await fetch(`${config.authHost}/api/oauth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: accessToken.value,
        client_id: clientId.value,
        client_secret: clientSecret.value,
      }),
    })
    const data = await res.json() as Record<string, unknown>
    revokeResult.value = data
    markStepDone(10)
    log('Token 已吊销', 'ok')
  } catch (e) {
    revokeResult.value = { error: String(e) }
    log(`吊销异常: ${e}`, 'error')
  }
}
</script>

<style scoped>
.api-demo {
  display: flex;
  max-width: 1200px;
  margin: 0 auto;
  gap: 32px;
}

/* 侧边导航 */
.step-nav {
  position: sticky;
  top: 80px;
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.step-nav__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--md-sys-shape-corner-medium);
  font-family: inherit;
  font-size: 13px;
  color: var(--md-sys-color-on-surface-variant);
  transition: background 0.2s;
  text-align: left;
}
.step-nav__item:hover {
  background: var(--md-sys-color-surface-variant);
}
.step-nav__item--active {
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
  font-weight: 500;
}
.step-nav__num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--md-sys-color-surface-variant);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
}
.step-nav__item--active .step-nav__num {
  background: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
}
.step-nav__label {
  flex: 1;
}
.step-nav__check {
  color: var(--md-sys-color-primary);
  font-weight: bold;
}

/* 主内容 */
.demo-content {
  flex: 1;
  min-width: 0;
}

/* 步骤卡片 */
.demo-step {
  padding: 24px;
  margin-bottom: 16px;
  border-radius: var(--md-sys-shape-corner-large);
  background: var(--md-sys-color-surface);
  border: 1px solid var(--md-sys-color-outline-variant);
  transition: border-color 0.2s;
}
.demo-step--done {
  border-color: var(--md-sys-color-primary);
}
.demo-step--log {
  background: var(--md-sys-color-surface-variant);
}
.demo-step__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.demo-step__header h2 {
  font-size: 20px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
  margin: 0;
}
.demo-step__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 10px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  font-size: 12px;
  font-weight: 500;
}
.demo-step__desc {
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 16px;
}

/* 表单 */
.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

/* 结果框 */
.result-box {
  margin-top: 16px;
  padding: 12px 16px;
  border-radius: var(--md-sys-shape-corner-medium);
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.6;
}
.result-box pre {
  margin: 0;
  font-family: 'Fira Code', 'Cascadia Code', monospace;
  white-space: pre-wrap;
  word-break: break-all;
}
.result-box--ok {
  background: rgba(52, 168, 83, 0.1);
  border: 1px solid rgba(52, 168, 83, 0.3);
}
.result-box--err {
  background: rgba(234, 67, 53, 0.1);
  border: 1px solid rgba(234, 67, 53, 0.3);
}
.result-box--info {
  background: rgba(66, 133, 244, 0.1);
  border: 1px solid rgba(66, 133, 244, 0.3);
}

/* PKCE */
.pkce-field {
  margin-bottom: 8px;
}
.pkce-field code {
  font-family: 'Fira Code', 'Cascadia Code', monospace;
  font-size: 12px;
  word-break: break-all;
}

/* Token 展示 */
.token-display__item {
  margin-bottom: 8px;
}
.token-clip {
  font-family: 'Fira Code', 'Cascadia Code', monospace;
  font-size: 12px;
  word-break: break-all;
  color: var(--md-sys-color-on-surface-variant);
}

/* 日志 */
.log-box {
  max-height: 300px;
  overflow-y: auto;
  font-size: 13px;
  font-family: 'Fira Code', 'Cascadia Code', monospace;
}
.log-entry {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}
.log-entry__time {
  color: var(--md-sys-color-on-surface-variant);
  flex-shrink: 0;
}
.log-entry__type {
  font-weight: 500;
  flex-shrink: 0;
  width: 50px;
}
.log-entry__type--ok { color: #34a853; }
.log-entry__type--error { color: #ea4333; }
.log-entry__type--warn { color: #f9ab00; }
.log-entry__type--info { color: #4285f4; }
.log-entry__msg {
  flex: 1;
  word-break: break-all;
}
.log-empty {
  color: var(--md-sys-color-on-surface-variant);
  text-align: center;
  padding: 20px;
}

/* 响应式 */
@media (max-width: 900px) {
  .api-demo {
    flex-direction: column;
  }
  .step-nav {
    position: static;
    flex-direction: row;
    overflow-x: auto;
    width: 100%;
    padding-bottom: 8px;
  }
  .step-nav__item {
    flex-shrink: 0;
  }
  .step-nav__label {
    display: none;
  }
}
</style>
