<template>
  <MdContainer class="docs-page">
    <aside class="docs-page__sidebar">
      <nav class="sidebar-nav">
        <a href="#overview" class="sidebar-nav__item">概述</a>
        <a href="#quick-start" class="sidebar-nav__item">快速开始</a>
        <a href="#oauth-flow" class="sidebar-nav__item">OAuth 2.1 流程</a>
        <a href="#pkce" class="sidebar-nav__item">PKCE 说明</a>
        <a href="#endpoints" class="sidebar-nav__item">API 端点</a>
        <a href="#authorize" class="sidebar-nav__item sidebar-nav__item--sub">/authorize</a>
        <a href="#token" class="sidebar-nav__item sidebar-nav__item--sub">/api/oauth/token</a>
        <a href="#userinfo" class="sidebar-nav__item sidebar-nav__item--sub">/api/oauth/userinfo</a>
        <a href="#revoke" class="sidebar-nav__item sidebar-nav__item--sub">/api/oauth/revoke</a>
        <a href="#errors" class="sidebar-nav__item">错误码</a>
      </nav>
    </aside>

    <main class="docs-page__content">
      <h1>开发文档</h1>

      <!-- 概述 -->
      <section id="overview" class="docs-section">
        <h2>概述</h2>
        <p>Auth System 是一个基于 <strong>OAuth 2.1</strong> 标准的第三方登录平台。接入后，用户可以使用 Auth System 账号登录你的网站。</p>
        <p>核心特性：</p>
        <ul>
          <li>OAuth 2.1 授权码流程（Authorization Code Grant）</li>
          <li>强制 PKCE（S256），无需客户端密钥即可安全授权</li>
          <li>Refresh Token 轮换 + 重放检测</li>
          <li>JWT access_token，自包含用户信息</li>
        </ul>
      </section>

      <!-- 快速开始 -->
      <section id="quick-start" class="docs-section">
        <h2>快速开始</h2>

        <div class="docs-step">
          <h3>1. 注册并创建应用</h3>
          <p>注册 Auth System 账号，进入<a href="/developer">开发者中心</a>创建 OAuth2 应用，获取 <code>client_id</code> 和 <code>client_secret</code>。</p>
        </div>

        <div class="docs-step">
          <h3>2. 配置回调 URL</h3>
          <p>在应用设置中添加你的回调 URL，例如 <code>https://yourapp.com/auth/callback</code>。</p>
        </div>

        <div class="docs-step">
          <h3>3. 实现登录按钮</h3>
          <pre class="code-block"><code>&lt;button onclick="loginWithAuthSystem()"&gt;
  使用 Auth System 登录
&lt;/button&gt;

&lt;script&gt;
async function loginWithAuthSystem() {
  // 生成 PKCE 参数
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  localStorage.setItem('code_verifier', codeVerifier)

  // 生成随机 state
  const state = crypto.randomUUID()
  localStorage.setItem('oauth_state', state)

  // 跳转到授权页面
  const params = new URLSearchParams({
    client_id: 'YOUR_CLIENT_ID',
    redirect_uri: 'https://yourapp.com/auth/callback',
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: 'profile email',
    state: state
  })
  location.href = 'https://auth.xn--kiv483g.online/authorize?' + params
}

// PKCE 工具函数
function generateCodeVerifier() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const arr = new Uint8Array(64)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => chars[b % chars.length]).join('')
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
&lt;/script&gt;</code></pre>
        </div>

        <div class="docs-step">
          <h3>4. 处理回调</h3>
          <pre class="code-block"><code>// 在回调页面 https://yourapp.com/auth/callback
