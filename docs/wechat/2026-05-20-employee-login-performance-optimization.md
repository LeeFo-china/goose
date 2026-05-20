# 微信小程序员工登录性能优化方案

日期：2026-05-20

## 背景

本机调试小程序员工登录时，`POST /auth` 等待时间过长，用户体感差。当前 API 已能正常返回，但登录链路把“微信 code 换 openid、身份映射修复、角色判断、员工上下文构建、权限加载”集中在一次请求里串行执行。

本地日志里观察到 `/auth` 请求耗时约 `4.8s - 6.2s`。其中可见阶段包括：

- 调微信 `jscode2session`：约 `0.3s - 1.9s`
- 通过 openid 查询用户身份：约 `1.6s`
- 身份同步、角色解析、员工 auth context 构建：约 `2s - 3s+`

## 当前员工登录链路

### 1. 静默登录：`POST /auth`

小程序先调用 `wx.login()` 获取一次性 `code`，再请求：

```http
POST /auth
Content-Type: application/json

{
  "code": "wx.login 返回的 code"
}
```

API 当前处理步骤：

1. 调微信官方 `jscode2session`，用 `code` 换 `openid / unionid`。
2. 用 `openid` 查 `user_oauth_identities`。
3. 命中 OAuth 身份后，同步旧身份映射 `wechat_identities`。
4. 执行 OAuth 身份 best-effort 同步。
5. 查询用户角色 `getUserRoles()`。
6. 如果包含 `employee`，构建员工登录上下文：
   - 查 `authorizationService.getAuthContextByAuthUserId()`。
   - 如果没有员工身份，再查 `user_business_memberships`。
   - 再按 employeeId 查 auth context。
   - 组装租户、员工、角色、权限。
   - 签发 employee token。
7. 返回 `mode: "employee"`、`token`、`tenant`、`employee`。

### 2. 绑定员工身份：`POST /auth/verify-role`

如果 `/auth` 只返回 visitor，员工需要手机号验证码验证身份：

```http
POST /auth/verify-role
Authorization: Bearer <visitor_token>
Content-Type: application/json

{
  "phone": "手机号",
  "code": "验证码",
  "target_role": "employee"
}
```

API 当前处理步骤：

1. 校验短信验证码。
2. 根据手机号查员工候选。
3. 检查员工状态、租户状态。
4. 检查或写入 employee membership。
5. 同步 `employees.user_id`。
6. 同步 `wechat_identities`。
7. 同步 `user_oauth_identities`。
8. 同步 `user_business_memberships`。
9. 查询用户角色。
10. 构建 employee auth context。
11. 返回 employee token 和员工信息。

## 慢的主要原因

### 远端依赖串行执行

当前本机 API 连接远端 Supabase，并且还会调用微信官方接口。一次登录请求包含多个远端 HTTP / DB round trip，串行等待会直接放大耗时。

### `/auth` 承担了过多同步工作

`/auth` 不只是换取 openid，还同步旧身份表、同步 OAuth 身份、解析角色、构建完整员工权限上下文。对用户来说，很多同步动作并不需要阻塞“进入小程序”。

### auth context 构建较重

员工上下文可能涉及员工、租户、部门、岗位、角色、权限、权限覆盖等多张表。缓存未命中时，首次登录会明显慢。

### 小程序端缺少分阶段反馈

如果页面只展示按钮 loading，用户会感觉卡死。登录超过 `1.5s` 时需要明确提示“正在确认员工身份”。

## 优化目标

- 员工已绑定场景：`/auth` 目标响应时间降到 `1.5s - 2.5s`。
- 首次绑定员工场景：`/auth/verify-role` 目标响应时间降到 `2s - 4s`。
- 登录等待超过 `1.5s` 时，小程序端必须有明确文案反馈。
- 不牺牲身份正确性，不绕过员工状态、租户状态、权限边界。

## API 优化计划

### 阶段 0：visitor session 链路拆分

对陌生游客不再在 `POST /auth` 同步创建 Supabase Auth 用户。

新链路：

1. `/auth` 仍然先用微信 `code` 换 `openid`。
2. API 先尝试解析已有 OAuth / legacy 身份，避免把已绑定员工或客户误判为游客。
3. 如果确认是新游客或已解绑 legacy 身份，立即返回短期 `visitor_session` token：
   - `mode: "platform_visitor"`
   - `roles: ["visitor"]`
   - `user_id: null`
   - `visitor_id: wechat_visitor_<openid hash>`
4. 真实 Supabase Auth 用户创建、`wechat_identities` 和 `user_oauth_identities` 同步改为后台任务。
5. `visitor_session` 只允许访问访客可用接口和 `/auth/verify-role`，不能访问需要真实 `auth.users.id` 的业务接口。
6. 用户执行员工 / 客户手机号验证时，`/auth/verify-role` 会先把 `visitor_session` 升级为真实 auth user，再继续绑定员工或客户身份。

设计收益：

