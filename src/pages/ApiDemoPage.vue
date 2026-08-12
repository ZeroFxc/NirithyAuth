<template>
  <div class="api-demo">
    <!-- 顶部控制栏 -->
    <div class="demo-hero">
      <h1>OAuth 2.1 完整流程测试</h1>
      <p>所有数据已预填，点击下方按钮即可自动跑完全部流程</p>
      <div class="hero-actions">
        <button class="btn-run" :disabled="running" @click="runAll">
          {{ running ? '正在运行...' : '一键自动测试全流程' }}
        </button>
        <button v-if="running" class="btn-stop" @click="stopRequested = true">停止</button>
        <button class="btn-reset" @click="resetAll">重置</button>
      </div>
      <!-- 总体进度 -->
      <div v-if="running || done" class="progress-bar">
        <div class="progress-bar__fill" :style="{ width: progressPercent + '%' }" />
        <span class="progress-bar__text">{{ doneCount }} / {{ steps.length }}</span>
      </div>
    </div>

    <!-- 配置区（折叠） -->
    <details class="config-section">
      <summary>配置（一般不用改）</summary>
      <div class="config-row">
        <label>Auth 服务地址<input v-model="config.authHost" /></label>
        <label>Admin Token（可选）<input v-model="config.adminToken" type="password" placeholder="留空则用普通注册" /></label>
      </div>
    </details>

    <!-- 步骤列表 -->
    <div class="steps">
      <div v-for="(step, i) in steps" :key="i" :class="['step', stepClass(i)]">
        <div class="step__head">
          <span class="step__num">
            <span v-if="step.status === 'done'">&#10003;</span>
            <span v-else-if="step.status === 'running'">&#8635;</span>
            <span v-else>{{ i + 1 }}</span>
          </span>
          <span class="step__title">{{ step.title }}</span>
          <span v-if="step.status === 'done'" class="step__ok">OK</span>
          <span v-if="step.status === 'error'" class="step__err">FAIL</span>
          <span v-if="step.status === 'running'" class="step__run">RUNNING</span>
        </div>
        <div v-if="step.result !== null" class="step__body">
          <pre>{{ formatResult(step.result) }}</pre>
        </div>
      </div>
    </div>

    <!-- 汇总信息 -->
    <div v-if="summary" class="summary">
      <h2>测试结果汇总</h2>
      <table>
        <tr><td>测试用户</td><td><code>{{ summary.email }}</code></td></tr>
        <tr><td>用户 ID</td><td><code>{{ summary.userId }}</code></td></tr>
        <tr><td>客户端 ID</td><td><code>{{ summary.clientId }}</code></td></tr>
        <tr><td>客户端 Secret</td><td><code>{{ summary.clientSecret }}</code></td></tr>
        <tr><td>Access Token</td><td><code>{{ summary.accessToken?.slice(0, 60) }}...</code></td></tr>
        <tr><td>Refresh Token</td><td><code>{{ summary.refreshToken?.slice(0, 60) }}...</code></td></tr>
        <tr><td>UserInfo</td><td><code>{{ JSON.stringify(summary.userInfo) }}</code></td></tr>
        <tr><td>Introspection</td><td><code>{{ JSON.stringify(summary.introspection) }}</code></td></tr>
        <tr><td>整体状态</td><td><strong :class="summary.allPassed ? 'pass' : 'fail'">{{ summary.allPassed ? '全部通过' : '部分失败' }}</strong></td></tr>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'

// =========================================================================
// 配置 & 预填数据
// =========================================================================

const config = reactive({
  authHost: window.location.origin,
  adminToken: '',
})

// 预填测试数据 — 用户无需输入任何内容
const testData = {
  email: `test_${Date.now().toString(36)}@nirithy.test`,
  password: 'Test@12345678',
  name: 'Auto Test User',
  clientName: 'Auto Test Client',
  redirectUri: `${window.location.origin}/callback`,
}

// =========================================================================
// 步骤状态
// =========================================================================

interface Step {
  title: string
  status: 'idle' | 'running' | 'done' | 'error'
  result: Record<string, unknown> | null
}

