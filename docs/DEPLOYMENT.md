# NirithyAuth 部署文档

## 前置条件

- Node.js 18+
- Cloudflare 账号
- Wrangler CLI（已包含在 devDependencies 中）

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 本地运行

```bash
# 前端开发服务器（不含 Functions）
npm run dev

# 使用 Wrangler 本地运行（含 Functions + R2 + KV 模拟）
npx wrangler pages dev dist --local
```

### 3. 运行测试

```bash
# 单元测试
npx vitest run

# 类型检查
npx vue-tsc --noEmit

# 构建
npm run build
```

## Cloudflare 资源准备

### 1. 创建 KV Namespace

```bash
npx wrangler kv namespace create AUTH_KV
```

记录返回的 `id`，填入 `wrangler.toml`。

### 2. 创建 R2 Bucket

```bash
npx wrangler r2 bucket create auth-system-data
```

### 3. 配置 wrangler.toml

```toml
name = "auth-system"
pages_build_output_dir = "dist"
compatibility_date = "2025-08-11"

[[kv_namespaces]]
id = "YOUR_KV_NAMESPACE_ID"
binding = "AUTH_KV"

[[r2_buckets]]
bucket_name = "auth-system-data"
binding = "AUTH_BUCKET"
```

### 4. 设置环境变量

在 Cloudflare Dashboard 中设置以下环境变量（Pages > Settings > Environment variables）：

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `JWT_SECRET` | 否 | HS256 向后兼容密钥（新系统使用 RS256，仅在需要兼容旧 token 时设置） |
| `ADMIN_TOKEN` | 否 | 管理 API 认证令牌。设置后可通过 URL 驱动的管理接口操作 |

或通过 CLI 设置：

```bash
# 通过 wrangler 设置 secret（推荐，不会出现在代码中）
npx wrangler pages secret put JWT_SECRET
npx wrangler pages secret put ADMIN_TOKEN
```

## 部署

### 自动部署

```bash
npm run build
npx wrangler pages deploy dist
```

### 验证部署

部署后验证以下端点：

```bash
# 健康检查
curl https://your-domain.com/api/health

# OAuth 发现
curl https://your-domain.com/.well-known/openid-configuration

# JWKS
curl https://your-domain.com/.well-known/jwks.json
```

## 管理 API 配置

### 设置 Admin Token

1. 生成一个安全的随机字符串作为 `ADMIN_TOKEN`
2. 在 Cloudflare Dashboard 中设置环境变量 `ADMIN_TOKEN`
3. 重新部署

### 使用 Admin API

```bash
# 列出所有用户
curl "https://your-domain.com/api/admin/users?action=list&admin_token=YOUR_TOKEN"

# 创建用户
curl "https://your-domain.com/api/admin/users?action=create&email=test@example.com&password=password123&name=Test&admin_token=YOUR_TOKEN"

# 创建客户端（需要先有用户 ID）
curl "https://your-domain.com/api/admin/clients?action=create&name=MyApp&redirect_uris=https://example.com/callback&owner_id=USER_ID&admin_token=YOUR_TOKEN"

# 系统统计
curl "https://your-domain.com/api/admin/system?action=stats&admin_token=YOUR_TOKEN"

# 轮换密钥
curl "https://your-domain.com/api/admin/system?action=rotate_keys&admin_token=YOUR_TOKEN"
```

也支持 POST + JSON：

```bash
curl -X POST "https://your-domain.com/api/admin/users" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"action":"create","email":"test@example.com","password":"password123","name":"Test"}'
```

## 集成示例

### 前端集成（JavaScript）

```javascript
const AUTH_HOST = 'https://your-auth-domain.com'

// 1. 生成 PKCE
const codeVerifier = generateRandomString(64)
const codeChallenge = base64url(await sha256(codeVerifier))

// 2. 重定向到授权页面
window.location.href = `${AUTH_HOST}/authorize`
  + `?client_id=YOUR_CLIENT_ID`
  + `&redirect_uri=${encodeURIComponent('https://yourapp.com/callback')}`
  + `&response_type=code`
  + `&code_challenge=${codeChallenge}`
  + `&code_challenge_method=S256`
  + `&scope=profile email`
  + `&state=${randomState}`

// 3. 回调页面处理 code
const code = new URLSearchParams(location.search).get('code')

// 4. 换取 token
const res = await fetch(`${AUTH_HOST}/api/oauth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET',
    redirect_uri: 'https://yourapp.com/callback'
  })
})
const { access_token, refresh_token } = await res.json()

// 5. 获取用户信息
const userRes = await fetch(`${AUTH_HOST}/api/oauth/userinfo`, {
  headers: { Authorization: `Bearer ${access_token}` }
})
const user = await userRes.json()
```

### 后端集成（Node.js）

```javascript
// 使用 client_secret_basic 认证
const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

const res = await fetch(`${AUTH_HOST}/api/oauth/token`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${credentials}`
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri
  })
})
```

### 使用 OIDC Discovery 自动配置

```javascript
// 获取配置
const config = await fetch(`${AUTH_HOST}/.well-known/openid-configuration`).then(r => r.json())

// config.authorization_endpoint
// config.token_endpoint
// config.userinfo_endpoint
// config.jwks_uri
// ...
```

## API 对接测试页面

部署后访问 `/api-demo` 页面，提供完整的 OAuth 2.1 流程交互式演示：

1. 环境配置 - 设置 Auth System 地址和 Admin Token
2. 用户注册 - 通过注册 API 或 Admin API 创建用户
3. 用户登录 - 获取 session cookie
4. 创建客户端 - 注册 OAuth2 应用
5. 生成 PKCE - 生成 code_verifier 和 code_challenge
6. 用户授权 - 模拟授权确认
7. 换取 Token - 用授权码换取 access_token
8. 调用 UserInfo - 用 token 获取用户信息
9. Token 内省 - 查询 token 状态
10. 刷新 Token - 测试轮换机制
11. 吊销 Token - 测试吊销

每个步骤都有实时结果展示和流程日志。

## 安全注意事项

1. **生产环境必须设置 `ADMIN_TOKEN`**，否则管理 API 不可用
2. **`JWT_SECRET` 仅用于向后兼容**，新系统使用 RS256 自动生成密钥
3. RS256 密钥对首次使用时自动生成，存储在 KV 中
4. 定期轮换密钥：`POST /api/admin/system?action=rotate_keys`
5. `client_secret` 仅在创建和重新生成时明文返回，请妥善保存
6. 修改密码会撤销用户所有 session，强制重新登录
