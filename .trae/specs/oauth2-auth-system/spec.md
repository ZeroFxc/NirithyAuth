# OAuth2.1 第三方登录系统 Spec

## Why
构建一个类似 QQ/微信/GitHub/Gitee 的第三方登录平台，基于 OAuth 2.1 最新安全标准，让任意网站可以接入本系统作为身份认证提供方。用户在一个统一、美观的授权页面上登录并确认授权后，第三方网站即可获取用户基本信息。

## What Changes
- 新建 Cloudflare Pages + Workers 项目，实现 OAuth 2.1 授权码 + PKCE 流程
- R2 存储用户数据（JSON 文件格式）和客户端应用注册信息
- Workers KV 存储授权码、access_token、refresh_token（带 TTL 过期）
- Material Design 3 风格的登录、注册、授权确认页面
- 提供 OAuth 2.1 标准端点：/authorize、/token、/userinfo、/revoke
- 提供客户端应用注册管理页面
- 提供用户个人中心页面

## Impact
- Affected specs: 无（全新项目）
- Affected code: 全新项目，目录结构如下
  - `functions/` — Workers Functions（API 端点）
  - `src/` — 前端 Pages（MD3 UI）
  - `public/` — 静态资源
  - `wrangler.jsonc` — 项目配置（R2、KV 绑定）

## Architecture

```
第三方网站                        本系统(Pages + Workers)              Storage
    |                                  |                                |
    |-- 生成 code_verifier + code_challenge (S256)
    |                                  |                                |
    |-- GET /authorize -------------->|                                |
    |   ?client_id=&redirect_uri      |-- 查询客户端注册信息 --------->| R2
    |   &response_type=code           |-- 验证 redirect_uri 精确匹配   |
    |   &code_challenge=xxx           |                                |
    |   &code_challenge_method=S256   |                                |
    |   &state=xxx                    |                                |
    |                                  |                                |
    |   [用户看到 MD3 登录页]          |                                |
    |                                  |-- 验证用户凭证 --------------->| R2
    |                                  |                                |
    |   [用户看到 MD3 授权确认页]      |                                |
    |                                  |                                |
    |   [用户点击确认授权]             |                                |
    |                                  |-- 存 code_challenge --------->| KV
    |                                  |-- 生成授权码(一次性) --------->| KV (TTL 5min)
    |<-- 302 redirect ----------------|                                |
    |   ?code=xxx&state=xxx            |                                |
    |                                  |                                |
    |-- POST /token ----------------->|                                |
    |   grant_type=authorization_code  |-- 验证授权码(单次使用) ------>| KV
    |   code=xxx                       |-- 验证 code_verifier vs       |
    |   code_verifier=xxx              |   code_challenge (S256)       |
    |   client_id=xxx                  |-- 生成 access_token --------->| KV (TTL 1h)
    |                                  |-- 生成 refresh_token -------->| KV (TTL 30天)
    |<-- {access_token, refresh_token, |                                |
    |     expires_in, token_type}      |                                |
    |                                  |                                |
    |-- GET /userinfo --------------->|                                |
    |   Authorization: Bearer xxx      |-- 验证 token ----------------->| KV
    |                                  |-- 查询用户信息 --------------->| R2
    |<-- {sub, name, email, avatar}    |                                |
```

## ADDED Requirements

### Requirement: OAuth 2.1 授权码 + PKCE 流程
系统 SHALL 仅实现 Authorization Code Grant with PKCE（RFC 7636），这是 OAuth 2.1 唯一允许的授权方式。不支持 implicit grant 和 password grant。

#### Scenario: 完整授权流程
- **WHEN** 用户从第三方网站跳转到 `/authorize`，携带合法的 client_id、redirect_uri、response_type=code、code_challenge、code_challenge_method=S256、state、scope
- **THEN** 系统验证 redirect_uri 与注册时完全一致（精确匹配，不允许通配符）
- **AND** 系统展示 MD3 风格的登录页面
- **AND** 用户登录成功后展示授权确认页面，显示第三方应用名称和请求的权限
- **AND** 用户确认后，系统存储 code_challenge，生成授权码（存入 KV，TTL 5 分钟），302 重定向回 redirect_uri 附带 code 和 state

#### Scenario: 已登录用户授权
- **WHEN** 用户已有有效 session，直接跳转到 `/authorize`
- **THEN** 跳过登录页面，直接展示授权确认页面

#### Scenario: 缺少 PKCE 参数
- **WHEN** 请求缺少 code_challenge 或 code_challenge_method
- **THEN** 返回 400 错误，提示"PKCE 参数缺失"

#### Scenario: 无效 client_id
- **WHEN** 请求携带未注册的 client_id
- **THEN** 返回 400 错误页面，提示"无效的应用 ID"