const steps = reactive<Step[]>([
  { title: '1. 注册测试用户', status: 'idle', result: null },
  { title: '2. 用户登录', status: 'idle', result: null },
  { title: '3. 创建 OAuth 客户端', status: 'idle', result: null },
  { title: '4. 生成 PKCE 参数', status: 'idle', result: null },
  { title: '5. 用户授权确认', status: 'idle', result: null },
  { title: '6. 换取 Access Token', status: 'idle', result: null },
  { title: '7. 调用 UserInfo', status: 'idle', result: null },
  { title: '8. Token 内省 (Introspection)', status: 'idle', result: null },
  { title: '9. 刷新 Token (轮换)', status: 'idle', result: null },
  { title: '10. 吊销 Token', status: 'idle', result: null },
])

const running = ref(false)
const stopRequested = ref(false)
const done = ref(false)

const doneCount = computed(() => steps.filter(s => s.status === 'done').length)
const progressPercent = computed(() => (doneCount.value / steps.length) * 100)

// 运行中收集的数据
const flow = reactive({
  userId: '',
  clientId: '',
  clientSecret: '',
  authCode: '',
  pkceVerifier: '',
  pkceChallenge: '',
  accessToken: '',
  refreshToken: '',
  userInfo: null as Record<string, unknown> | null,
  introspection: null as Record<string, unknown> | null,
})

const summary = ref<{
  email: string
  userId: string
  clientId: string
  clientSecret: string
  accessToken: string
  refreshToken: string
  userInfo: Record<string, unknown> | null
  introspection: Record<string, unknown> | null
  allPassed: boolean
} | null>(null)

// =========================================================================
// 工具函数
// =========================================================================

function stepClass(i: number) {
  return {
    'step--done': steps[i].status === 'done',
    'step--running': steps[i].status === 'running',
    'step--error': steps[i].status === 'error',
  }
}

function formatResult(result: Record<string, unknown>): string {
  return JSON.stringify(result, null, 2)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => chars[b % chars.length]).join('')
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

function resetAll() {
  steps.forEach(s => { s.status = 'idle'; s.result = null })
  running.value = false
  done.value = false
  stopRequested.value = false
  summary.value = null
  Object.assign(flow, {
    userId: '', clientId: '', clientSecret: '', authCode: '',
    pkceVerifier: '', pkceChallenge: '', accessToken: '', refreshToken: '',
    userInfo: null, introspection: null,
  })
}

// =========================================================================
// API 调用函数
// =========================================================================

async function apiRegister(): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.authHost}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testData.email, password: testData.password, name: testData.name }),
    credentials: 'include',
  })
  return { ...(await res.json()), httpStatus: res.status }
}

async function apiLogin(): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.authHost}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testData.email, password: testData.password }),
    credentials: 'include',
  })
  return { ...(await res.json()), httpStatus: res.status }
}

async function apiCreateClient(): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.authHost}/api/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: testData.clientName,
      redirectUris: [testData.redirectUri],
      homepageUrl: config.authHost,
    }),
    credentials: 'include',
  })
  return { ...(await res.json()), httpStatus: res.status }
}

async function apiAuthorize(challenge: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.authHost}/api/oauth/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: flow.clientId,
      redirectUri: testData.redirectUri,
      codeChallenge: challenge,
      scope: 'profile email',
      state: 'auto-test-state',
      action: 'confirm',
    }),
    credentials: 'include',
  })
  const location = res.headers.get('Location')
  if (location) {
    const url = new URL(location)
    const code = url.searchParams.get('code') || ''
    return { success: true, code, state: url.searchParams.get('state'), redirectUrl: location }
  }
  return { ...(await res.json()), httpStatus: res.status }
}

async function apiExchangeToken(code: string, verifier: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.authHost}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: flow.clientId,
      client_secret: flow.clientSecret,
      redirect_uri: testData.redirectUri,
    }),
  })
  return { ...(await res.json()), httpStatus: res.status }
}

async function apiUserInfo(token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.authHost}/api/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return { ...(await res.json()), httpStatus: res.status }
}

async function apiIntrospect(token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.authHost}/api/oauth/introspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      client_id: flow.clientId,
      client_secret: flow.clientSecret,
    }),
  })
  return { ...(await res.json()), httpStatus: res.status }
}

