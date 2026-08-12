# Tasks

- [x] Task 1: 项目初始化与 Cloudflare 配置
  - 使用 wrangler 创建 Pages 项目，配置 R2 存储桶和 KV 命名空间
  - 配置 `wrangler.jsonc`：绑定 R2（AUTH_BUCKET）和 KV（AUTH_KV），设置兼容性日期
  - 初始化前端项目结构（Vite + Vue 3 + TypeScript）

- [x] Task 2: MD3 基础 UI 框架搭建
  - 引入 Material Design 3 样式变量（CSS Custom Properties），定义亮色/暗色主题
  - 实现基础布局组件：Header、Footer、Container（响应式）
  - 实现基础 UI 组件：Button、TextField、Card、Dialog（按 MD3 规范）
  - 实现主题切换逻辑（prefers-color-scheme 自动检测 + 手动切换）

- [x] Task 3: R2 数据访问层
  - 实现 `storage.ts`：封装 R2 读写操作（getJSON、putJSON、delete、list）
  - 实现用户数据模型：创建用户、按邮箱查找用户、按 ID 查找用户、更新用户
  - 实现邮箱索引：`indexes/email/{sha256(email)}.json` → user_id
  - 实现客户端应用数据模型：创建应用、按 client_id 查找、按 owner 列出、更新、删除

- [x] Task 4: 用户注册与登录 API
  - 实现 `POST /api/auth/register`：邮箱+密码注册，bcrypt 哈希，生成 user_id（UUID v4）
  - 实现 `POST /api/auth/login`：验证凭证，生成 session token（随机字符串），存入 KV（TTL 24h），设置 Cookie
  - 实现 `POST /api/auth/logout`：清除 Cookie，删除 KV 中的 session
  - 实现 `GET /api/auth/session`：验证当前 session 是否有效，返回用户基本信息

- [x] Task 5: 用户注册与登录页面（MD3）
  - 实现登录页面：邮箱/密码输入框、登录按钮、注册链接、错误提示
  - 实现注册页面：邮箱/密码/昵称输入框、注册按钮、登录链接、表单验证
  - 实现登录/注册成功后的跳转逻辑（redirect_uri 参数回传）

- [x] Task 6: OAuth 2.1 授权端点（PKCE）
  - 实现 `GET /authorize`：验证参数（client_id、redirect_uri、response_type=code、code_challenge、code_challenge_method=S256、scope、state）
  - 强制 PKCE：拒绝缺少 code_challenge 的请求，仅支持 S256 方法
  - 精确 redirect_uri 匹配：与注册时完全一致，不允许通配符
  - 实现授权确认页面（MD3）：展示应用名称、请求的权限列表、用户头像昵称、确认/取消按钮
  - 实现授权确认处理：存储 code_challenge，生成授权码（随机字符串），存入 KV（TTL 5min），302 重定向
  - 实现授权拒绝处理：302 重定向回 redirect_uri 附带 error=access_denied

- [x] Task 7: OAuth 2.1 Token 端点（PKCE 验证 + refresh_token 轮换）
  - 实现 `POST /api/oauth/token`：支持 grant_type=authorization_code 和 grant_type=refresh_token
  - 授权码单次使用：验证后立即从 KV 删除，重复使用则吊销所有关联 token
  - PKCE 验证：S256(code_verifier) === code_challenge，失败返回 400
  - 生成 access_token（JWT 格式，含 sub、scope、exp，TTL 1h）、refresh_token（随机字符串，TTL 30 天）
  - refresh_token 轮换：每次刷新发新 token，旧 token 立即失效；检测到重放则吊销该用户对该客户端的所有 token
  - 返回标准 JSON：access_token、token_type、expires_in、refresh_token、scope

- [x] Task 8: OAuth 2.1 UserInfo 与 Revoke 端点
  - 实现 `GET /api/oauth/userinfo`：验证 Bearer token，从 R2 读取用户信息，返回标准 JSON
  - 实现 `POST /api/oauth/revoke`：验证 client 身份，从 KV 删除 token 及关联的 refresh_token

- [x] Task 9: 客户端应用管理（开发者中心）
  - 实现 `POST /api/clients`：创建 OAuth2 应用（生成 client_id、client_secret）
  - 实现 `GET /api/clients`：列出当前用户的所有应用
  - 实现 `PUT /api/clients/:id`：更新应用信息
  - 实现 `DELETE /api/clients/:id`：删除应用
  - 实现开发者中心页面（MD3）：应用列表、创建应用表单、查看/编辑应用详情

- [x] Task 10: 用户个人中心
  - 实现个人中心页面（MD3）：显示用户信息、修改昵称/头像
  - 实现已授权应用列表：显示第三方应用名称、授权时间、撤销按钮
  - 实现 `DELETE /api/user/authorizations/:client_id`：撤销对某应用的授权

- [x] Task 11: 集成验证与部署
  - 本地 Miniflare 测试完整 OAuth 2.1 流程（含 PKCE）
  - 验证 PKCE 强制、refresh_token 轮换、授权码单次使用等安全特性
  - 部署到 Cloudflare Pages

# Task Dependencies
- Task 2 依赖 Task 1（项目结构就绪）
- Task 3 依赖 Task 1（R2 绑定配置）
- Task 4 依赖 Task 3（数据访问层）
- Task 5 依赖 Task 2、Task 4（UI 框架 + API）
- Task 6 依赖 Task 3、Task 5（数据层 + 登录页面）
- Task 7 依赖 Task 3、Task 6（数据层 + 授权码 + PKCE 存储）
- Task 8 依赖 Task 3、Task 7（数据层 + token 格式）
- Task 9 依赖 Task 3、Task 5（数据层 + 登录态）
- Task 10 依赖 Task 3、Task 8（数据层 + 授权记录）
- Task 11 依赖 Task 1-10（所有功能完成）