#### Scenario: redirect_uri 不匹配
- **WHEN** 请求的 redirect_uri 与注册的不完全一致
- **THEN** 返回 400 错误，拒绝授权

### Requirement: Token 端点
系统 SHALL 提供 `/token` 端点，支持 authorization_code 和 refresh_token 两种 grant_type。

#### Scenario: 授权码 + PKCE 换 token
- **WHEN** 第三方服务端 POST `/token` 携带 grant_type=authorization_code、code、code_verifier、client_id、client_secret、redirect_uri
- **THEN** 验证授权码（一次性使用，验证后立即从 KV 删除）
- **AND** 使用 S256 算法验证 code_verifier 是否匹配 code_challenge
- **AND** 验证通过后，返回 access_token（JWT 格式，TTL 1 小时）、refresh_token（随机字符串，TTL 30 天）、expires_in=3600、token_type=bearer

#### Scenario: 授权码重复使用
- **WHEN** 同一授权码被第二次请求 /token
- **THEN** 返回 400 错误，并吊销该授权码关联的所有已颁发 token

#### Scenario: PKCE 验证失败
- **WHEN** code_verifier 与 code_challenge 不匹配
- **THEN** 返回 400 错误，提示"PKCE 验证失败"

#### Scenario: 刷新 token（轮换机制）
- **WHEN** 第三方 POST `/token` 携带 grant_type=refresh_token、refresh_token、client_id、client_secret
- **THEN** 返回新的 access_token 和新的 refresh_token
- **AND** 旧的 refresh_token 立即失效（从 KV 删除）
- **AND** 如果旧的 refresh_token 已被使用过（重放攻击），撤销该用户对该客户端的所有 token

### Requirement: 用户信息端点
系统 SHALL 提供 `/userinfo` 端点，返回当前授权用户的基本信息。

#### Scenario: 获取用户信息
- **WHEN** 第三方携带有效的 access_token（Bearer）请求 `GET /userinfo`
- **THEN** 返回 JSON：sub（用户 ID）、name（昵称）、email（邮箱）、avatar（头像 URL）

#### Scenario: 无效 token
- **WHEN** 请求携带过期或无效的 access_token
- **THEN** 返回 401，WWW-Authenticate 头

### Requirement: 用户注册与登录
系统 SHALL 提供用户注册和登录功能，使用 MD3 风格界面。

#### Scenario: 用户注册
- **WHEN** 用户访问注册页面，填写邮箱、密码、昵称
- **THEN** 密码使用 bcrypt 哈希后存入 R2（JSON 文件，key 为 `users/{user_id}.json`）
- **AND** 同时维护邮箱索引 `indexes/email/{email_hash}.json` 指向 user_id

#### Scenario: 用户登录
- **WHEN** 用户输入邮箱和密码
- **THEN** 系统通过邮箱索引查找 user_id，读取用户数据，验证密码
- **AND** 成功后生成 session token（存入 KV，TTL 24 小时），设置 HTTP-only Cookie

#### Scenario: 密码错误
- **WHEN** 用户输入错误密码
- **THEN** 返回错误提示"邮箱或密码错误"，不区分具体是哪个字段错误

### Requirement: 客户端应用管理
系统 SHALL 允许开发者注册和管理 OAuth2 客户端应用。

#### Scenario: 注册应用
- **WHEN** 已登录用户在开发者中心创建新应用，填写应用名称、主页 URL、回调 URL
- **THEN** 系统生成 client_id 和 client_secret，存入 R2（`clients/{client_id}.json`）
- **AND** 展示 client_id 和 client_secret（secret 仅展示一次）

#### Scenario: 管理应用
- **WHEN** 用户在开发者中心查看自己的应用列表
- **THEN** 展示应用名称、client_id、回调 URL，支持编辑和删除

### Requirement: MD3 风格 UI
系统所有页面的前端 SHALL 采用 Material Design 3 设计规范。

#### Scenario: 设计一致性
- **WHEN** 用户访问任意页面
- **THEN** 使用 MD3 的配色方案（动态颜色）、排版、圆角、阴影、按钮样式
- **AND** 支持亮色/暗色主题自动切换
- **AND** 移动端响应式布局

### Requirement: Token 吊销
系统 SHALL 提供 `/revoke` 端点，允许用户或应用撤销已颁发的 token。

#### Scenario: 撤销 token
- **WHEN** 第三方 POST `/revoke` 携带 token 和 client_id、client_secret
- **THEN** 从 KV 中删除对应 token，使其立即失效

### Requirement: 用户个人中心
系统 SHALL 提供用户个人中心页面，让用户管理自己的账户和授权。

#### Scenario: 查看已授权应用
- **WHEN** 用户访问个人中心
- **THEN** 展示所有已授权的第三方应用列表，支持撤销授权

#### Scenario: 修改个人信息
- **WHEN** 用户修改昵称、头像
- **THEN** 更新 R2 中的用户数据