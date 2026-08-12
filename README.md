# NirithyAuth

基于 Cloudflare Pages + Workers 的 OAuth 2.1 统一身份认证系统。

## 特性

- **OAuth 2.1 完整实现**：Authorization Code Flow + PKCE (S256)
- **RS256 非对称签名**：RSA-2048 密钥对，支持 JWKS 公钥分发
- **安全密码存储**：PBKDF2-SHA256，100000 次迭代（Cloudflare Workers 平台限制）
- **Token 生命周期管理**：授权码单次使用、refresh token 轮换、JTI 撤销追踪
- **重放攻击检测**：授权码和 refresh token 的重放检测 + 自动吊销
- **管理 API**：URL 驱动的管理接口，通过链接即可创建用户、配置客户端
- **OIDC Discovery**：支持 `/.well-known/openid-configuration` 自动发现
- **API 对接测试页面**：主页即可体验完整 OAuth 2.1 流程
- **Material Design 3**：前端 UI 设计

## 快速开始

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 运行测试
npx vitest run

# 类型检查
npx vue-tsc --noEmit

# 构建
npm run build
```

## 部署

```bash
# 部署到 Cloudflare Pages
npm run build
npx wrangler pages deploy dist
```

详细部署说明见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 文档

- [API 文档](docs/API.md) - 完整的 API 端点参考
- [架构文档](docs/ARCHITECTURE.md) - 系统设计和存储架构
- [部署文档](docs/DEPLOYMENT.md) - 部署和配置指南

## API 端点速览

| 端点 | 方法 | 说明 |
|------|------|------|
| `/authorize` | GET | OAuth 授权页面 |
| `/api/auth/register` | POST | 用户注册 |
| `/api/auth/login` | POST | 用户登录 |
| `/api/auth/logout` | POST | 退出登录 |
| `/api/auth/session` | GET | 获取会话 |
| `/api/auth/password` | PUT | 修改密码 |
| `/api/oauth/authorize` | POST | 确认/拒绝授权 |
| `/api/oauth/token` | POST | 换取/刷新 token |
| `/api/oauth/userinfo` | GET | 获取用户信息 |
| `/api/oauth/revoke` | POST | 吊销 token |
| `/api/oauth/introspect` | POST | token 内省 |
| `/api/clients` | GET/POST | 客户端管理 |
| `/api/clients/:id` | GET/PUT/DELETE | 客户端 CRUD |
| `/api/clients/:id/regenerate-secret` | POST | 重新生成密钥 |
| `/api/user/profile` | GET/PUT | 个人信息 |
| `/api/user/authorizations` | GET | 已授权应用 |
| `/api/user/authorizations/:clientId` | DELETE | 撤销授权 |
| `/api/admin/users` | GET/POST | 用户管理（Admin） |
| `/api/admin/clients` | GET/POST | 客户端管理（Admin） |
| `/api/admin/system` | GET/POST | 系统管理（Admin） |
| `/.well-known/openid-configuration` | GET | OIDC 发现 |
| `/.well-known/jwks.json` | GET | JWKS 公钥 |
| `/api/health` | GET | 健康检查 |
| `/api-demo` | GET | API 对接测试页面 |

## 技术栈

- **前端**：Vue 3 + vue-router + Material Design 3
- **后端**：Cloudflare Pages Functions (TypeScript)
- **存储**：Cloudflare R2（持久化）+ KV（临时存储）
- **密码**：PBKDF2-SHA256 (100000 iterations - Cloudflare Workers limit)
- **签名**：RS256 (RSA-2048) + HS256 向后兼容
- **测试**：Vitest (68 tests)

## License

Private