async function apiRefreshToken(token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.authHost}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: token,
      client_id: flow.clientId,
      client_secret: flow.clientSecret,
    }),
  })
  return { ...(await res.json()), httpStatus: res.status }
}

async function apiRevokeToken(token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.authHost}/api/oauth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      client_id: flow.clientId,
      client_secret: flow.clientSecret,
    }),
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { success: true, httpStatus: res.status } }
}

// =========================================================================
// 一键运行全流程
// =========================================================================

async function runStep(i: number, fn: () => Promise<Record<string, unknown>>): Promise<boolean> {
  if (stopRequested.value) return false
  steps[i].status = 'running'
  await sleep(300) // 视觉反馈
  try {
    const result = await fn()
    steps[i].result = result
    if (result.error || Number(result.httpStatus) >= 400) {
      steps[i].status = 'error'
      return false
    }
    steps[i].status = 'done'
    return true
  } catch (e) {
    steps[i].result = { error: String(e) }
    steps[i].status = 'error'
    return false
  }
}

async function runAll() {
  resetAll()
  running.value = true
  stopRequested.value = false
  let allPassed = true

  // Step 0: 注册
  if (!await runStep(0, apiRegister)) { allPassed = false; gotoEnd(allPassed); return }
  flow.userId = (steps[0].result!.data as Record<string, string>)?.id || ''

  // Step 1: 登录
  if (!await runStep(1, apiLogin)) { allPassed = false; gotoEnd(allPassed); return }

  // Step 2: 创建客户端
  if (!await runStep(2, apiCreateClient)) { allPassed = false; gotoEnd(allPassed); return }
  {
    const d = steps[2].result!.data as Record<string, string>
    flow.clientId = d.clientId
    flow.clientSecret = d.clientSecret
  }

  // Step 3: PKCE
  if (!await runStep(3, async () => {
    flow.pkceVerifier = randomString(64)
    flow.pkceChallenge = base64url(await sha256(flow.pkceVerifier))
    return { code_verifier: flow.pkceVerifier.slice(0, 30) + '...', code_challenge: flow.pkceChallenge.slice(0, 30) + '...', method: 'S256' }
  })) { allPassed = false; gotoEnd(allPassed); return }

  // Step 4: 授权
  if (!await runStep(4, () => apiAuthorize(flow.pkceChallenge))) { allPassed = false; gotoEnd(allPassed); return }
  flow.authCode = (steps[4].result!.code as string) || ''

  // Step 5: 换 Token
  if (!await runStep(5, () => apiExchangeToken(flow.authCode, flow.pkceVerifier))) { allPassed = false; gotoEnd(allPassed); return }
  {
    const r = steps[5].result!
    flow.accessToken = r.access_token as string
    flow.refreshToken = r.refresh_token as string
  }

  // Step 6: UserInfo
  if (!await runStep(6, () => apiUserInfo(flow.accessToken))) { allPassed = false }
  flow.userInfo = steps[6].result

  // Step 7: Introspection
  if (!await runStep(7, () => apiIntrospect(flow.accessToken))) { allPassed = false }
  flow.introspection = steps[7].result

  // Step 8: Refresh
  if (!await runStep(8, () => apiRefreshToken(flow.refreshToken))) { allPassed = false }
  {
    const r = steps[8].result!
    if (r.access_token) flow.accessToken = r.access_token as string
    if (r.refresh_token) flow.refreshToken = r.refresh_token as string
  }

  // Step 9: Revoke
  if (!await runStep(9, () => apiRevokeToken(flow.accessToken))) { allPassed = false }

  gotoEnd(allPassed)
}

function gotoEnd(allPassed: boolean) {
  running.value = false
  done.value = true
  summary.value = {
    email: testData.email,
    userId: flow.userId,
    clientId: flow.clientId,
    clientSecret: flow.clientSecret,
    accessToken: flow.accessToken,
    refreshToken: flow.refreshToken,
    userInfo: flow.userInfo,
    introspection: flow.introspection,
    allPassed,
  }
}
</script>