- 陌生游客首屏不再等待 Supabase Auth `createUser()`。
- visitor 不再阻塞 `getUserRoles()` 和空的 customer tenant options 查询。
- 后续真正需要业务身份时再承担创建用户成本，等待发生在明确的“身份验证”动作里。
- 临时 visitor token 不带真实 `sub`，避免被误写入 UUID 外键字段。

### 阶段 0.1：membership 模式 visitor fast path

当 `AUTH_IDENTITY_SOURCE=membership` 时，`user_oauth_identities` 是微信登录身份的主来源。此模式下：

1. `/auth` 只同步等待微信 `jscode2session` 和 active OAuth identity 查询。
2. 如果 active OAuth 命中，继续走真实员工 / 客户 / 已有用户登录链路。
3. 如果 active OAuth 未命中，立即返回 `visitor_session`。
4. legacy `wechat_identities`、历史 auth user 查询、unbound 判断和用户补建放到后台完整解析链路执行。

边界：

- `legacy` / `dual` 模式仍保留旧兼容查询，不启用该 fast path。
- fast path 返回的仍是受限 visitor token，不能访问员工 / 客户 / 管理接口。
- 后台发现 legacy 状态异常时只完成诊断或补建，不给当前 visitor token 升级权限。

实测结果：

- visitor `/auth` 从约 `9705ms` 降到 `2293ms`。
- 同步主链路只剩微信 `jscode2session` 约 `1281ms` 和 active OAuth 查询约 `1008ms`。
- legacy / unbound / create user 兼容链路在响应后后台执行，最近一次后台解析约 `6131ms`，不阻塞首屏。

### 阶段 1：拆出非阻塞同步

把不影响本次响应正确性的同步动作改为响应后异步执行：

- `syncLegacyWechatIdentityMapping`
- `userIdentityService.syncOauthIdentityBestEffort`
- `userIdentityService.observeLegacyIdentityStateBestEffort`

处理原则：

- 本次登录只依赖 `openid -> auth_user_id` 的主路径。
- 旧表修复和 best-effort 同步失败只记日志，不阻塞登录响应。
- 异步任务必须捕获异常，不能产生未处理 Promise rejection。

### 阶段 2：减少重复身份查询

优化 `POST /auth` 的 employee 分支：

- `getUserRoles()` 与 `buildEmployeeLoginContext()` 目前可能重复触发身份 / 权限查询。
- 命中 active OAuth identity 后，可以带着 `authUserId` 直接走员工上下文解析。
- 如果 employee membership 已存在，优先用 membership 的 `identity_id` 构建 auth context，减少 fallback 查询。

### 阶段 3：提高 auth context 缓存命中

当前 `authorizationService` 缓存 TTL 是 `30s`。开发和小程序登录场景可以考虑：

- 环境变量配置 TTL。
- 开发环境调到 `5min - 10min`。
- 员工登录成功后主动预热 `authUserId -> AuthContext` 和 `employeeId -> AuthContext` 两个缓存。

### 阶段 4：增加细粒度耗时日志

为 `/auth` 和 `/auth/verify-role` 增加阶段耗时：

- `wechat_jscode2session_ms`
- `resolve_oauth_identity_ms`
- `legacy_identity_sync_ms`
- `get_roles_ms`
- `build_employee_context_ms`
- `verify_sms_ms`
- `bind_employee_ms`
- `total_ms`

日志必须继续脱敏 openid、手机号、token。

## 小程序端优化计划

### 分阶段 UI 反馈

员工登录按钮点击后：

1. `0s - 1.5s`：按钮 loading，文案“登录中”。
2. `1.5s - 4s`：页面显示“正在确认员工身份”。
3. `4s+`：显示“网络较慢，请稍候”，保留 loading。
4. 请求失败：展示后端 message，并提供重试按钮。

### 避免重复触发登录

- 登录请求未完成前禁用按钮。
- 同一个 `wx.login()` code 只能使用一次，失败重试必须重新调用 `wx.login()`。
- 页面 onShow / 初始化不要重复并发调用 `/auth`。

### 缓存短期登录态

- 本地已有有效 employee token 时，优先进入页面。
- 后台调用 `/auth/me/profile` 或权限接口刷新身份。
- token 失效再走完整登录。

## 验收标准

### API 验收

- 已绑定员工再次进入小程序，`POST /auth` 成功返回 `mode: "employee"`。
- `/auth` 不再因为旧身份映射修复失败直接 500。
- `/auth` 日志能看到每个阶段耗时。
- best-effort 同步失败只记 warn/error，不影响主响应。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。

### 小程序验收

- 登录超过 `1.5s` 有明确身份确认提示。
- 登录请求进行中，按钮不能重复点击。
- 请求失败后可重新触发 `wx.login()` 并重试。
- 员工已绑定时不进入手机号验证页。
- visitor 绑定员工时，验证码验证成功后能进入员工首页。

## 当前建议优先级

1. API 先把 `/auth` 的旧身份同步和 best-effort 同步改成非阻塞。
2. API 增加阶段耗时日志，确认真实瓶颈。
3. 小程序端补登录 loading 分阶段文案和防重复点击。
4. 再决定是否继续合并 role/context 查询或拉长 auth context 缓存。
