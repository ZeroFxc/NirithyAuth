<template>
  <MdContainer class="home-page">
    <!-- Hero 区域 -->
    <section class="hero">
      <h1 class="hero__title">统一身份认证</h1>
      <p class="hero__subtitle">OAuth 2.1 第三方登录平台</p>
      <div class="hero__actions">
        <router-link to="/register">
          <MdButton variant="filled">立即注册</MdButton>
        </router-link>
        <router-link to="/login">
          <MdButton variant="outlined">登录</MdButton>
        </router-link>
      </div>
    </section>

    <!-- 使用方式 -->
    <section class="section">
      <h2 class="section__title">如何使用</h2>

      <div class="cards">
        <MdCard variant="elevated" class="card">
          <div class="card__icon">1</div>
          <h3>注册账号</h3>
          <p>创建你的 Auth System 账号，这是接入第三方登录的第一步</p>
        </MdCard>

        <MdCard variant="elevated" class="card">
          <div class="card__icon">2</div>
          <h3>创建应用</h3>
          <p>在开发者中心创建 OAuth2 应用，获取 client_id 和 client_secret</p>
        </MdCard>

        <MdCard variant="elevated" class="card">
          <div class="card__icon">3</div>
          <h3>集成登录</h3>
          <p>在你的网站中接入 OAuth 2.1 授权码流程，让用户一键登录</p>
        </MdCard>
      </div>
    </section>

    <!-- 快速入口 -->
    <section class="section">
      <h2 class="section__title">快速入口</h2>
      <div class="links">
        <router-link to="/developer" class="link-card">
          <span class="link-card__icon">&#9881;</span>
          <div>
            <strong>开发者中心</strong>
            <p>创建和管理 OAuth2 应用</p>
          </div>
        </router-link>
        <router-link to="/dashboard" class="link-card">
          <span class="link-card__icon">&#128100;</span>
          <div>
            <strong>个人中心</strong>
            <p>管理账户和已授权应用</p>
          </div>
        </router-link>
        <router-link to="/testapi" class="link-card link-card--highlight">
          <span class="link-card__icon">&#9889;</span>
          <div>
            <strong>API 对接测试</strong>
            <p>完整的 OAuth 2.1 流程交互式演示</p>
          </div>
        </router-link>
      </div>
    </section>

    <!-- API 端点 -->
    <section class="section">
      <h2 class="section__title">API 端点</h2>
      <MdCard variant="outlined" class="api-table">
        <table>
          <thead>
            <tr><th>端点</th><th>方法</th><th>说明</th></tr>
          </thead>
          <tbody>
            <tr><td><code>/authorize</code></td><td>GET</td><td>OAuth 授权页面</td></tr>
            <tr><td><code>/api/oauth/authorize</code></td><td>POST</td><td>确认/拒绝授权</td></tr>
            <tr><td><code>/api/oauth/token</code></td><td>POST</td><td>授权码换 token / 刷新 token</td></tr>
            <tr><td><code>/api/oauth/userinfo</code></td><td>GET</td><td>获取用户信息</td></tr>
            <tr><td><code>/api/oauth/revoke</code></td><td>POST</td><td>吊销 token</td></tr>
          </tbody>
        </table>
      </MdCard>
    </section>

    <!-- OAuth 2.1 流程说明 -->
    <section class="section">
      <h2 class="section__title">OAuth 2.1 授权流程</h2>
      <MdCard variant="outlined" class="flow-card">
        <pre class="flow-code"><code>// 1. 第三方网站生成 PKCE 参数
const codeVerifier = generateRandomString(64)
const codeChallenge = base64url(sha256(codeVerifier))

// 2. 重定向用户到授权页面（替换 AUTH_HOST 为你的域名）
const authHost = 'https://auth-system-dz8.pages.dev'
location.href = authHost + '/authorize'
  + '?client_id=YOUR_CLIENT_ID'
  + '&redirect_uri=YOUR_CALLBACK_URL'
  + '&response_type=code'
  + '&code_challenge=' + codeChallenge
  + '&code_challenge_method=S256'
  + '&scope=profile email'
  + '&state=random_state'

// 3. 用户确认后，回调 URL 收到 code
// 4. 用 code 换取 token
const res = await fetch(authHost + '/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code',
    code: authCode,
    code_verifier: codeVerifier,
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET',
    redirect_uri: 'YOUR_CALLBACK_URL'
  })
})

// 5. 用 access_token 获取用户信息
const user = await fetch(authHost + '/api/oauth/userinfo', {
  headers: { 'Authorization': 'Bearer ' + accessToken }
})</code></pre>
      </MdCard>
    </section>
  </MdContainer>
</template>

<script setup lang="ts">
import { MdButton, MdCard, MdContainer } from '../components'
</script>

<style scoped>
.home-page {
  max-width: 800px;
}

.hero {
  text-align: center;
  padding: 64px 0 48px;
}
.hero__title {
  font-size: 48px;
  font-weight: 400;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 12px;
}
.hero__subtitle {
  font-size: 16px;
  color: var(--md-sys-color-on-surface-variant);
  max-width: 480px;
  margin: 0 auto 32px;
  line-height: 1.6;
}
.hero__actions {
  display: flex;
  justify-content: center;
  gap: 16px;
}

.section {
  margin-top: 48px;
}
.section__title {
  font-size: 22px;
  font-weight: 400;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 20px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.card {
  text-align: center;
}
.card__icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 500;
  margin: 0 auto 12px;
}
.card h3 {
  font-size: 16px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 8px;
}
.card p {
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
  line-height: 1.5;
}

.links {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.link-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-surface-variant);
  text-decoration: none;
  transition: background 0.2s;
}
.link-card:hover {
  background: var(--md-sys-color-surface-variant);
  filter: brightness(0.95);
}
.link-card--highlight {
  background: var(--md-sys-color-primary-container);
}
.link-card--highlight:hover {
  background: var(--md-sys-color-primary-container);
  filter: brightness(0.95);
}
.link-card--highlight strong {
  color: var(--md-sys-color-on-primary-container);
}
.link-card--highlight p {
  color: var(--md-sys-color-on-primary-container);
  opacity: 0.8;
}
.link-card__icon {
  font-size: 28px;
}
.link-card strong {
  display: block;
  font-size: 16px;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 4px;
}
.link-card p {
  font-size: 13px;
  color: var(--md-sys-color-on-surface-variant);
}

.api-table {
  overflow-x: auto;
}
.api-table table {
  width: 100%;
  border-collapse: collapse;
}
.api-table th {
  text-align: left;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}
.api-table td {
  padding: 12px 16px;
  font-size: 14px;
  color: var(--md-sys-color-on-surface);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}
.api-table code {
  font-family: monospace;
  font-size: 13px;
  background: var(--md-sys-color-surface-variant);
  padding: 2px 6px;
  border-radius: 4px;
}

.flow-card {
  overflow-x: auto;
}
.flow-code {
  font-size: 13px;
  line-height: 1.7;
  overflow-x: auto;
}
.flow-code code {
  font-family: 'Fira Code', 'Cascadia Code', monospace;
  color: var(--md-sys-color-on-surface);
}

@media (max-width: 600px) {
  .cards {
    grid-template-columns: 1fr;
  }
  .links {
    grid-template-columns: 1fr;
  }
  .hero__title {
    font-size: 32px;
  }
}
</style>