<style scoped>
.api-demo {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

/* Hero */
.demo-hero {
  text-align: center;
  padding: 32px 24px;
  background: var(--md-sys-color-surface);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  margin-bottom: 16px;
}
.demo-hero h1 {
  font-size: 24px;
  margin: 0 0 8px;
}
.demo-hero p {
  color: var(--md-sys-color-on-surface-variant);
  font-size: 14px;
  margin: 0 0 20px;
}
.hero-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.btn-run {
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
  cursor: pointer;
  transition: filter 0.2s;
}
.btn-run:hover:not(:disabled) { filter: brightness(1.1); }
.btn-run:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-stop {
  padding: 14px 24px;
  font-size: 16px;
  border: none;
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-error);
  color: var(--md-sys-color-on-error);
  cursor: pointer;
}
.btn-reset {
  padding: 14px 24px;
  font-size: 16px;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-full);
  background: transparent;
  color: var(--md-sys-color-on-surface);
  cursor: pointer;
}

/* Progress */
.progress-bar {
  margin-top: 16px;
  height: 8px;
  background: var(--md-sys-color-surface-variant);
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}
.progress-bar__fill {
  height: 100%;
  background: var(--md-sys-color-primary);
  border-radius: 4px;
  transition: width 0.4s ease;
}
.progress-bar__text {
  position: absolute;
  right: 8px;
  top: -22px;
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
}

/* Config */
.config-section {
  margin-bottom: 16px;
  padding: 12px 16px;
  background: var(--md-sys-color-surface-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: 14px;
}
.config-section summary {
  cursor: pointer;
  color: var(--md-sys-color-on-surface-variant);
  padding: 4px 0;
}
.config-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
}
.config-row label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
}
.config-row input {
  padding: 8px 12px;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: 4px;
  font-size: 14px;
  background: var(--md-sys-color-surface);
  color: var(--md-sys-color-on-surface);
}

/* Steps */
.steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.step {
  padding: 16px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-surface);
  transition: border-color 0.3s, opacity 0.3s;
  opacity: 0.5;
}
.step--running {
  opacity: 1;
  border-color: var(--md-sys-color-primary);
  border-width: 2px;
}
.step--done {
  opacity: 1;
  border-color: #34a853;
}
.step--error {
  opacity: 1;
  border-color: #ea4333;
  border-width: 2px;
}
.step__head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.step__num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  background: var(--md-sys-color-surface-variant);
  flex-shrink: 0;
}
.step--done .step__num {
  background: #34a853;
  color: white;
}
.step--running .step__num {
  background: var(--md-sys-color-primary);
  color: white;
}
.step--error .step__num {
  background: #ea4333;
  color: white;
}
.step__title {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
}
.step__ok { color: #34a853; font-size: 12px; font-weight: 700; }
.step__err { color: #ea4333; font-size: 12px; font-weight: 700; }
.step__run { color: var(--md-sys-color-primary); font-size: 12px; font-weight: 700; }
.step__body {
  margin-top: 12px;
  padding: 12px;
  background: var(--md-sys-color-surface-variant);
  border-radius: 4px;
  overflow-x: auto;
}
.step__body pre {
  margin: 0;
  font-size: 12px;
  font-family: 'Fira Code', 'Cascadia Code', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
}

/* Summary */
.summary {
  margin-top: 16px;
  padding: 24px;
  border: 2px solid var(--md-sys-color-primary);
  border-radius: var(--md-sys-shape-corner-large);
  background: var(--md-sys-color-surface);
}
.summary h2 {
  margin: 0 0 16px;
  font-size: 20px;
}
.summary table {
  width: 100%;
  border-collapse: collapse;
}
.summary td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  font-size: 13px;
}
.summary td:first-child {
  color: var(--md-sys-color-on-surface-variant);
  white-space: nowrap;
  width: 130px;
}
.summary code {
  font-family: 'Fira Code', 'Cascadia Code', monospace;
  font-size: 12px;
  word-break: break-all;
}
.pass { color: #34a853; }
.fail { color: #ea4333; }

/* Responsive */
@media (max-width: 600px) {
  .config-row { grid-template-columns: 1fr; }
  .hero-actions { flex-direction: column; }
  .btn-run, .btn-stop, .btn-reset { width: 100%; }
}
</style>
