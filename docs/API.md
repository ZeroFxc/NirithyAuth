# NirithyAuth API 文档

> 完整的 OAuth 2.1 认证系统 API 参考

## 目录

- [认证 API](#认证-api)
- [OAuth 2.1 API](#oauth-21-api)
- [客户端管理 API](#客户端管理-api)
- [用户个人中心 API](#用户个人中心-api)
- [管理 API](#管理-api)
- [发现端点](#发现端点)
- [错误码](#错误码)

---

## 认证 API

### POST /api/auth/register

注册新用户，注册成功后自动登录（设置 session cookie）。

**请求体**

```json
{
  "email": "user@example.com",
  "password": "minimum8chars",
  "name": "用户昵称"
}
```

**参数说明**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 合法邮箱格式 |
| password | string | 是 | 最少 8 个字符 |
| name | string | 是 | 1-50 个字符 |

**响应 200**

```json
{
  "success": true,
  "data": {
    "id": "uuid-xxx",
    "email": "user@example.com",
    "name": "用户昵称",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

**错误**

| 状态码 | 错误信息 | 说明 |
|--------|----------|------|
| 400 | Please fill in all required fields | 缺少必填字段 |
| 400 | Invalid email format | 邮箱格式错误 |
| 400 | Password must be at least 8 characters | 密码太短 |
| 409 | Email already registered | 邮箱已注册 |
| 429 | Too many registration attempts | 速率限制（5次/小时） |

**速率限制**：5 次/小时/IP

---

### POST /api/auth/login

用户登录，成功后设置 `session` cookie（HttpOnly, SameSite=Lax）。

**请求体**

```json
{
  "email": "user@example.com",
  "password": "minimum8chars"
}
```

**响应 200**

```json
{
  "success": true,
  "data": {
    "id": "uuid-xxx",
    "email": "user@example.com",
    "name": "用户昵称",
    "avatar": null
  }
}
```

**错误**

| 状态码 | 错误信息 | 说明 |
|--------|----------|------|
| 400 | Please enter email and password | 缺少字段 |
| 401 | Invalid email or password | 凭据错误 |
| 429 | Too many login attempts | 速率限制（10次/5分钟） |

**速率限制**：10 次/5分钟/IP

---

### POST /api/auth/logout

退出登录，清除 session。

**请求**：无需 body，需要 session cookie

**响应 200**

```json
{ "success": true }
```

---

### GET /api/auth/session

获取当前登录状态和用户信息。

**请求**：需要 session cookie

**响应 200**

```json
{
  "success": true,
  "data": {
    "id": "uuid-xxx",
    "email": "user@example.com",
    "name": "用户昵称",
    "avatar": null
  }
}
```

**错误**：401 未登录或会话过期

---

### PUT /api/auth/password

修改密码。修改成功后撤销该用户所有 session（强制所有设备重新登录）。

**请求体**

```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

**响应 200**

```json
{
  "success": true,
  "message": "Password changed successfully. 2 session(s) revoked. Please login again."
}
```

**密码存储**：PBKDF2-SHA256，100000 次迭代（Cloudflare Workers 平台限制）

---

## OAuth 2.1 API

### 授权流程

完整的 OAuth 2.1 Authorization Code Flow with PKCE (S256)：

```
用户        客户端应用         Auth System
 |              |                    |
 |              |--生成 PKCE--------->|
 |              |                    |
 |              |--重定向到 /authorize->|
 |<-------------|                    |
 |              |                    |
 |--登录并确认授权----------------->|
 |              |                    |
 |              |<--302 重定向(code)--|
 |              |                    |
 |              |--POST /token------>|
 |              |    (code+verifier) |
 |              |                    |
 |              |<--access_token-----|
 |              |    refresh_token   |
```

### GET /authorize

授权页面入口。验证参数后返回授权页面上下文数据。

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| client_id | string | 是 | OAuth 客户端 ID |
| redirect_uri | string | 是 | 注册的回调 URL |
| response_type | string | 是 | 必须为 `code` |
| code_challenge | string | 是 | PKCE code_challenge |
| code_challenge_method | string | 是 | 必须为 `S256` |
| scope | string | 否 | 默认 `profile`，可选 `profile email openid` |
| state | string | 否 | 客户端随机状态值 |

**响应 200**（返回 JSON，前端 SPA 渲染授权页面）

```json
{
  "client": {
    "name": "我的应用",
    "description": "应用描述",
    "homepageUrl": "https://example.com"
  },
  "scope": "profile email",
  "redirectUri": "https://example.com/callback",
  "codeChallenge": "xxxxx",
  "state": "random-state",
  "clientId": "cli_xxx",
  "isLoggedIn": true,
  "userId": "uuid-xxx"
}
```

**错误**：返回 400 + error 描述

---

### POST /api/oauth/authorize

用户确认或拒绝授权。需要 session cookie（用户须先登录）。

**请求体**

```json
{
  "clientId": "cli_xxx",
  "redirectUri": "https://example.com/callback",
  "codeChallenge": "xxxxx",
  "scope": "profile email",
  "state": "random-state",
  "action": "confirm"
}
```

**action 值**

| 值 | 说明 |
|------|------|
| confirm | 用户确认授权，生成授权码并 302 重定向 |
| cancel | 用户拒绝，302 重定向带 error=access_denied |

**确认授权响应**：302 重定向

```
Location: https://example.com/callback?code=AUTH_CODE&state=random-state
```

**拒绝授权响应**：302 重定向

```
Location: https://example.com/callback?error=access_denied&error_description=User+denied+the+authorization&state=random-state
```

**授权码特性**：
- 有效期 5 分钟（300 秒）
- 单次使用，消费后立即删除
- 重放检测：已消费的码再次使用会吊销关联的所有 token

---

### POST /api/oauth/token

换取或刷新 access_token。支持 `application/json` 和 `application/x-www-form-urlencoded`。

#### 授权码模式 (authorization_code)

**请求体**

```json
{
  "grant_type": "authorization_code",
  "code": "AUTH_CODE",
  "code_verifier": "CODE_VERIFIER",
  "client_id": "cli_xxx",
  "client_secret": "sec_xxx",
  "redirect_uri": "https://example.com/callback"
}
```

**客户端认证**：支持以下两种方式
- `client_secret_post`：在 body 中传 `client_id` + `client_secret`
- `client_secret_basic`：HTTP Basic Auth header

**响应 200**

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "RANDOM_TOKEN_STRING",
  "scope": "profile email"
}
```

#### 刷新模式 (refresh_token)

**请求体**

```json
{
  "grant_type": "refresh_token",
  "refresh_token": "OLD_REFRESH_TOKEN",
  "client_id": "cli_xxx",
  "client_secret": "sec_xxx"
}
```

**响应**：同授权码模式，返回新的 access_token 和 refresh_token

**刷新令牌特性**：
- 有效期 30 天（2592000 秒）
- 轮换机制：使用后立即删除旧 token，签发新 token
- 重放检测：已轮换的 token 再次使用会吊销整个 token family
- access_token 有效期 1 小时（3600 秒）

**Token 签名**：RS256（RSA-2048 + SHA-256），自动生成密钥对存储在 KV 中

---

### GET /api/oauth/userinfo

获取用户信息，需要 Bearer access_token。

**请求**

```
GET /api/oauth/userinfo
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

**响应 200**（根据 scope 返回不同字段）

```json
{
  "sub": "uuid-xxx",
  "name": "用户昵称",
  "avatar": null,
  "email": "user@example.com"
}
```

| scope | 返回字段 |
|-------|----------|
| profile | name, avatar |
| email | email |
| openid | sub |

**错误**：401 + `WWW-Authenticate: Bearer` header

---

### POST /api/oauth/revoke

吊销 token（RFC 7009）。总是返回 200，即使 token 无效。

**请求体**

```json
{
  "token": "ACCESS_TOKEN_OR_REFRESH_TOKEN",
  "token_type_hint": "access_token",
  "client_id": "cli_xxx",
  "client_secret": "sec_xxx"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| token | string | 是 | 要吊销的 token |
| token_type_hint | string | 否 | `access_token` 或 `refresh_token` |
| client_id | string | 是 | 客户端 ID |
| client_secret | string | 是 | 客户端密钥 |

**响应 200**：`{}`

**吊销行为**：
- access_token：撤销 JTI，标记为已吊销
- refresh_token：从 KV 中删除

---

### POST /api/oauth/introspect

Token 内省（RFC 7662）。查询 token 当前状态。

**请求体**

```json
{
  "token": "ACCESS_TOKEN_OR_REFRESH_TOKEN",
  "client_id": "cli_xxx",
  "client_secret": "sec_xxx"
}
```

**响应 200（active）**

```json
{
  "active": true,
  "scope": "profile email",
  "client_id": "cli_xxx",
  "username": "uuid-xxx",
  "token_type": "Bearer",
  "exp": 1735689600,
  "iat": 1735686000,
  "sub": "uuid-xxx",
  "jti": "token-jti-uuid"
}
```

**响应 200（inactive）**

```json
{
  "active": false
}
```

支持 access_token（JWT）和 refresh_token 的内省。

---

## 客户端管理 API

所有端点需要 session cookie 认证。

### GET /api/clients

获取当前用户的 OAuth 客户端列表。

**响应 200**

```json
{
  "success": true,
  "data": [
    {
      "clientId": "cli_xxx",
      "name": "我的应用",
      "description": "应用描述",
      "homepageUrl": "https://example.com",
      "redirectUris": ["https://example.com/callback"],
      "ownerId": "uuid-xxx",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

注意：列表中不返回 `clientSecret`。

---

### POST /api/clients

创建新客户端。**仅在创建时返回 `clientSecret` 明文**。

**请求体**

```json
{
  "name": "我的应用",
  "description": "应用描述",
  "redirectUris": ["https://example.com/callback"],
  "homepageUrl": "https://example.com"
}
```

**响应 201**

```json
{
  "success": true,
  "data": {
    "clientId": "cli_xxx",
    "clientSecret": "sec_xxx",
    ...
  }
}
```

---

### GET /api/clients/:clientId

获取客户端详情（不含 secret）。

---

### PUT /api/clients/:clientId

更新客户端信息。

**请求体**（所有字段可选）

```json
{
  "name": "新名称",
  "description": "新描述",
  "redirectUris": ["https://example.com/new-callback"],
  "homepageUrl": "https://example.com"
}
```

---

### DELETE /api/clients/:clientId

删除客户端。

---

### POST /api/clients/:clientId/regenerate-secret

重新生成 client_secret。**仅此一次返回明文**。

**响应 200**

```json
{
  "success": true,
  "data": {
    "clientSecret": "sec_NEW_SECRET"
  }
}
```

---

## 用户个人中心 API

所有端点需要 session cookie 认证。

### GET /api/user/profile

获取个人信息。

### PUT /api/user/profile

更新个人信息。

**请求体**

```json
{
  "name": "新昵称",
  "avatar": "https://example.com/avatar.png"
}
```

### GET /api/user/authorizations

获取已授权的应用列表。

**响应 200**

```json
{
  "success": true,
  "data": [
    {
      "clientId": "cli_xxx",
      "clientName": "我的应用",
      "clientDescription": "应用描述",
      "scope": "profile email",
      "authorizedAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

### DELETE /api/user/authorizations/:clientId

撤销对某客户端的授权。同时吊销该用户对该客户端的所有 access_token 和 refresh_token。

---

## 管理 API

通过 URL 参数驱动的管理接口，支持 GET 和 POST。所有操作需要 Admin Token 认证。

### 认证方式

Admin Token 可通过以下方式传递：
1. URL 参数：`?admin_token=YOUR_TOKEN`
2. Authorization header：`Authorization: Bearer YOUR_TOKEN`
3. 自定义 header：`X-Admin-Token: YOUR_TOKEN`
4. POST JSON body：`{ "admin_token": "YOUR_TOKEN" }`

### 用户管理

| 端点 | action | 说明 | 参数 |
|------|--------|------|------|
| GET/POST /api/admin/users | list | 列出所有用户 | - |
| GET/POST /api/admin/users | create | 创建用户 | email, password, name |
| GET/POST /api/admin/users | get | 获取用户 | id |
| GET/POST /api/admin/users | delete | 删除用户 | id |

**示例 - 通过 URL 创建用户**

```
GET /api/admin/users?action=create&email=test@example.com&password=password123&name=Test&admin_token=YOUR_TOKEN
```

**示例 - 通过 POST 创建用户**

```bash
curl -X POST https://auth.example.com/api/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"action":"create","email":"test@example.com","password":"password123","name":"Test"}'
```

**删除用户**：同时撤销该用户所有 session

### 客户端管理

| 端点 | action | 说明 | 参数 |
|------|--------|------|------|
| GET/POST /api/admin/clients | list | 列出客户端 | owner_id（可选） |
| GET/POST /api/admin/clients | create | 创建客户端 | name, redirect_uris, owner_id, homepage_url（可选） |
| GET/POST /api/admin/clients | get | 获取客户端 | client_id |
| GET/POST /api/admin/clients | delete | 删除客户端 | client_id |

**创建客户端示例**

```
GET /api/admin/clients?action=create&name=MyApp&redirect_uris=https://example.com/callback&owner_id=USER_ID&admin_token=YOUR_TOKEN
```

`redirect_uris` 支持逗号分隔多个 URL。

### 系统管理

| 端点 | action | 说明 |
|------|--------|------|
| GET/POST /api/admin/system | health | 系统健康检查 |
| GET/POST /api/admin/system | stats | 系统统计（用户数、客户端数） |
| GET/POST /api/admin/system | rotate_keys | 轮换 JWT 签名密钥 |

**健康检查响应**

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "bindings": { "r2": true, "kv": true },
    "jwt_algorithm": "RS256",
    "pbkdf2_iterations": 100000,
    "timestamp": "2025-01-01T00:00:00.000Z"
  }
}
```

**密钥轮换**：生成新的 RSA-2048 密钥对，旧密钥保留用于验证旧 token，直到下次轮换。

---

## 发现端点

### GET /.well-known/openid-configuration

OAuth 2.0 / OpenID Connect Discovery 端点。

```json
{
  "issuer": "https://auth.example.com",
  "authorization_endpoint": "https://auth.example.com/authorize",
  "token_endpoint": "https://auth.example.com/api/oauth/token",
  "userinfo_endpoint": "https://auth.example.com/api/oauth/userinfo",
  "revocation_endpoint": "https://auth.example.com/api/oauth/revoke",
  "introspection_endpoint": "https://auth.example.com/api/oauth/introspect",
  "jwks_uri": "https://auth.example.com/.well-known/jwks.json",
  "registration_endpoint": "https://auth.example.com/api/clients",
  "scopes_supported": ["openid", "profile", "email", "offline_access"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"]
}
```

### GET /.well-known/jwks.json

JWKS 公钥端点，用于客户端验证 RS256 JWT 签名。

```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "key-id-hash",
      "n": "base64url-modulus",
      "e": "AQAB",
      "alg": "RS256",
      "use": "sig"
    }
  ]
}
```

### GET /api/health

系统健康检查（无需认证）。

---

## 错误码

### OAuth 2.1 标准错误码

| 错误码 | 说明 |
|--------|------|
| invalid_request | 请求参数缺失或无效 |
| invalid_client | 客户端认证失败 |
| invalid_grant | 授权码/refresh_token 无效或过期 |
| invalid_token | Token 无效或已过期 |
| unsupported_grant_type | 不支持的 grant_type |
| access_denied | 用户拒绝授权 |
| server_error | 服务器内部错误 |
| unauthorized | 未登录 |

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 302 | 重定向（授权流程） |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 404 | 资源不存在 |
| 405 | 方法不允许 |
| 409 | 冲突（如邮箱已注册） |
| 429 | 速率限制 |
| 500 | 服务器错误 |
