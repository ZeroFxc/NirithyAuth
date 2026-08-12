# NirithyAuth 架构文档

## 系统概览

NirithyAuth 是一个基于 Cloudflare Pages + Workers 的 OAuth 2.1 认证系统，提供完整的第三方登录能力。

```
┌─────────────────────────────────────────────────┐
│                  Cloudflare Pages                 │
│                                                   │
│  ┌─────────────┐    ┌──────────────────────────┐ │
│  │   Frontend   │    │      Backend (Functions) │ │
│  │   Vue 3 SPA  │    │                          │ │
│  │              │    │  ┌──────────────────┐   │ │
│  │  - Home       │    │  │  _middleware.ts   │   │ │
│  │  - Login      │    │  │  (路由分发)       │   │ │
│  │  - Register   │    │  └────────┬─────────┘   │ │
│  │  - Authorize  │    │           │              │ │
│  │  - Dashboard  │    │  ┌────────▼─────────┐   │ │
│  │  - Developer  │    │  │   API Handlers    │   │ │
│  │  - Docs       │    │  │  auth / oauth /   │   │ │
│  │  - API Demo   │    │  │  clients / user / │   │ │
│  └─────────────┘    │  │  admin            │   │ │
│                      │  └────────┬─────────┘   │ │
│                      │           │              │ │
│                      │  ┌────────▼─────────┐   │ │
│                      │  │   Lib Modules     │   │ │
│                      │  │  shared / auth /  │   │ │
│                      │  │  crypto / stores  │   │ │
│                      │  └────────┬─────────┘   │ │
│                      └───────────┼──────────────┘ │
│                                  │                │
│              ┌───────────────────┼──────────────┐ │
│              │                   │              │ │
│      ┌───────▼───────┐  ┌────────▼────────┐    │ │
│      │   R2 Bucket    │  │   KV Namespace   │    │
│      │  AUTH_BUCKET   │  │    AUTH_KV       │    │
│      │                │  │                   │    │
│      │  users/        │  │  session:         │    │
│      │  clients/      │  │  auth_code:       │    │
│      │  authorizations│  │  refresh_token:   │    │
│      │  indexes/      │  │  access_token_jti:│    │
│      └───────────────┘  │  jwt_key_store    │    │
│                          │  rate_limit:       │    │
│                          └───────────────────┘    │
└─────────────────────────────────────────────────┘
```

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | Vue 3 + vue-router | SPA，Material Design 3 风格 |
| 后端 | Cloudflare Pages Functions | TypeScript，边缘运行 |
| 持久存储 | Cloudflare R2 | 用户、客户端、授权记录 |
| 临时存储 | Cloudflare KV | Session、Token、密钥 |
| 密码哈希 | PBKDF2-SHA256 | 600000 次迭代 |
| Token 签名 | RS256 (RSA-2048) | 非对称签名，支持 JWKS |
| 兼容签名 | HS256 | 旧 token 向后兼容 |

## 目录结构