async function handleCallback() {
  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  const state = params.get('state')

  // 验证 state 防止 CSRF
  const savedState = localStorage.getItem('oauth_state')
  if (state !== savedState) {
    throw new Error('State 不匹配，可能存在 CSRF 攻击')
  }

  // 获取之前保存的 code_verifier
  const codeVerifier = localStorage.getItem('code_verifier')

  // 用 code 换取 token
  const res = await fetch('https://auth.xn--kiv483g.online/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: code,
      code_verifier: codeVerifier,
      client_id: 'YOUR_CLIENT_ID',
      client_secret: 'YOUR_CLIENT_SECRET',
      redirect_uri: 'https://yourapp.com/auth/callback'
    })
  })

  const data = await res.json()
  // 保存 token
  localStorage.setItem('access_token', data.access_token)
  localStorage.setItem('refresh_token', data.refresh_token)

  // 获取用户信息
  const userRes = await fetch('https://auth.xn--kiv483g.online/api/oauth/userinfo', {
    headers: { 'Authorization': 'Bearer ' + data.access_token }
  })
  const user = await userRes.json()
  console.log('登录成功:', user)
}</code></pre>
        </div>
      </section>

      <!-- OAuth 2.1 流程 -->
      <section id="oauth-flow" class="docs-section">
        <h2>OAuth 2.1 授权流程</h2>
        <div class="flow-diagram">
          <div class="flow-step">
            <div class="flow-step__num">1</div>
            <div class="flow-step__content">
              <strong>生成 PKCE 参数</strong>
              <p>第三方网站生成 <code>code_verifier</code> 和 <code>code_challenge</code></p>
            </div>
          </div>
          <div class="flow-arrow">→</div>
          <div class="flow-step">
            <div class="flow-step__num">2</div>
            <div class="flow-step__content">
              <strong>跳转授权页</strong>
              <p>用户被重定向到 Auth System 的 <code>/authorize</code> 页面</p>
            </div>
          </div>
          <div class="flow-arrow">→</div>
          <div class="flow-step">
            <div class="flow-step__num">3</div>
            <div class="flow-step__content">
              <strong>用户确认</strong>
              <p>用户登录并确认授权后，浏览器重定向回回调 URL，携带 <code>code</code></p>
            </div>
          </div>
          <div class="flow-arrow">→</div>
          <div class="flow-step">
            <div class="flow-step__num">4</div>
            <div class="flow-step__content">
              <strong>换取 token</strong>
              <p>第三方服务器用 <code>code</code> + <code>code_verifier</code> 换取 <code>access_token</code></p>
            </div>
          </div>
          <div class="flow-arrow">→</div>
          <div class="flow-step">
            <div class="flow-step__num">5</div>
            <div class="flow-step__content">
              <strong>获取用户信息</strong>
              <p>用 <code>access_token</code> 调用 <code>/api/oauth/userinfo</code></p>
            </div>
          </div>
        </div>
      </section>

      <!-- PKCE -->
      <section id="pkce" class="docs-section">
        <h2>PKCE 说明</h2>
        <p>PKCE（Proof Key for Code Exchange）是 OAuth 2.1 强制要求的安全机制，防止授权码拦截攻击。</p>
        <table class="docs-table">
          <tr><th>参数</th><th>说明</th></tr>
          <tr><td><code>code_verifier</code></td><td>随机字符串，长度 43-128，字符集 <code>A-Z a-z 0-9 - . _ ~</code></td></tr>
          <tr><td><code>code_challenge</code></td><td><code>base64url(sha256(code_verifier))</code></td></tr>
          <tr><td><code>code_challenge_method</code></td><td>固定为 <code>S256</code></td></tr>
        </table>
      </section>

      <!-- API 端点 -->
      <section id="endpoints" class="docs-section">
        <h2>API 端点</h2>

        <div id="authorize" class="docs-endpoint">
          <h3><span class="method method--get">GET</span> /authorize</h3>
          <p>OAuth 2.1 授权端点，将用户浏览器重定向到此 URL 发起授权。</p>

          <h4>查询参数</h4>
          <table class="docs-table">
            <tr><th>参数</th><th>类型</th><th>必填</th><th>说明</th></tr>
            <tr><td><code>client_id</code></td><td>string</td><td>是</td><td>应用 ID</td></tr>
            <tr><td><code>redirect_uri</code></td><td>string</td><td>是</td><td>回调 URL</td></tr>
            <tr><td><code>response_type</code></td><td>string</td><td>是</td><td>固定为 <code>code</code></td></tr>
            <tr><td><code>code_challenge</code></td><td>string</td><td>是</td><td>PKCE code challenge</td></tr>
            <tr><td><code>code_challenge_method</code></td><td>string</td><td>是</td><td>固定为 <code>S256</code></td></tr>
            <tr><td><code>scope</code></td><td>string</td><td>否</td><td>空格分隔的权限范围，默认 <code>profile</code></td></tr>
            <tr><td><code>state</code></td><td>string</td><td>推荐</td><td>防 CSRF 随机字符串</td></tr>
          </table>

          <h4>可用 scope</h4>
          <table class="docs-table">
            <tr><th>scope</th><th>说明</th></tr>
            <tr><td><code>profile</code></td><td>获取用户昵称、头像</td></tr>
            <tr><td><code>email</code></td><td>获取用户邮箱</td></tr>
          </table>
        </div>

        <div id="token" class="docs-endpoint">
          <h3><span class="method method--post">POST</span> /api/oauth/token</h3>
          <p>用授权码换取 access_token，或刷新 access_token。</p>

          <h4>授权码换 token</h4>
          <p>Content-Type: <code>application/json</code></p>
          <table class="docs-table">
            <tr><th>参数</th><th>类型</th><th>必填</th><th>说明</th></tr>
            <tr><td><code>grant_type</code></td><td>string</td><td>是</td><td><code>authorization_code</code></td></tr>
            <tr><td><code>code</code></td><td>string</td><td>是</td><td>授权码</td></tr>
            <tr><td><code>code_verifier</code></td><td>string</td><td>是</td><td>PKCE code verifier</td></tr>
            <tr><td><code>client_id</code></td><td>string</td><td>是</td><td>应用 ID</td></tr>
            <tr><td><code>client_secret</code></td><td>string</td><td>是</td><td>应用密钥</td></tr>
            <tr><td><code>redirect_uri</code></td><td>string</td><td>是</td><td>必须与授权时一致</td></tr>
          </table>

          <h4>成功响应</h4>
          <pre class="code-block"><code>{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "oBeBi836oQxjbi77ASM...",
  "scope": "profile email"
}</code></pre>

          <h4>刷新 token</h4>
          <table class="docs-table">
            <tr><th>参数</th><th>类型</th><th>必填</th><th>说明</th></tr>
            <tr><td><code>grant_type</code></td><td>string</td><td>是</td><td><code>refresh_token</code></td></tr>
            <tr><td><code>refresh_token</code></td><td>string</td><td>是</td><td>刷新令牌</td></tr>
            <tr><td><code>client_id</code></td><td>string</td><td>是</td><td>应用 ID</td></tr>
            <tr><td><code>client_secret</code></td><td>string</td><td>是</td><td>应用密钥</td></tr>
          </table>
          <p>刷新成功后会返回 <strong>新的</strong> access_token 和 refresh_token，旧的 refresh_token 失效。</p>
        </div>

        <div id="userinfo" class="docs-endpoint">
          <h3><span class="method method--get">GET</span> /api/oauth/userinfo</h3>
          <p>获取当前授权用户的信息。</p>

          <h4>请求头</h4>
          <table class="docs-table">
            <tr><th>Header</th><th>值</th></tr>
            <tr><td><code>Authorization</code></td><td><code>Bearer {access_token}</code></td></tr>
          </table>

          <h4>成功响应</h4>
          <pre class="code-block"><code>{
  "sub": "3fe1c479-cee4-4528-9bf7-7fcf0d83265b",
  "name": "用户名",
  "email": "user@example.com",
  "avatar": null
}</code></pre>
        </div>

        <div id="revoke" class="docs-endpoint">
          <h3><span class="method method--post">POST</span> /api/oauth/revoke</h3>
          <p>吊销 access_token 或 refresh_token。</p>

          <table class="docs-table">
            <tr><th>参数</th><th>类型</th><th>必填</th><th>说明</th></tr>
            <tr><td><code>token</code></td><td>string</td><td>是</td><td>要吊销的 token</td></tr>
            <tr><td><code>token_type_hint</code></td><td>string</td><td>否</td><td><code>access_token</code> 或 <code>refresh_token</code></td></tr>
          </table>
        </div>
      </section>

      <!-- 错误码 -->
      <section id="errors" class="docs-section">
        <h2>错误码</h2>
        <table class="docs-table">
          <tr><th>错误码</th><th>HTTP 状态</th><th>说明</th></tr>
          <tr><td><code>invalid_request</code></td><td>400</td><td>请求参数缺失或格式错误</td></tr>
          <tr><td><code>invalid_client</code></td><td>401</td><td>client_id 或 client_secret 无效</td></tr>
          <tr><td><code>invalid_grant</code></td><td>400</td><td>授权码无效、已过期或 PKCE 验证失败</td></tr>
          <tr><td><code>unsupported_grant_type</code></td><td>400</td><td>不支持的 grant_type</td></tr>
          <tr><td><code>invalid_token</code></td><td>401</td><td>access_token 无效或已过期</td></tr>
          <tr><td><code>access_denied</code></td><td>—</td><td>用户拒绝了授权（回调参数）</td></tr>
          <tr><td><code>server_error</code></td><td>500</td><td>服务器内部错误</td></tr>
        </table>
      </section>
    </main>
  </MdContainer>