```
auth/
├── src/                          # 前端源码
│   ├── main.ts                   # 入口 + 路由定义
│   ├── App.vue                   # 根组件
│   ├── lib/
│   │   └── auth.ts               # 前端 session 工具
│   ├── pages/
│   │   ├── HomePage.vue          # 首页
│   │   ├── LoginPage.vue         # 登录
│   │   ├── RegisterPage.vue      # 注册
│   │   ├── AuthorizePage.vue     # 授权页面
│   │   ├── DashboardPage.vue     # 个人中心
│   │   ├── DeveloperPage.vue     # 开发者中心
│   │   ├── DocsPage.vue          # 文档页
│   │   └── ApiDemoPage.vue       # API 对接测试页面
│   ├── components/               # Material Design 组件
│   │   ├── MdButton.vue
│   │   ├── MdTextField.vue
│   │   ├── MdCard.vue
│   │   ├── MdDialog.vue
│   │   ├── MdAppBar.vue
│   │   ├── MdContainer.vue
│   │   └── MdAvatar.vue
│   └── styles/
│       └── theme.css              # Material Design 3 主题
│
├── functions/                    # 后端 Cloudflare Functions
│   ├── authorize.ts              # /authorize 页面处理
│   └── api/
│       ├── _middleware.ts        # API 路由中间件 + 发现端点
│       ├── auth.ts               # 认证 API (register/login/logout/session/password)
│       ├── oauth.ts              # OAuth 2.1 API (authorize/token/userinfo/revoke/introspect)
│       ├── clients.ts            # 客户端管理 API
│       ├── user.ts               # 用户个人中心 API
│       └── admin.ts              # 管理 API (URL 驱动)
│
│   └── lib/
│       ├── shared.ts             # 公共模块 (Env/CORS/Store工厂/速率限制)
│       ├── auth.ts               # PBKDF2 密码哈希 + HS256 JWT
│       ├── crypto.ts             # RS256 签名 + RSA 密钥管理 + JWKS
│       ├── kv-store.ts           # KV 存储 (session/authCode/accessToken/refreshToken)
│       ├── storage.ts            # R2 存储封装
│       ├── user-store.ts         # 用户数据模型
│       ├── client-store.ts       # 客户端数据模型
│       ├── authorization-store.ts # 授权记录存储
│       └── types.ts              # 类型重导出
│
├── tests/                        # 测试文件
│   ├── shared.test.ts            # 共享模块测试
│   ├── auth.test.ts              # 认证模块测试
│   ├── crypto.test.ts            # 加密模块测试
│   └── kv-store.test.ts          # KV 存储测试
│
├── docs/                         # 文档
│   ├── API.md                    # API 文档
│   ├── ARCHITECTURE.md           # 架构文档（本文件）
│   └── DEPLOYMENT.md             # 部署文档
│
├── wrangler.toml                 # Cloudflare 配置
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 存储架构

### R2 Bucket (AUTH_BUCKET)

持久化存储，保存 JSON 格式数据：

```
users/{user_id}.json                    # 用户完整数据
indexes/email/{sha256(email)}.json      # 邮箱 -> user_id 索引
clients/{client_id}.json                # 客户端应用数据
indexes/client_owner/{ownerId}.json     # 用户 -> clientId 列表索引
authorizations/{userId}/{clientId}.json # 授权记录
indexes/auth/{userId}.json              # 用户授权列表索引
```

### KV Namespace (AUTH_KV)

临时存储，带 TTL 自动过期：

```
session:{token}                         # Session (TTL: 24h)
auth_code:{code}                         # 授权码 (TTL: 5min)
auth_code:{code}:consumed                # 已消费标记 (TTL: 5min)
access_token_jti:{jti}                   # JTI 追踪 (TTL: 1h)
access_token_revoked:{jti}               # 撤销标记 (TTL: 1h)
refresh_token:{token}                    # Refresh Token (TTL: 30d)
refresh_token:{token}:consumed           # 已轮换标记 (TTL: 30d)
refresh_token_family:{familyId}:{token}  # Token Family (TTL: 30d)
jwt_key_store                            # RSA 密钥对 (无 TTL)
rate_limit:{key}                         # 速率限制计数器
```

## 安全设计

### 密码安全

- **PBKDF2-SHA256**，600000 次迭代（NIST SP 800-132 推荐最低值）
- 每个密码使用独立的 16 字节随机 salt
- 验证使用常量时间比较（`constantTimeEquals`）防止时序攻击
- 存储格式：`pbkdf2:{iterations}:{saltHex}:{hashHex}`

### Token 安全

#### Access Token (JWT)
- 算法：RS256（RSA-2048 + SHA-256）
- 有效期：1 小时
- 包含 JTI（JWT ID）用于撤销追踪
- 无状态验证，但可通过 JTI 撤销

#### Refresh Token
- 随机字符串，存储在 KV 中
- 有效期：30 天
- **轮换机制**：使用后立即删除，签发新 token
- **Family 追踪**：同一授权链路的 token 属于同一 family
- **重放检测**：已轮换的 token 再次使用会吊销整个 family

#### 授权码
- 有效期：5 分钟
- **单次使用**：消费后立即从 KV 删除
- **重放检测**：已消费的码有 `:consumed` 标记，再次使用会吊销关联的所有 token

### PKCE 强制

OAuth 2.1 要求强制 PKCE with S256：
1. 客户端生成 `code_verifier`（随机字符串）
2. 计算 `code_challenge = base64url(SHA256(code_verifier))`
3. 授权时发送 `code_challenge`
4. 换 token 时发送 `code_verifier`
5. 服务端验证 `base64url(SHA256(code_verifier)) === code_challenge`

### CORS 安全

- 使用请求 Origin 而非通配符 `*`，兼容 `credentials: true`
- 支持 CORS 预检请求
- `Vary: Origin` 头确保缓存正确

### Cookie 安全

- `HttpOnly`：防止 XSS 读取
- `SameSite=Lax`：防止 CSRF
- `Secure`：HTTPS 环境自动添加

### 速率限制

| 操作 | 限制 | 窗口 |
|------|------|------|
| 注册 | 5 次 | 1 小时 |
| 登录 | 10 次 | 5 分钟 |
| 修改密码 | 10 次 | 5 分钟 |
| Admin API | 60 次 | 1 分钟 |

## 模块化设计

### Store 工厂模式

所有存储操作通过工厂函数创建，消除重复初始化代码：

```typescript
const stores = createStores(env)
// stores.userStore    - 用户 CRUD
// stores.clientStore  - 客户端 CRUD
// stores.kvStore      - Token 生命周期
// stores.authStore    - 授权记录
// stores.crypto       - RSA 签名
```

### 接口隔离

每个 Store 只暴露必要的方法，内部实现细节不外泄：

- `userStore`: createUser / findByEmail / findById / updateUser
- `clientStore`: createClient / findByClientId / listByOwner / updateClient / deleteClient / regenerateSecret
- `authStore`: upsert / listByUser / revoke / exists
- `kvStore`: session / authCode / accessToken / refreshToken

## 可扩展性

### 添加新的 OAuth Scope

1. 在 `shared.ts` 的 `SCOPE_DEFINITIONS` 中添加定义
2. 在 `oauth.ts` 的 `handleUserInfo` 中添加返回逻辑
3. 前端授权页面自动展示新 scope

### 添加新的 API 端点

1. 在 `functions/api/` 下创建处理文件
2. 在 `_middleware.ts` 中注册路由
3. 通过 `createStores(env)` 获取存储实例

### 添加新的管理操作

在 `admin.ts` 中添加新的 action case，支持 URL 驱动和 POST JSON 两种调用方式。

### 密钥轮换

通过 Admin API 触发：
```
POST /api/admin/system?action=rotate_keys
```

生成新的 RSA-2048 密钥对，旧密钥降级为 `previous`，继续用于验证旧 token，直到下次轮换。