</template>

<script setup lang="ts">
import { MdContainer } from '../components'
</script>

<style scoped>
.docs-page {
  display: flex;
  gap: 32px;
  max-width: 1000px;
  padding-top: 32px;
}

.docs-page__sidebar {
  width: 180px;
  flex-shrink: 0;
  position: sticky;
  top: 80px;
  align-self: flex-start;
  max-height: calc(100vh - 100px);
  overflow-y: auto;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-nav__item {
  display: block;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--md-sys-color-on-surface-variant);
  text-decoration: none;
  border-radius: var(--md-sys-shape-corner-extra-small);
  transition: background 0.15s;
}

.sidebar-nav__item:hover {
  background: var(--md-sys-color-surface-variant);
  color: var(--md-sys-color-on-surface);
}

.sidebar-nav__item--sub {
  padding-left: 28px;
  font-size: 12px;
}

.docs-page__content {
  flex: 1;
  min-width: 0;
}

.docs-page__content h1 {
  font-size: 32px;
  font-weight: 400;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 32px;
}

.docs-section {
  margin-bottom: 48px;
}

.docs-section h2 {
  font-size: 22px;
  font-weight: 400;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.docs-section p {
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
  line-height: 1.7;
  margin-bottom: 12px;
}

.docs-section ul {
  padding-left: 20px;
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
  line-height: 1.8;
  margin-bottom: 12px;
}

.docs-section a {
  color: var(--md-sys-color-primary);
}

.docs-step {
  margin-bottom: 24px;
}

.docs-step h3 {
  font-size: 16px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 8px;
}

.docs-step p {
  margin-bottom: 8px;
}

.docs-table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0 16px;
  font-size: 13px;
}

.docs-table th {
  text-align: left;
  padding: 10px 14px;
  background: var(--md-sys-color-surface-variant);
  color: var(--md-sys-color-on-surface);
  font-weight: 500;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.docs-table td {
  padding: 10px 14px;
  color: var(--md-sys-color-on-surface-variant);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.docs-table code {
  font-family: 'Fira Code', 'Cascadia Code', monospace;
  font-size: 12px;
  background: var(--md-sys-color-surface-variant);
  padding: 2px 6px;
  border-radius: 3px;
  color: var(--md-sys-color-on-surface);
}

.code-block {
  background: var(--md-sys-color-surface-variant);
  border-radius: var(--md-sys-shape-corner-small);
  padding: 16px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.7;
  margin: 8px 0 16px;
}

.code-block code {
  font-family: 'Fira Code', 'Cascadia Code', monospace;
  color: var(--md-sys-color-on-surface);
}

.docs-endpoint {
  margin-bottom: 32px;
  padding: 20px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
}

.docs-endpoint h3 {
  font-size: 18px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.docs-endpoint h4 {
  font-size: 14px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
  margin: 16px 0 8px;
}

.method {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  font-family: monospace;
}

.method--get {
  background: #e8f5e9;
  color: #2e7d32;
}

.method--post {
  background: #e3f2fd;
  color: #1565c0;
}

@media (prefers-color-scheme: dark) {
  .method--get {
    background: #1b5e20;
    color: #a5d6a7;
  }
  .method--post {
    background: #0d47a1;
    color: #90caf9;
  }
}

/* 流程图 */
.flow-diagram {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 16px 0;
}

.flow-step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: var(--md-sys-color-surface-variant);
  border-radius: var(--md-sys-shape-corner-small);
}

.flow-step__num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;
  flex-shrink: 0;
}

.flow-step__content strong {
  font-size: 14px;
  color: var(--md-sys-color-on-surface);
}

.flow-step__content p {
  font-size: 13px;
  margin-top: 2px;
  margin-bottom: 0;
}

.flow-arrow {
  text-align: center;
  font-size: 18px;
  color: var(--md-sys-color-outline);
  padding: 4px 0;
}

@media (max-width: 768px) {
  .docs-page {
    flex-direction: column;
  }

  .docs-page__sidebar {
    width: 100%;
    position: static;
    max-height: none;
    overflow-y: visible;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    padding-bottom: 12px;
    margin-bottom: 16px;
  }

  .sidebar-nav {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 4px;
  }

  .sidebar-nav__item--sub {
    display: none;
  }
}
</style>