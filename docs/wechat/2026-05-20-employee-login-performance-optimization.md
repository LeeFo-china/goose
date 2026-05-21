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

### 阶段 0.2：访客首屏数据缓存

访客登录后的首屏接口已经加服务端短 TTL 缓存：

- `/projects/frontend-visible`：60 秒内存缓存，项目创建 / 更新 / 删除时主动失效；缓存过期时使用 in-flight Promise 合并并发远端查询。
- `/ai/decoration-qa/suggestions`：60 秒内存缓存，复用已有 DB / AI cache 结果；同一 cache key 的并发请求复用同一个 in-flight Promise。

实测结果：

- `/projects/frontend-visible`：冷请求约 `1.720s`，缓存命中约 `0.002s`。
- `/ai/decoration-qa/suggestions?scene=visitor`：冷请求约 `1.076s`，缓存命中约 `0.002s`。

小程序端接入要求：

- visitor 登录成功不能依赖 `user_id` 判断登录态；新 visitor session 可能返回 `user_id: null` 和 `visitor_id`。
- 保存 `/auth` 返回的 token 后立即渲染 visitor 首页基础 UI。
- `/projects/frontend-visible` 与 `/ai/decoration-qa/suggestions` 并发请求。
- 小程序本地保留上次项目列表和推荐问题，二次进入先展示本地缓存，再静默刷新服务端数据。

### 阶段 0.3：已补建 visitor auth user 快路径

后台补建 visitor auth user 后，同一个 openid 再次登录会命中 active OAuth identity。此时如果继续走完整角色解析，会重新等待 `getUserRoles()` 和空的 customer tenant options 查询。

优化策略：

- 在 `AUTH_IDENTITY_SOURCE=membership` 下，active OAuth 命中后先检查 `user_business_memberships`。
- 如果没有任何 active business membership，直接返回 visitor 登录上下文。
- 该 visitor-only 判定结果内存缓存 60 秒。
- 员工 / 客户身份验证开始时主动清理相关 auth user 的 visitor-only 缓存，避免身份升级后误判。

### 阶段 0.4：visitor 首屏接口鉴权快路径

已补建 visitor auth user 会拿到带 `sub` 的普通 auth token。访客首屏接口不需要员工 / 客户业务身份，但原鉴权插件仍会对 `openid + sub` 做远端 OAuth credential 校验，导致缓存命中的首屏接口仍可能等待远端身份查询。

优化策略：

- 对 `roles=["visitor"]` 且不包含 `tenant_id / customer_id / employee_id` 的纯 visitor token：
  - 访问访客允许路由时，只校验 JWT 签名和过期时间。
  - 跳过远端 OAuth credential 查询。
- 员工 / 客户 token，以及访问非访客路由时，仍保留原 OAuth / business binding 校验。
- `authPlugin` 增加阶段耗时日志，便于确认慢点是否发生在鉴权前置阶段。

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

### 阶段 2.1：已绑定员工 membership 快路径

2026-05-20 已调整：

- `/auth` 在 `AUTH_IDENTITY_SOURCE=membership` 下，active OAuth 命中后仍先查一次 active business memberships。
- 如果存在 `identity_type = "employee"` 的 active membership，直接用 `identity_id` 构建员工登录上下文。
- 该路径不再先进入通用 `getUserRoles()`，避免额外查询 employees/customers 来推导角色。
- 员工登录上下文会显式检查员工状态；停用员工不会签发 employee token。
- employee token 签发后会预热 auth-plugin 的 OAuth / business binding 校验缓存，登录后的首个 `/auth/me/permissions` 不再重复远端校验。

最近一次验证日志：

- 优化前：`/auth` 中 `resolved user roles` 约 `1643ms`，`/auth` 总耗时约 `5431ms`。
- token 预热后：新 token 的首个 `/auth/me/permissions` 从约 `3.7s` 降到 `1ms - 2ms`。
- 本阶段预期继续减少已绑定员工 `/auth` 中约 `1.5s - 1.8s` 的角色解析等待。

### 阶段 2.2：身份查询短 TTL 缓存

2026-05-20 已调整：

- `userIdentityService.findActiveOauthIdentity()` 对 active OAuth 正向结果增加 10 秒内存缓存。
- `userIdentityService.listActiveBusinessMemberships()` 对 active memberships 增加 10 秒内存缓存。
- 同一个 openid / userId 的并发身份查询会复用 in-flight Promise，避免首批并发请求同时打远端 Supabase。
- OAuth 同步、OAuth 解绑、membership 同步、membership 解绑、membership 转移时，本进程立即清理相关缓存。
- TTL 与 auth-plugin 微信身份校验缓存保持同一量级，避免长期持有已变化身份。

预期收益：

- 退出后重登、权限校验、员工首页首批接口在短时间内重复读取同一 openid / userId 时，减少重复 Supabase round trip。
- 小程序端完成登录状态门禁后，`/auth` 后的首批员工接口能复用刚登录阶段产生的身份缓存。
- 如果小程序端暂时仍提前触发旧 token 权限校验，该校验产生的身份查询结果也能被随后 `/auth` 复用，降低重复等待。

### 阶段 2.3：员工完整权限上下文预热

2026-05-20 已调整：

- `/auth` 或 `/auth/verify-role` 成功返回 employee token 前，会启动 `prewarm_employee_auth_context` 后台任务。
- 该任务加载完整 `authorizationService.getAuthContextByEmployeeId()`，包含角色、权限和权限覆盖。
- `authorizationService` 对 authUserId / employeeId 的完整上下文加载增加 in-flight 复用。
- 如果小程序在登录成功后立即请求 `/auth/me/permissions`，会复用同一个预热 Promise，避免再开一轮完整权限查询。

预期收益：

- 登录后的首个 `/auth/me/permissions` 从约 `2s+` 降到预热完成后的毫秒级。
- 即使权限接口追上预热任务，也只等待同一次查询，不重复打远端 Supabase。

### 阶段 2.4：员工首页 bootstrap 合并入口

2026-05-20 已调整：

- 新增 `GET /employee/bootstrap`。
- 该接口要求 employee token，服务端会一次性完成：
  - 当前员工完整 `context`。
  - 用户资料 `profile`，字段兼容 `/auth/me/profile` 的首屏使用场景。
  - 首页统计 `home_stats`。
  - 任务中心摘要 `task_summary`。
- 服务端响应后会后台预热：
  - `/home_stats`
  - `/task-center/todos/summary`
  - `/projects/status?page=1&pageSize=20&ownership=self`
  - `/customers?page=1&pageSize=20`
- 默认 `home_mode=defer`、`tasks_mode=defer`，`home_stats` 和 `task_summary` 返回 `null`。
- 如果需要兼容旧行为，可以显式请求 `GET /employee/bootstrap?home_mode=inline&tasks_mode=inline`。
- `projects_mode` 和 `customers_mode` 当前固定返回 `defer`，表示项目列表和客户列表仍由小程序后续请求，但这些请求可复用服务端预热产生的 in-flight 或短缓存。

接口示例：

```http
GET /employee/bootstrap
Authorization: Bearer <employee_token>
```

响应结构：

```json
{
  "data": {
    "context": {
      "authUserId": "...",
      "tenantId": "...",
      "employeeId": "...",
      "roles": [],
      "permissions": []
    },
    "profile": {
      "auth_user_id": "...",
      "nickname": null,
      "avatar": null,
      "avatar_path": null,
      "profile_completed": false,
      "profile_completed_at": null,
      "roles": []
    },
    "home_mode": "defer",
    "home_stats": null,
    "tasks_mode": "defer",
    "task_summary": null,
    "projects_mode": "defer",
    "projects": null,
    "customers_mode": "defer",
    "customers": null
  },
  "message": "success"
}
```

小程序端接入要求：

- `/auth` 返回 `mode: "employee"` 后，先写入新 token，再进入 `employee_ready`。
- `employee_ready` 后优先请求 `GET /employee/bootstrap`。
- 小程序不要再在登录完成后立即并发请求：
  - `/auth/me/permissions`
  - `/auth/me/profile`
  - `/home_stats`
  - `/task-center/todos/summary`
- 上述数据改为从 `/employee/bootstrap` 读取。
- 项目列表和客户列表可以在 bootstrap 返回后再请求：
  - `/projects/status?page=1&pageSize=20&ownership=self`
  - `/customers?page=1&pageSize=20`
- 页面首屏应先用 bootstrap 的 `context` 和 `profile` 渲染首页框架，再逐步填充统计、任务、项目和客户列表。

预期收益：

- 登录后首页身份/profile 请求收敛为 1 条 bootstrap。
- `/auth/me/permissions` 和 `/auth/me/profile` 不再作为员工首页首屏必需接口。
- 统计、任务、项目、客户首屏仍保留短缓存和 in-flight 合并，但不阻塞 bootstrap 返回。

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

### 阶段 5：员工首页读接口短缓存

2026-05-20 已调整：

- `/home_stats` 增加 10 秒 per-tenant/per-employee/per-permission 内存缓存。
- `/task-center/todos/summary` 增加 10 秒 per-tenant/per-employee/per-permission 内存缓存。
- 两个接口都增加 in-flight Promise 合并，同一员工短时间内重复或并发请求只触发一次远端查询。

边界：

- 缓存时间较短，只用于登录后首屏和页面重复 onShow 的读性能优化。
- 缓存 key 包含租户、员工、角色和权限 scope，避免跨员工或权限变化串数据。
- 新建/更新业务数据后的强一致刷新后续可通过显式刷新接口或缓存失效事件补充；当前阶段优先解决退出重登后的首屏重复请求等待。

### 阶段 6：客户自助链路短缓存

2026-05-20 观察到退出/重登后实际落到 customer 链路，慢点集中在：

- `/auth` 的客户租户选项解析。
- `/auth/me/customer-context` 的客户身份和用户资料查询。
- `/customer/projects` 的客户项目列表查询。

已调整：

- `/auth` 客户单租户自动登录复用当前请求已查询到的 roles，避免签 customer token 前重复查询角色。
- 客户租户选项增加 10 秒 per-auth-user/per-identity-source 内存缓存和 in-flight 合并。
- 客户上下文需要的客户档案、用户资料增加 10 秒短缓存。
- `/customer/projects` 增加 10 秒 per-customer/per-tenant/per-page 短缓存。
- 客户身份绑定、资料更新会清理或覆盖对应短缓存。
- `/auth` 返回 customer session 前后台预热 `/auth/me/customer-context` 需要的客户档案和用户资料；小程序紧接着请求时可命中同一个 in-flight 或短缓存。
- `/customer/projects/:projectId/share-campaigns/summary` 增加 60 秒 per-customer/per-project 短缓存和 in-flight 合并，用于降低客户项目详情页重复刷新等待。
- membership 模式下，如果当前账号只有 customer membership，`/auth` 直接推导 `roles: ["customer"]`，不再额外查询角色表。
- `/customer/projects/:projectId/appointment-reward-campaign` 对“未命中活动”的 404 增加 300 秒负缓存和 in-flight 合并，避免项目详情页重复等待慢 404。
- `/auth` 客户租户选项改为 lean 查询：单租户 customer 自动登录不再加载项目数和最近项目名；只有返回 `select_tenant` 时才补充项目概览。
- `/customer/project-acceptances` 增加 10 秒 per-auth-user/per-tenant/per-customer/per-query 短缓存和 in-flight 合并；列表详情从逐条补齐改为批量补齐 items、actions、project、参与人和短信通知记录，减少客户项目详情页首次加载时的远端查询轮次。
- `/customer/projects/:projectId/share-campaigns/summary` 首次请求改为并行读取客户项目归属和分享配置，并提前并行读取最近图片日志；同一首屏内复用 customer、ownedProject、projectTenant、marketingCampaign 匹配和 recent image log 的热点缓存/in-flight。
- `/customer/projects/:projectId/appointment-reward-campaign` 首次请求改为并行读取客户项目归属和预约奖励活动匹配；未命中活动时仍保留负缓存，同一首屏内复用 ownedProject、projectTenant 和 marketingCampaign 匹配结果。
- `/customer/projects/:projectId/share-campaigns/summary` 和 `/customer/projects/:projectId/appointment-reward-campaign` 现在优先使用 customer token 中的 `customer_id/tenant_id` 做项目归属校验，避免首个请求再次通过 `auth_user_id` 反查客户身份。
- 分享 summary 的活动配置读取改为并行读取营销活动匹配和旧项目配置；当回退旧配置时不再额外串行等待。
- 带 `customer_id/tenant_id` 的本地 service 验证结果：分享 summary 未预热约 `2281ms`，缓存命中约 `0ms`；预约奖励未命中活动约 `1103ms`，负缓存命中约 `0ms`。
- `/customer/projects/:projectId` 增加 10 秒 per-customer/per-tenant/per-project 短缓存和 in-flight；`/customer/projects` 列表返回时同步预热项目详情缓存，降低列表后立刻进详情的重复项目查询。
- `/customer/projects/:projectId/logs` 增加 10 秒 per-project/per-tenant/per-page 日志列表缓存和日志评论聚合缓存，减少页面 onShow 或详情页并发刷新时的重复日志查询。
- `/auth` 客户租户选项关键读查询增加 8 秒快速超时和 1 次瞬时网络错误重试，避免 Supabase socket 短暂断开时单次登录卡到几十秒。
- `/customer/project-acceptances` 首次请求继续缩短串行链路：优先复用 customer token 中的 `customer_id/tenant_id` 做客户校验，客户校验和项目校验并行执行，并复用本次已查到的 project/customer 参与列表详情拼装。

边界：

- 该阶段只优化客户自助端重复请求和首屏串行等待，不改变员工身份判断。
- 客户资料、项目列表、项目详情、日志、验收列表仍保持短 TTL；项目详情扩展活动接口按读场景放宽到 60 秒 summary 缓存和 300 秒预约奖励未命中负缓存。
- 如果后续要继续优化验收列表首个请求，需要进一步拆分列表轻量响应和详情响应，避免列表页同步返回完整验收项、操作记录和通知记录。

### 阶段 7：清理旧兼容登录热路径

2026-05-20 已调整：

- `AUTH_IDENTITY_SOURCE` 默认值从 `dual` 改为 `membership`。
- membership 模式下，`/auth` active OAuth miss 不再 fallback 到旧 `wechat_identities` 或旧 `${openid}@wechat.local` auth user 修复路径。
- `/auth` 命中 active OAuth 后不再后台补写 `wechat_identities`。
- 新建访客 auth user 后不再后台补写 `wechat_identities`，只写 `user_oauth_identities`。
- `/auth/me/*`、客户自助、项目验收、客户分享活动等身份解析的默认口径同步改为 membership。

2026-05-20 后续清理已完成：

- API 运行时代码已移除 `AUTH_IDENTITY_SOURCE=dual|legacy`、旧 `wechat_identities` fallback、历史 `${openid}@wechat.local` 找回和 `find_auth_user_by_openid` 修复链路。
- Supabase 远端已删除 `public.wechat_identities` 和 `public.find_auth_user_by_openid(text)`。
- `list_employee_login_bindings` 已改为读取 `user_oauth_identities(platform='wechat_mini', status='active')`。
- `apps/api/src/types/database.ts` 已重新生成，类型层也不再包含旧表和旧 RPC。
- 小程序端不需要、也不能再依赖旧微信身份映射。登录和绑定问题统一按 `user_oauth_identities` + `user_business_memberships` 排查。

## 小程序端优化计划

### 分阶段 UI 反馈

员工登录按钮点击后：

1. `0s - 1.5s`：按钮 loading，文案“登录中”。
2. `1.5s - 4s`：页面显示“正在确认员工身份”。
3. `4s+`：显示“网络较慢，请稍候”，保留 loading。
4. 请求失败：展示后端 message，并提供重试按钮。

### 小程序端对接任务单

本轮小程序端只需要围绕员工登录状态机改动，核心目标是：同一轮流程中不能同时跑“旧 token 恢复”和“重新登录 / wx.login”。

必须完成：

- 增加全局登录流程状态：
  - `anonymous`
  - `restoring_employee`
  - `authenticating`
  - `employee_ready`
  - `visitor_ready`
  - `auth_failed`
- 增加全局 in-flight 复用：
  - `authPromise`
  - `employeeBootstrapPromise`
- `employeeBootstrapPromise` 必须放在全局登录/session store 中，不能放在单个页面实例里。
- 所有入口都必须通过同一个 `ensureEmployeeBootstrap()` 获取员工 bootstrap：
  - app 启动
  - landing 页
  - 员工首页 onShow
  - tab 初始化
  - 登录成功事件回调
  - 页面刷新/下拉刷新
- 已有 employee token 恢复时，只允许进入 `restoring_employee`：
  - 只请求 `GET /employee/bootstrap`
  - 成功后进入 `employee_ready`
  - `401/403` 后清空 token，再进入 `anonymous` 或 `authenticating`
- 重新登录 / 点击登录 / 退出后登录时，只允许进入 `authenticating`：
  - 先清空旧 token、旧角色、旧员工态
  - 取消或标记废弃旧 token 触发的所有 in-flight
  - 再调用 `wx.login()`
  - 再请求 `POST /auth`
  - `/auth` 返回 `mode: "employee"` 并写入新 token 后，才请求 `GET /employee/bootstrap`
- 员工首页首屏使用 `/employee/bootstrap` 返回的：
  - `context`
  - `profile`
- 员工首页首屏不再请求：
  - `/auth/me/profile`
  - `/auth/me/permissions`
- bootstrap 返回后再延迟请求：
  - `/home_stats`
  - `/task-center/todos/summary`
  - `/projects/status?page=1&pageSize=20&ownership=self`
  - `/customers?page=1&pageSize=20`

必须禁止：

- `restoring_employee` 状态下触发 `wx.login()` 或 `/auth`。
- `authenticating` 状态下用旧 token 触发 `/employee/bootstrap`。
- `/auth` 未完成、新 token 未写入前，请求任何员工首页接口。
- 同一轮发起多个 `/auth`。
- 同一轮发起多个 `/employee/bootstrap`。
- 页面各自维护局部 `employeeBootstrapPromise`。
- 在 bootstrap 已经 in-flight 时，另一个页面直接调用接口层重新请求 `/employee/bootstrap`。
- 页面 `onShow`、组件 mounted、landing 页展示时绕过全局状态机直接拉员工接口。

建议实现：

```ts
let authPromise: Promise<AuthResult> | null = null;
let employeeBootstrapPromise: Promise<EmployeeBootstrap> | null = null;
let loginEpoch = 0;

function ensureEmployeeBootstrap() {
  employeeBootstrapPromise ||= api.employeeBootstrap();
  return employeeBootstrapPromise;
}

async function restoreEmployeeSession() {
  if (authState !== "anonymous" && authState !== "employee_ready") return;
  const token = getStoredEmployeeToken();
  if (!token) return;

  authState = "restoring_employee";
  const epoch = ++loginEpoch;

  try {
    const bootstrap = await ensureEmployeeBootstrap();
    if (epoch !== loginEpoch) return;
    authState = "employee_ready";
    applyEmployeeBootstrap(bootstrap);
  } catch (error) {
    if (epoch !== loginEpoch) return;
    clearEmployeeSession();
    authState = "anonymous";
  } finally {
    if (epoch === loginEpoch) employeeBootstrapPromise = null;
  }
}

async function loginByWechatCode() {
  if (authPromise) return authPromise;

  const epoch = ++loginEpoch;
  authState = "authenticating";
  employeeBootstrapPromise = null;
  clearEmployeeSession();

  authPromise = (async () => {
    const code = await wxLogin();
    const auth = await api.auth({ code });
    if (epoch !== loginEpoch) return auth;

    if (auth.mode === "employee") {
      saveEmployeeToken(auth.token);
      authState = "employee_ready";
      applyEmployeeBootstrap(await ensureEmployeeBootstrap());
    }

    return auth;
  })().finally(() => {
    if (epoch === loginEpoch) authPromise = null;
    if (epoch === loginEpoch) employeeBootstrapPromise = null;
  });

  return authPromise;
}
```

验收标准：

- 已有 token 恢复时，日志只应出现 `/employee/bootstrap`，不应同时出现 `POST /auth`。
- 重新登录时，日志顺序必须是 `POST /auth` 成功后，再出现 `/employee/bootstrap`。
- 同一轮最多出现一次 `/employee/bootstrap`；如果多个页面同时需要，必须复用全局 `employeeBootstrapPromise`。
- 一组页面 onShow / tab 初始化 / 登录成功回调同时发生时，日志里仍只能出现一个 `/employee/bootstrap`。
- 员工首屏不再出现 `/auth/me/profile`、`/auth/me/permissions`。
- 正常缓存命中时，`/employee/bootstrap` 应接近毫秒级；冷启动或远端鉴权重建时可以有一次慢请求。

### 员工首屏标准请求顺序

员工登录成功后的首屏只能按以下顺序发请求：

1. `POST /auth` 返回 `mode: "employee"`。
2. 小程序同步写入新 `employee_token`，清理旧 token 触发的 in-flight 请求。
3. 状态切到 `employee_ready`。
4. 立即请求 `GET /employee/bootstrap`。
5. 使用 bootstrap 返回的 `context` 和 `profile` 渲染员工首页框架。
6. bootstrap 返回后，再延迟加载扩展数据：
   - `/home_stats`
   - `/task-center/todos/summary`
   - `/projects/status?page=1&pageSize=20&ownership=self`
   - `/customers?page=1&pageSize=20`

首屏禁止继续把以下接口作为登录后的立即并发请求：

- `/auth/me/permissions`
- `/auth/me/profile`
- `/home_stats`
- `/task-center/todos/summary`

这些数据已经由 `/employee/bootstrap` 返回。小程序端如果仍然请求这些旧接口，说明还没有完成本轮员工首页 bootstrap 对接。

### 避免重复触发登录

- 登录请求未完成前禁用按钮。
- 同一个 `wx.login()` code 只能使用一次，失败重试必须重新调用 `wx.login()`。
- 页面 onShow / 初始化不要重复并发调用 `/auth`。
- 退出登录后必须先清空旧 token 和用户态，再进入登录状态机。
- “已有 token 恢复”和“重新登录 / wx.login”是互斥流程，不能同一轮同时执行。
- 如果本轮已经决定调用 `wx.login()` 和 `/auth`，必须先取消或忽略旧 token 触发的 `/employee/bootstrap`、`/home_stats`、`/task-center/todos/summary`、`/customers`、`/projects/status`。
- 如果本轮走已有 token 恢复，只允许请求 `/employee/bootstrap`；不要同时触发新的 `/auth`，除非 bootstrap 返回 `401/403` 或 token 已明确过期。
- 新一轮 `/auth` 未完成、未写入新 token 前，不要并发请求员工首页接口：
  - `/auth/me/permissions`
  - `/auth/me/profile`
  - `/employee/bootstrap`
  - `/home_stats`
  - `/task-center/todos/summary`
  - `/customers`
  - `/projects/status`
- 上述首页数据请求必须由“employee token 已写入本地存储”这个事件触发，而不是由 landing 页展示、页面 onShow 或旧 token 残留触发。
- 如果登录中需要展示首页骨架屏，只展示本地缓存或静态骨架，不发需要 employee token 的接口。

本地日志已出现过反例：退出后 `/auth` 尚未完成时，小程序提前并发请求首页接口，导致 `/home_stats`、`/task-center/todos/summary`、`/customers`、`/projects/status` 返回 `401`。这些 401 会造成额外重试和用户体感等待，必须在小程序端用登录状态门禁解决。

推荐小程序状态机：

1. `anonymous`：无 token，只能发 `/auth`、游客公开接口。
2. `authenticating`：已经调用 `wx.login()` 或 `/auth`，禁止发员工首页接口。
3. `employee_ready`：`/auth` 返回 `mode: "employee"`，并且新 token 已写入本地存储；进入该状态后的第一条员工首页请求必须是 `/employee/bootstrap`。
4. `visitor_ready`：`/auth` 返回 visitor，只能发 visitor 允许接口；点击员工登录再进入 `/auth/verify-role`。
5. `auth_failed`：清理本次 code 和临时状态，重新触发必须重新调用 `wx.login()`。

首页数据请求只允许从 `employee_ready` 状态触发。页面 `onShow` 如果发现状态是 `authenticating`，只订阅登录完成事件，不主动请求员工接口。页面 `onShow` 如果发现状态已经是 `employee_ready`，也必须先检查本轮 `/employee/bootstrap` 是否完成；未完成时不能抢跑 `/auth/me/permissions`、`/auth/me/profile`、`/home_stats`、`/task-center/todos/summary`、`/projects/status` 或 `/customers`。

### 员工恢复登录和重新登录互斥

本地日志已出现过反例：小程序先用旧 token 请求 `/employee/bootstrap`，随后又调用 `wx.login()` 和 `POST /auth`。这种混合流程会导致用户先等待一次旧 token bootstrap，再等待真正的 `/auth`，体感变慢。

端上必须拆成两个互斥入口：

#### A. 已有 token 恢复

适用场景：

- 应用冷启动或页面 onShow 发现本地存在 employee token。
- 用户没有主动点击“重新登录”。
- token 未明确过期。

请求顺序：

1. 进入 `restoring_employee` 状态。
2. 只发一个 `GET /employee/bootstrap`。
3. 多个页面需要员工首页状态时，复用同一个 bootstrap Promise。
4. bootstrap 成功后进入 `employee_ready`。
5. bootstrap 返回 `401/403` 后，清空旧 token 和所有 in-flight，再进入 `anonymous` 或 `authenticating`。

禁止事项：

- `restoring_employee` 状态下不要调用 `wx.login()`。
- `restoring_employee` 状态下不要并发请求 `/auth`。
- bootstrap 未完成前，不要请求 `/home_stats`、`/task-center/todos/summary`、`/customers`、`/projects/status`。

#### B. 重新登录 / wx.login

适用场景：

- 用户主动点击登录。
- 退出登录后重新进入。
- bootstrap 已返回 `401/403`。
- token 已明确过期。

请求顺序：

1. 进入 `authenticating` 状态。
2. 同步清空旧 token、旧角色、旧员工态。
3. 取消或标记废弃旧 token 触发的所有 in-flight 请求。
4. 调用 `wx.login()`。
5. 请求 `POST /auth`。
6. `/auth` 返回 `mode: "employee"` 后写入新 token。
7. 进入 `employee_ready`。
8. 请求 `GET /employee/bootstrap`。

禁止事项：

- `authenticating` 状态下不要用旧 token 请求 `/employee/bootstrap`。
- 新 token 写入前，不要请求任何员工首页接口。
- 同一轮只允许一个 `/auth` in-flight。
- 同一轮只允许一个 `/employee/bootstrap` in-flight。

### 客户登录态门禁

2026-05-20 本地日志确认：客户登录时 `/auth` 尚未完成，小程序仍会提前用旧 token 或旧页面状态请求 `/customer/project-acceptances`，单次抢跑可耗时 `5s+`。这类请求会和 `/auth`、客户首屏接口并发竞争网络与后端查询，导致用户体感“登录很慢”。

客户登录必须和员工登录一样使用状态门禁：

1. `anonymous`：无 token，只能发 `/auth`、公开分享页、公开营销页接口。
2. `authenticating`：已调用 `wx.login()` 或 `/auth`，禁止发任何需要 customer token 的接口。
3. `customer_ready`：`/auth` 返回 `mode: "customer"`，并且新 token 已写入本地存储后，才能发客户首屏接口。
4. `platform_visitor_ready`：`/auth` 返回 `platform_visitor`，只能发游客允许接口；不能发 `/customer/*`。
5. `select_tenant`：`/auth` 返回多租户选择，只能展示租户选择页；选择租户并拿到 customer token 前不能发 `/customer/*`。
6. `auth_failed`：清理本次 code、临时 token 和旧角色态；重试必须重新调用 `wx.login()`。

`authenticating` 阶段禁止提前请求：

- `/auth/me/customer-context`
- `/customer/bootstrap`
- `/auth/me/profile`
- `/customer/projects`
- `/customer/projects/:id`
- `/customer/projects/:id/logs`
- `/customer/project-acceptances`
- `/customer/projects/:projectId/appointment-reward-campaign`
- `/customer/projects/:projectId/share-campaigns/summary`

客户首屏建议触发顺序：

1. `/auth` 完成，写入新 token、`mode`、`tenant_id`、`customer_id`。
2. 进入 `customer_ready`。
3. 客户首页优先请求 `/customer/bootstrap?page=1&pageSize=20&include=home_summary&projects_mode=defer`，先拿到客户身份态。
4. `projects_mode=defer` 时，`/customer/bootstrap` 只返回 `context`，`projects` 为 `null`；服务端会后台预热首页项目列表。
5. bootstrap 返回后，再请求 `/customer/projects?page=1&pageSize=20&include=home_summary` 渲染项目列表；该请求可复用 `/auth` 或 bootstrap 触发的后台预热。
6. 小程序不要再并发请求 `/auth/me/customer-context`，也不要同时打两个 `/customer/projects`。
7. 只有用户进入具体项目详情页时，再请求项目详情、日志、验收、预约奖励和分享 summary。
8. 预约奖励和分享活动不是进入客户首页的阻塞条件，建议延后加载；接口未返回前展示局部骨架或隐藏活动卡片。

`/customer/bootstrap` 响应结构：

```ts
{
  context: {
    mode: "customer";
    auth_user_id: string;
    customer_id: string;
    tenant_id: string;
    tenant_status: string | null;
    customer_name: string | null;
    has_customer_profile: boolean;
    nickname: string | null;
    avatar: string | null;
    profile_completed: boolean;
  };
  projects_mode: "inline" | "defer";
  projects: null | {
    list: Array<CustomerProject & { recent_logs?: CustomerRecentLog[] }>;
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}
```

端上去重要求：

- 同一轮登录只允许一个 `/auth` in-flight。
- 同一 projectId 的项目详情、日志、验收、预约奖励、分享 summary 在 in-flight 时复用同一个 Promise，不重复发请求。
- 页面 `onShow` 如果发现状态是 `authenticating`，只能订阅登录完成事件，不能主动拉客户接口。
- 退出登录时必须同步清空 token、角色、`customer_id`、`tenant_id`、项目缓存和所有 in-flight 请求引用。
- 新 token 写入前，不允许旧页面的 mounted/onShow 逻辑继续用旧 token 拉 `/customer/*`。

### 缓存短期登录态

- 本地已有有效 employee token 时，优先进入页面。
- 后台调用 `/employee/bootstrap` 刷新员工首页身份、统计和任务摘要。
- `/auth/me/profile` 只用于个人资料页或确实需要 profile 字段的场景，不作为员工首页首屏必需接口。
- `/auth/me/permissions` 只用于权限调试或 bootstrap 之外的特殊权限刷新，不作为员工首页首屏必需接口。
- token 失效再走完整登录。

## 2026-05-20 19:50 员工首次重绑优化

本轮日志显示，员工退出后从 landing 页重新登录时，慢点集中在 visitor 账号重绑到已有员工 auth user：

- `POST /auth` 仍需要等待微信 `jscode2session`，本次约 `2.8s`。
- `POST /auth/verify-role` 总耗时约 `8.6s`。
- `bindEmployeeRole()` 里 `oauth_identity_synced` 单段约 `3.3s`，是最大同步等待。
- 登录后首个 `/auth/me/permissions` 约 `3s`，主要是在等待员工 auth context 首次预热完成。

已完成 API 调整：

- 新增 `sync_user_oauth_identity(p_user_id, p_platform, p_openid, p_unionid)` RPC。
- 员工/customer/visitor 登录共用的 OAuth 身份同步由“先查 active OAuth，再 update/insert”改为一次 RPC 完成。
- `verify-role` 仍同步等待 OAuth 绑定完成后再签发 employee token，避免新 token 立刻被 auth 插件拒绝。
- 远端 migration 已推送，API 3000 服务已重启。

下一次员工首次登录重点看日志：

- `oauth_identity_synced` 是否从 `3s+` 降到约一次远端 RPC 的耗时。
- `/auth/verify-role` 总耗时是否明显下降。
- `/auth/me/permissions` 是否仍被首屏立即请求阻塞；该问题后续已通过 `GET /employee/bootstrap` 作为员工首屏入口处理。

## 2026-05-20 20:01 员工直登优化

重绑完成后的员工再次登录已经不走 `/auth/verify-role`，而是 `POST /auth` 直接返回 employee。最新一次日志：

- `jscode2session`：约 `1.8s`
- active OAuth 查询：约 `1.1s`
- login memberships 查询：约 `1.1s`
- 员工登录上下文：约 `1.2s`
- `/auth` 总耗时：约 `5.2s`

已完成 API 调整：

- 扩展 `list_wechat_login_memberships()` RPC，员工 membership 行同时返回员工、租户、部门、岗位的轻量字段。
- `/auth` 命中 employee membership 时，不再额外按 employeeId 查一次员工基础上下文，直接用 membership RPC 返回的轻量上下文签发 employee token。
- 完整权限上下文仍由 `prewarm_employee_auth_context` 后台预热，避免阻塞 `/auth` 主响应。

下一次员工直登重点看日志：

- `[auth] resolved employee login context result` 的 `source` 应为 `login_membership_row`。
- 该阶段耗时应从约 `1.2s` 降为毫秒级。
- `/auth` 总耗时理论上应减少到约 `4s` 左右；剩余大头是微信 `jscode2session`、active OAuth 查询和 login memberships 查询。

## 2026-05-20 20:07 员工直登合并登录态查询

再次员工直登日志确认上一轮优化已命中：

- `[auth] resolved employee login context result`：`2ms`
- `source`：`login_membership_row`
- `/auth` 总耗时：约 `4.9s`

剩余慢点变成两个串行远端读：

- active OAuth 查询：约 `1.8s`
- login memberships 查询：约 `1.1s`

已完成 API 调整：

- 新增 `resolve_wechat_login_state_by_openid(p_openid)` RPC。
- `/auth` 在拿到微信 openid 后，优先用一次 RPC 同时解析 active OAuth、auth user、membership、客户选项和员工轻量上下文。
- 命中该 RPC 时，不再先查 OAuth、再按 userId 查 membership。
- 如果 RPC 未命中 active OAuth，仍回退到 visitor session / 创建 auth user 的原有链路。

下一次员工直登重点看日志：

- 应出现 `[auth] resolved login state by openid`。
- 命中时 `found: true`。
- 后续 `[auth] visitor only auth user checked` 的 `source` 应为 `login_state_by_openid`。
- 不应再出现独立的 `[auth] active oauth identity lookup result`，除非 openid 没有 active OAuth、进入 visitor fallback。
- `/auth` 总耗时应再减少约一次远端读，剩余主要是微信 `jscode2session` 和一次登录态 RPC。

## 2026-05-20 20:20 员工登录验证结果

最新两次员工直登已经命中合并登录态 RPC：

- 第一次 `/auth`：约 `2.1s`
  - `jscode2session`：`274ms`
  - `resolve_wechat_login_state_by_openid`：约 `1.8s`
  - 员工轻量上下文：`2ms`
- 第二次 `/auth`：约 `2.5s`
  - `jscode2session`：约 `1.4s`
  - `resolve_wechat_login_state_by_openid`：约 `1.0s`
  - 员工轻量上下文：`0ms`
- 第二次 `/auth/me/permissions`：`0ms`

已完成 API 调整：

- auth-plugin 对同一个 token 的 OAuth / business binding 校验增加 in-flight 复用，避免登录后 `/auth/me/profile` 与 `/auth/me/permissions` 并发时重复打远端。
- `/projects/status` 的 count 和 rows 查询改为并行执行，并增加 10 秒 per-user/per-query in-flight/cache，降低员工首页项目列表重复请求成本。

当时剩余首屏慢点：

- `/projects/status` 仍可能约 `2.8s - 3.1s`，下一次登录后需验证并行和缓存是否生效。
- `/home_stats`、`/task-center/todos/summary`、`/customers` 仍约 `1.2s - 1.7s`，后续已通过“阶段 2.4：员工首页 bootstrap 合并入口”处理。

## 2026-05-20 20:25 员工首页首屏验证结果

最新一次员工登录后：

- `/auth`：约 `2.6s`
  - `jscode2session`：约 `1.4s`
  - `resolve_wechat_login_state_by_openid`：约 `1.2s`
  - 员工轻量上下文：`2ms`
- `/auth/me/permissions`：约 `3.1s`
  - 仍在等待后台 `prewarm_employee_auth_context` 完成。
- `/projects/status`：约 `1.6s`
  - 已从上一轮 `2.8s - 3.1s` 明显下降。
- `/customers`：约 `1.2s`
- `/home_stats`：约 `1.3s`
- `/task-center/todos/summary`：约 `1.8s`

结论：

- 登录主链路优化已生效，当前 `/auth` 剩余主要是微信接口和一次远端登录态 RPC。
- `/projects/status` 并行 count/rows 和短缓存已生效。
- 下一刀最有价值的是员工权限上下文预热：让 `/auth/me/permissions` 不再阻塞首屏，或把小程序端首屏改为不等待该接口完成。

## 2026-05-20 20:32 员工权限上下文预热优化

`/auth/me/permissions` 仍会等待 `prewarm_employee_auth_context` 完成，上一轮约 `3.1s`。原链路是：

1. 按 employeeId 查询员工、租户、部门、岗位基础信息。
2. 查询员工角色及角色权限。
3. 查询员工权限覆盖。
4. API 侧合并 role permissions 与 overrides，生成最终 auth context。

已完成 API 调整：

- 新增 `get_employee_permission_context_fast(p_employee_id)` RPC。
- 该 RPC 一次返回 employee、roles、role_permissions、overrides。
- `authorizationService.getAuthContextByEmployeeId()` 底层仓储改为走该 RPC，减少权限预热时的远端读轮次。

下一次员工登录重点看：

- `prewarm_employee_auth_context` 是否从约 `3s` 降低。
- 登录后首个 `/auth/me/permissions` 是否跟随下降。
- 如果小程序旧 token 在 API watch 重载后直接并发请求首页接口，该轮会混入冷启动和鉴权重建耗时，不适合作为稳定对比。

## 2026-05-20 20:37 员工权限上下文验证结果

最新一次员工登录后：

- `/auth`：约 `3.4s`
  - `jscode2session`：约 `2.1s`
  - `resolve_wechat_login_state_by_openid`：约 `1.25s`
  - 员工轻量上下文：`2ms`
- `prewarm_employee_auth_context`：约 `1.8s`
  - 已从上一轮约 `3.1s` 降低。
- `/auth/me/permissions`：约 `1.8s`
  - 与权限预热同步下降。
- `/customers`：约 `1.4s`
- `/projects/status`：约 `1.6s`
- `/task-center/todos/summary`：约 `1.8s`
- `/home_stats`：约 `2.0s`

结论：

- 权限上下文 RPC 生效，首个权限接口等待时间明显下降。
- 当前体验剩余主要来自微信官方接口、一次登录态 RPC，以及员工首页多个业务接口并发冷读。
- 后续已新增员工首页 bootstrap。小程序端应按“员工首屏标准请求顺序”对接，不再把 `/auth/me/permissions`、`/home_stats`、`/task-center/todos/summary` 作为登录后立即并发请求。

## 2026-05-20 20:42 员工首页数据预热

已完成 API 调整：

- `customerCoreService.listCustomers()` 增加 10 秒 per-user/per-query in-flight/cache。
- 客户列表默认分支里 `count` 与 `rows` 改为并行请求，减少串行远端读。
- 员工登录返回后，后台新增 `prewarm_employee_home_data`：
  - 等待完整 auth context 预热完成。
  - 预热 `/home_stats` 对应的 `homeDashboardService.getStats()`。
  - 预热 `/task-center/todos/summary` 对应的 `taskCenterService.getSummary()`。
  - 预热 `/projects/status?page=1&pageSize=20&ownership=self` 对应的项目首屏。
  - 预热 `/customers?page=1&pageSize=20` 对应的客户首屏核心数据。

下一次员工登录重点看：

- 是否出现 `[auth] background task completed` 且 `task=prewarm_employee_home_data`。
- 登录后的 `/home_stats`、`/task-center/todos/summary`、`/projects/status` 是否命中 in-flight/cache。
- `/customers` 至少核心列表应命中缓存；属性摘要、来源摘要、手机号隐私上下文仍可能产生额外远端读。

## 2026-05-20 20:50 员工首页预热验证结果

最新一次员工登录：

- `/auth`：约 `3.3s`
  - `jscode2session`：约 `2.1s`
  - `resolve_wechat_login_state_by_openid`：约 `1.2s`
  - 员工轻量上下文：`2ms`
- `prewarm_employee_auth_context`：约 `1.4s`
- `/auth/me/permissions`：约 `1.4s`
- `/home_stats`：约 `0.9s`
- `/task-center/todos/summary`：约 `1.3s`
- `/customers`：约 `1.5s`
- `/projects/status`：约 `1.6s`
- `prewarm_employee_home_data`：约 `5.5s`

结论：

- `prewarm_employee_home_data` 已执行，但小程序在 `/auth/me/permissions` 返回后立刻请求首页接口，预热任务尚未完成。
- 首页接口当前主要是在复用 in-flight，而不是读取已完成缓存。
- `/home_stats` 已降到 1 秒内；任务、客户、项目仍在 1.3s - 1.6s。

后续对接要求：

- API 侧已完成员工首页 bootstrap，按“先返回首屏必须数据、延迟返回扩展列表”的方式减少小程序并发接口数。
- 小程序侧不要把 `/auth/me/permissions` 作为首屏闸门，也不要在其返回后立即并发所有首页接口。
- 小程序侧必须在 `/auth` 返回 employee 并写入 token 后，先请求 `/employee/bootstrap`，再延迟请求项目和客户列表。

## 2026-05-20 20:58 员工 bootstrap 对接核查

本地最新两轮员工登录日志显示，小程序端仍未请求 `/employee/bootstrap`，实际请求仍是旧链路：

- `POST /auth`
- `/auth/me/permissions`
- `/home_stats`
- `/task-center/todos/summary`
- `/customers`
- `/projects/status`

核查结论：

- 后端 `/employee/bootstrap` 路由已注册，未带 token 请求会返回 `401 TOKEN_MISSING`，说明不是 404 或路由缺失。
- 日志中没有出现 `GET /employee/bootstrap` 或 `[employee-bootstrap] bootstrap resolved`。
- 小程序端需要继续按“员工首屏标准请求顺序”调整登录完成后的首页加载逻辑。

## 2026-05-20 21:10 openid 登录态短缓存

员工 bootstrap 对接后，首屏扩展请求已经能命中毫秒级缓存。剩余主要耗时集中在 `/auth`：

- 微信 `jscode2session`：约 `1.5s - 1.6s`，属于微信官方接口等待。
- `resolve_wechat_login_state_by_openid`：约 `1.0s - 1.2s`，属于远端 Supabase 读请求等待。

本地用 API 环境直测远端 Supabase：

- 极简 `user_oauth_identities` 查询约 `1.27s`。
- 极简 `user_business_memberships` 查询约 `1.27s`。
- `resolve_wechat_login_state_by_openid` RPC 约 `1.16s`。

结论：该阶段主要不是 SQL 复杂度，而是本机到远端 Supabase 的单次请求往返延迟。继续拆 SQL 对首次登录收益有限。

已完成 API 调整：

- `wechatCustomerIdentityService.resolveWechatLoginStateByOpenid()` 增加 60 秒正向短缓存。
- 同一个 openid 的并发登录态解析复用同一个 in-flight Promise。
- 客户/员工身份绑定、membership 同步后清理对应 openid/authUserId 的登录态缓存。
- 缓存只保存 active OAuth 命中的正向结果；openid 未绑定时不做负缓存，避免 visitor 刚绑定后被短期误判。

预期收益：

- 退出后短时间内重登，`resolve_wechat_login_state_by_openid` 可从约 `1.1s` 降到毫秒级。
- 同一轮登录中如果页面或状态机重复触发 `/auth`，后续请求不会重复打远端 Supabase。
- 首次登录仍需要等待微信官方接口和一次远端 Supabase 登录态解析。

## 2026-05-20 21:18 员工 bootstrap 预热前移

连续两次员工登录后，第二次 `/auth` 已命中 openid 登录态缓存：

- `/auth`：约 `281ms`
- `resolve login state by openid`：`0ms`

但第二次登录后的扩展列表仍有等待：

- `/employee/bootstrap`：约 `2.2s`
- `/customers`：约 `1.2s`
- `/projects/status`：约 `1.6s`

原因：

- `/employee/bootstrap` 原实现先等待 `home_stats` 和 `task_summary`。
- 等 bootstrap 即将返回时，才启动 projects/customers deferred prewarm。
- 小程序收到 bootstrap 后立刻请求 `/customers` 和 `/projects/status`，此时预热刚开始，仍要等待远端查询。

已完成 API 调整：

- `/employee/bootstrap` 在拿到 authContext 并完成权限校验后，立即启动 projects/customers deferred prewarm。
- `home_stats`、`task_summary` 与 projects/customers 预热并行执行。
- bootstrap 返回时，项目和客户列表更可能已经完成或正在 in-flight，后续请求更容易命中缓存/复用。

## 2026-05-20 21:25 员工 profile 合并进 bootstrap

已有 token 恢复登录态时，本地日志显示小程序仍先请求 `/auth/me/profile`，再请求 `/employee/bootstrap`。这会在员工首页首屏前额外增加一次鉴权和远端读等待。

已完成 API 调整：

- `/employee/bootstrap` 响应新增 `profile` 字段。
- `profile` 字段兼容 `/auth/me/profile` 的首屏使用场景：
  - `auth_user_id`
  - `nickname`
  - `avatar`
  - `avatar_path`
  - `profile_completed`
  - `profile_completed_at`
  - `roles`
- profile、`home_stats`、`task_summary` 在 bootstrap 内并行加载。

小程序端接入要求：

- 员工首页首屏和已有 token 恢复登录态时，不再先请求 `/auth/me/profile`。
- 需要头像、昵称、资料完成状态时，直接读取 `/employee/bootstrap` 返回的 `profile`。
- `/auth/me/profile` 只保留给个人资料页或资料编辑后的显式刷新。

## 2026-05-20 21:32 员工 bootstrap 轻量化

小程序移除 `/auth/me/profile` 后，恢复已有 token 的首屏链路只剩 `/employee/bootstrap`、`/customers` 和 `/projects/status`。但 bootstrap 仍会同步等待 `home_stats` 和 `task_summary`，单次可能达到 `3s - 6s`。

已完成 API 调整：

- `/employee/bootstrap` 默认改为轻量模式：
  - 同步返回 `context`。
  - 同步返回 `profile`。
  - `home_stats` 默认返回 `null`。
  - `task_summary` 默认返回 `null`。
  - `home_mode` 默认返回 `defer`。
  - `tasks_mode` 默认返回 `defer`。
- 服务端会后台预热 `home_stats`、`task_summary`、`projects/status` 和 `customers`。
- 如果需要旧行为，可显式请求：

```http
GET /employee/bootstrap?home_mode=inline&tasks_mode=inline
Authorization: Bearer <employee_token>
```

小程序端接入要求：

- 首屏不要等待 `home_stats` 或 `task_summary` 才展示首页框架。
- bootstrap 返回后再分别拉 `/home_stats`、`/task-center/todos/summary`、`/projects/status`、`/customers`。
- 同一轮恢复登录只允许一个 `/employee/bootstrap` in-flight，多个页面复用同一个 Promise。

## 2026-05-20 21:40 auth-plugin 鉴权缓存窗口

轻量 bootstrap 后，理想链路已经出现：

- `/employee/bootstrap`：约 `1ms`
- `/home_stats`：约 `1ms`
- `/task-center/todos/summary`：约 `0ms`
- `/customers`：约 `1ms`
- `/projects/status`：约 `2ms`

但当小程序在十几秒后再次触发员工首页接口时，auth-plugin 的微信 OAuth / business binding 校验缓存已经过期，后续 `/home_stats`、`/task-center/todos/summary`、`/customers`、`/projects/status` 会重新等待一轮远端身份校验，单接口可能增加 `0.7s - 1.6s`。

已完成 API 调整：

- auth-plugin 微信身份校验默认缓存 TTL 从 `10s` 调整为 `30s`。
- 仍可通过 `WECHAT_IDENTITY_CHECK_CACHE_TTL_MS` 覆盖，最大值保持 `60s`。
- 同一 token 的并发请求继续复用 in-flight 校验；30 秒窗口用于覆盖登录后首页、页面 onShow 和延迟分区请求。

边界：

- 该缓存只缓存校验成功结果。
- 身份绑定变化后，最坏会在短 TTL 内继续接受旧 token；因此默认只扩大到 30 秒，不做长期缓存。

## 2026-05-20 21:48 小程序互斥登录流程对接

小程序最新两轮登录日志显示：

- 先出现旧 token 的 `/employee/bootstrap`，耗时约 `5.1s - 5.9s`。
- 随后又出现 `POST /auth`，耗时约 `2.6s`。
- `/auth` 后的新 token bootstrap 命中缓存，约 `2ms`。
- `/home_stats`、`/task-center/todos/summary` 在 `/auth` 后约 `1ms`。

结论：

- API 侧 `/auth` 后的 bootstrap 和首屏缓存链路已经生效。
- 当前慢点来自小程序端把“已有 token 恢复”和“重新登录 / wx.login”混在同一轮执行。

小程序端必须按“员工恢复登录和重新登录互斥”章节调整：

- 已有 token 恢复：只请求 `/employee/bootstrap`，不要同时发 `/auth`。
- 重新登录：先清空旧 token 和旧 in-flight，再发 `/auth`，`/auth` 成功后再请求 `/employee/bootstrap`。
- 同一轮只允许一个 `/auth` in-flight 和一个 `/employee/bootstrap` in-flight。

## 2026-05-20 21:55 小程序 bootstrap 全局去重

最新两轮日志显示：

- 未再看到 `POST /auth` 和旧 token `/employee/bootstrap` 混跑，互斥流程方向正确。
- 但同一轮仍出现重复 `/employee/bootstrap`：
  - 第一条冷恢复 bootstrap 约 `1.8s - 5.6s`。
  - 后续重复 bootstrap 可命中缓存，约 `1ms`。
- `/auth/me/profile` 和 `/auth/me/permissions` 已不再出现。

结论：

- 小程序端还需要把 `employeeBootstrapPromise` 放到全局登录/session store。
- landing、首页 onShow、tab 初始化、登录成功事件回调、页面刷新都必须调用同一个 `ensureEmployeeBootstrap()`。
- 页面级局部 Promise 不够，会导致不同页面各自发一次 `/employee/bootstrap`。

验收：

- 同一轮页面恢复或登录完成后，API 日志最多出现一次 `/employee/bootstrap`。
- 如果多个页面同时需要员工 bootstrap，它们必须 await 同一个全局 Promise。
- bootstrap 完成后再触发统计、任务、客户、项目列表的延迟请求。

## 2026-05-20 22:40 小程序对接补充排查项

本次小程序再次登录后，当前 3000 端口 API 会话没有吐出新的请求日志。排查时先确认小程序实际请求地址仍是当前本机 API：

- `baseUrl` 应指向当前局域网 IP 的 `:3000`。
- 不要同时开多个 API 服务或代理到旧端口。
- 重新编译后确认开发者工具没有保留旧 bundle / 旧请求封装缓存。

如果确认请求已经打到当前 API，下一轮验收只看以下接口序列：

#### 员工 token 恢复

期望日志：

```text
GET /employee/bootstrap
```

不应出现：

```text
POST /auth
GET /auth/me/profile
GET /auth/me/permissions
```

说明：

- 恢复登录只验证旧 employee token 是否仍有效。
- 如果 `/employee/bootstrap` 成功，直接进入员工首页。
- 只有 `/employee/bootstrap` 返回 `401/403` 后，才允许清 token 并进入 `/auth`。

#### 员工重新登录

期望日志：

```text
POST /auth
GET /employee/bootstrap
```

不应出现：

```text
GET /employee/bootstrap
POST /auth
GET /employee/bootstrap
```

说明：

- 重新登录必须先清空旧 token 和旧员工态。
- `/auth` 成功、保存新 employee token 后，才允许请求 `/employee/bootstrap`。
- 如果登录成功事件、首页 `onShow`、tab 初始化都触发 bootstrap，它们必须 await 同一个全局 `employeeBootstrapPromise`。

#### 重复 bootstrap 的定位方式

如果同一轮仍出现多个 `/employee/bootstrap`，小程序端按入口逐个加日志定位调用来源：

- app 启动恢复。
- landing 页初始化。
- 员工首页 `onShow`。
- tab 初始化。
- 登录成功事件回调。
- 下拉刷新 / 手动刷新。

每个入口日志至少包含：

- `loginEpoch`
- `authState`
- `hasEmployeeBootstrapPromise`
- `source`

验收标准：

- 同一轮 `loginEpoch` 内，最多只能真实发起一次 `/employee/bootstrap`。
- 其他入口必须打印 `reuse employeeBootstrapPromise`，不能再次调用接口层。
- 新 token 写入前，任何入口都不能请求员工首页接口。
- bootstrap 未完成前，扩展数据接口只能排队，不能抢跑。

## 2026-05-20 22:45 两次员工登录复测结果

本次小程序两次员工登录已经打到当前 3000 API 服务，日志结果：

- 未再出现 `/auth/me/profile`。
- 未再出现 `/auth/me/permissions`。
- 未看到 `POST /auth` 与旧 token bootstrap 混跑，说明这两次更像是已有 employee token 恢复。
- 仍出现重复 `/employee/bootstrap`：
  - 第一次 bootstrap：约 `5326ms`，其中 auth-plugin 远端校验约 `1197ms / 1534ms`，bootstrap 内部解析约 `3790ms`。
  - 第二次 bootstrap：约 `1726ms`。
  - 随后又出现一次重复 bootstrap：约 `1ms`，明显是缓存命中后的重复调用。
- 第一次 bootstrap 后，`/home_stats` 和 `/task-center/todos/summary` 已命中毫秒级。
- 第二次 bootstrap 后，扩展数据仍有一次抢跑远端查询：
  - `/home_stats`：约 `2817ms`
  - `/task-center/todos/summary`：约 `2518ms`
  - `/customers`：约 `3435ms`
  - `/projects/status`：约 `3212ms`
- 随后的重复 bootstrap 之后，扩展数据全部回到毫秒级：
  - `/home_stats`：约 `1ms`
  - `/task-center/todos/summary`：约 `2ms`
  - `/customers`：约 `2ms`
  - `/projects/status`：约 `1ms`

结论：

- 小程序端已完成“移除旧 profile / permissions 首屏请求”的方向。
- 仍未完成“同一轮只发一次 `/employee/bootstrap`”。
- 扩展数据请求需要等待 bootstrap 完成，并尽量在 bootstrap 后延迟一个微任务或由同一个全局 store 统一调度，避免和服务端预热同时抢远端查询。

下一步小程序端对接要求：

- 所有入口继续收敛到全局 `ensureEmployeeBootstrap()`。
- `employeeBootstrapPromise` resolve 前，不允许页面自行发 `/home_stats`、`/task-center/todos/summary`、`/customers`、`/projects/status`。
- bootstrap 成功后，由全局登录/session store 统一触发扩展数据加载，页面只订阅 store 数据，不直接抢接口。
- 再次验收时，同一轮只应看到一条 `/employee/bootstrap`，扩展数据应稳定命中毫秒级或只允许第一条冷请求慢。

## 2026-05-20 22:50 两次员工登录复测结果

本次日志显示旧接口仍然没有回来，但登录状态机又出现混合流程：

- 未出现 `/auth/me/profile`。
- 未出现 `/auth/me/permissions`。
- 先出现两次 employee token 恢复 bootstrap：
  - 第一次 `/employee/bootstrap`：约 `5436ms`。
  - 第二次 `/employee/bootstrap`：约 `1449ms`。
- 第二次 bootstrap 后扩展数据抢跑：
  - `/home_stats`：约 `1706ms`
  - `/task-center/todos/summary`：约 `1332ms`
  - `/customers`：约 `3595ms`
  - `/projects/status`：约 `3609ms`
- 随后又出现一次 `POST /auth`：
  - 总耗时约 `2582ms`
  - `jscode2session`：约 `1383ms`
  - `resolve_wechat_login_state_by_openid`：约 `1194ms`
  - employee login context：`0ms`
- `/auth` 成功后又出现 `/employee/bootstrap`：约 `1761ms`。
- 之后再次出现一个重复 `/employee/bootstrap`：约 `1ms`，并且扩展数据回到毫秒级。

结论：

- `/auth` 本身已经是预期链路，慢点主要是微信接口和一次登录态 RPC。
- 当前用户体感慢不是旧 profile / permissions 导致，而是端上同一轮里先做 token 恢复，又重新触发 `/auth`，并且多个入口重复 bootstrap。
- 扩展数据仍有页面抢跑，未完全由全局 store 在 bootstrap 完成后统一调度。

小程序端必须修正：

- 如果已经进入 `restoring_employee` 并发起 `/employee/bootstrap`，本轮不允许再自动触发 `wx.login()` / `POST /auth`。
- 只有 bootstrap 返回 `401/403`、用户主动点击重新登录、或明确退出登录后，才允许进入 `authenticating`。
- 一旦进入 `authenticating`，必须先废弃所有旧 token 触发的 bootstrap 和扩展数据请求。
- 登录成功后只能复用一个全局 `employeeBootstrapPromise`，不能由登录成功回调、首页 `onShow`、tab 初始化各发一次。
- 扩展数据请求必须由全局 store 串在 bootstrap resolve 之后统一触发。

## 2026-05-20 22:55 两次员工登录复测结果

本次复测模式与 22:50 基本一致：

- 未出现 `/auth/me/profile`。
- 未出现 `/auth/me/permissions`。
- 先出现两次 employee token 恢复 bootstrap：
  - 第一次 `/employee/bootstrap`：约 `5339ms`。
  - 第二次 `/employee/bootstrap`：约 `4053ms`。
- 随后又出现一次 `POST /auth`：
  - 总耗时约 `3162ms`
  - `jscode2session`：约 `1409ms`
  - `resolve_wechat_login_state_by_openid`：约 `1749ms`
  - employee login context：`0ms`
- `/auth` 成功后又出现 `/employee/bootstrap`：约 `3171ms`。
- 紧接着又出现一次重复 `/employee/bootstrap`：约 `1ms`。

扩展数据变化：

- `/home_stats` 和 `/task-center/todos/summary` 大多已经稳定命中毫秒级。
- `/customers` 和 `/projects/status` 仍会出现 `1.1s - 1.7s` 的冷请求：
  - `/customers`：约 `1214ms / 1190ms / 1707ms`
  - `/projects/status`：约 `1331ms / 1171ms / 1272ms`

结论：

- 小程序端已经移除了员工首页旧 profile / permissions 请求。
- 小程序端仍没有解决恢复登录和重新登录互斥：同一轮先 bootstrap，再 `/auth`，再 bootstrap。
- 小程序端仍没有解决 bootstrap 全局去重：登录成功后还有重复 bootstrap。
- API 侧 `/auth` 已经没有明显业务串行瓶颈，剩余主要是微信接口和一次远端登录态 RPC。

下一步只看小程序端状态机：

- 自动恢复 token 和主动重新登录必须由一个全局状态机仲裁。
- 如果本地有 employee token，默认只走 `restoreEmployeeSession()`；不要自动补一次 `loginByWechatCode()`。
- 如果用户点击登录按钮，应先 `logoutLocalOnly()` 清空旧 token、递增 `loginEpoch`、废弃所有旧请求，再进入 `authenticating`。
- 页面 `onShow` 不能直接调用登录或 bootstrap，只能调用全局 `ensureSessionReady()`。
- 再次验收时，任何一轮只能二选一：
  - 恢复：`GET /employee/bootstrap`
  - 重新登录：`POST /auth` -> `GET /employee/bootstrap`

## 2026-05-20 23:00 两次员工登录复测结果

本次复测仍然是同一类问题，说明小程序端状态机还没有完成收敛：

- 未出现 `/auth/me/profile`。
- 未出现 `/auth/me/permissions`。
- 先出现两次 employee token 恢复 bootstrap：
  - 第一次 `/employee/bootstrap`：约 `5144ms`。
  - 第二次 `/employee/bootstrap`：约 `6433ms`。
- 第二次恢复后，又出现第三次 `/employee/bootstrap`：约 `1293ms`。
- 随后又触发一次 `POST /auth`：
  - 总耗时约 `2802ms`
  - `jscode2session`：约 `1601ms`
  - `resolve_wechat_login_state_by_openid`：约 `1198ms`
  - employee login context：`0ms`
- `/auth` 成功后又出现 `/employee/bootstrap`：约 `2649ms`。
- 最后又出现一次重复 `/employee/bootstrap`：约 `1ms`。

扩展数据：

- `/home_stats` 和 `/task-center/todos/summary` 继续稳定在 `0ms - 1ms`。
- `/customers` 仍有冷请求：约 `3018ms / 1619ms / 1153ms / 2184ms`。
- `/projects/status` 仍有冷请求：约 `1273ms / 2250ms / 1522ms / 1227ms`。
- 重复 bootstrap 后，`/customers` 和 `/projects/status` 可命中 `1ms`。

结论：

- 旧接口已经清理到位。
- API 登录主链路已稳定，`/auth` 主要耗时来自微信接口和一次登录态 RPC。
- 当前体感慢的首要原因仍是小程序端重复触发：
  - 多次恢复 bootstrap。
  - 恢复后又自动发 `/auth`。
  - `/auth` 后再发多次 bootstrap。
- `/customers` 和 `/projects/status` 的冷请求可以后续继续优化，但它们应当在 bootstrap 后作为延迟数据加载，不应阻塞员工首页进入。

小程序端下一步必须按这个硬规则验收：

- 如果本地存在 employee token，进入 `restoring_employee` 后本轮只能等 `/employee/bootstrap` 成败。
- `restoring_employee` 成功后不得自动触发 `POST /auth`。
- 用户主动重新登录时，必须先清空本地 employee token，再进入 `authenticating`，不能先 restore 再 login。
- 所有页面入口只允许调用 `ensureSessionReady()`，不能直接调用 `employeeBootstrap()` 或 `auth()`。

## 2026-05-21 08:29 两次员工登录复测结果

本次复测仍然延续同一个问题：小程序端还在同一轮里混用恢复登录和重新登录。

日志结果：

- 未出现 `/auth/me/profile`。
- 未出现 `/auth/me/permissions`。
- 先出现 employee token 恢复 bootstrap：
  - `/employee/bootstrap`：约 `6376ms`。
  - 随后又一次重复 `/employee/bootstrap`：约 `1ms`。
  - 再出现一次 `/employee/bootstrap`：约 `1006ms`。
- 随后又触发 `POST /auth`：
  - 总耗时约 `3438ms`
  - `jscode2session`：约 `1821ms`
  - `resolve_wechat_login_state_by_openid`：约 `1610ms`
  - employee login context：`0ms`
- `/auth` 成功后又出现 `/employee/bootstrap`：约 `1719ms`。
- 最后又出现一次重复 `/employee/bootstrap`：约 `2250ms`。

扩展数据：

- `/home_stats` 和 `/task-center/todos/summary` 继续稳定在 `0ms - 1ms`。
- `/customers` 冷请求约 `1063ms - 1718ms`，缓存命中约 `2ms`。
- `/projects/status` 冷请求约 `1148ms - 1660ms`，缓存命中约 `1ms`。

结论：

- API 旧接口清理和员工首页轻量 bootstrap 方向已经生效。
- 端上互斥状态机仍未收敛：同一轮出现 `bootstrap -> bootstrap -> auth -> bootstrap -> bootstrap`。
- 当前用户体感慢的主要原因仍是重复请求叠加，而不是 `/auth` 内部员工身份解析。

小程序端本轮必须修正：

- `ensureSessionReady()` 内部必须先判断是否已有 `authPromise` 或 `employeeBootstrapPromise`，有则直接复用。
- `restoreEmployeeSession()` 成功后，不能再由 landing 页、首页 `onShow`、tab 初始化或登录按钮兜底逻辑触发 `loginByWechatCode()`。
- `loginByWechatCode()` 开始前必须确认这是用户主动重新登录，或旧 token 已经被 bootstrap 判定为 `401/403`。
- 所有页面禁止直接调用 `/employee/bootstrap`，只能通过全局 session store。

## 2026-05-21 08:47 两次员工登录复测结果

本次复测没有再看到新的 `POST /auth`，说明这两次更像是只做了 employee token 恢复，不是退出后重新登录混跑。

日志结果：

- 未出现 `/auth/me/profile`。
- 未出现 `/auth/me/permissions`。
- 未出现新的 `POST /auth`。
- 仍出现多次 `/employee/bootstrap`：
  - 第一次 `/employee/bootstrap`：约 `4351ms`。
  - 第二次 `/employee/bootstrap`：约 `5296ms`。
  - 随后重复 bootstrap 命中缓存：约 `1ms`。
  - 再次出现 `/employee/bootstrap`：约 `1452ms`。

扩展数据：

- `/home_stats` 基本稳定 `0ms - 1ms`。
- `/task-center/todos/summary` 大多数为毫秒级，但有一次约 `1517ms`。
- `/customers` 冷请求约 `1013ms - 1244ms`，缓存命中约 `1ms`。
- `/projects/status` 冷请求约 `1131ms - 1632ms`，缓存命中约 `0ms`。

结论：

- “恢复后又触发 `/auth`”这次没有复现。
- 当前主要问题变成单纯的 bootstrap 全局去重没完成：多个入口仍在直接或间接发 `/employee/bootstrap`。
- 扩展数据整体已较稳定，但页面仍可能在 bootstrap 预热未结束时抢跑一次慢请求。

小程序端下一步只修 bootstrap 去重：

- `employeeBootstrapPromise` 必须是进程级 / 全局 store 单例，不能跟页面生命周期绑定。
- 任何页面入口调用 `ensureEmployeeBootstrap()` 时，如果已有 promise，必须直接返回同一个 promise。
- bootstrap 成功后短时间内应保留结果缓存；页面二次 `onShow` 应读取 store 中的 `employeeBootstrap`，不要重新发请求。
- 刷新按钮或下拉刷新如果要强制刷新，必须显式传 `force: true`，普通页面进入不能 force。

## 2026-05-21 09:06 API bootstrap 短缓存优化

本轮 API 已增加员工 bootstrap 短缓存和阶段日志：

- `/employee/bootstrap` 结果增加 15 秒短 TTL 内存缓存。
- 缓存 key 包含：
  - `authUserId`
  - `tenantId`
  - `employeeId`
  - `home_mode`
  - `tasks_mode`
- 同一个 cache key 的并发请求复用同一个 in-flight Promise。
- 如果 JWT 中已有 `sub / tenant_id / employee_id`，API 会先用 token 信息尝试命中 bootstrap cache / in-flight，再进入完整 auth context 解析。
- 缓存命中时会打印：
  - `[employee-bootstrap] bootstrap cache hit`
- token 级缓存命中时会打印：
  - `[employee-bootstrap] bootstrap token cache hit`
- 并发复用时会打印：
  - `[employee-bootstrap] bootstrap in-flight reused`
- token 级并发复用时会打印：
  - `[employee-bootstrap] bootstrap token in-flight reused`
- 新增阶段日志：
  - `[employee-bootstrap] auth context resolved`
  - `[employee-bootstrap] synchronous data resolved`
  - `[employee-bootstrap] response built`

预期效果：

- 小程序端还没完全去重时，短时间内重复 `/employee/bootstrap` 不再反复等待 auth context、profile 和 bootstrap 响应构建。
- 仍无法跳过 auth-plugin 的 token / 微信绑定校验；如果日志里慢点在 `assert_wechat_oauth_credential` 或 `assert_wechat_business_binding`，说明慢在进入 controller 前。
- 正常复测时，第二条重复 bootstrap 应看到 `bootstrap cache hit` 或 `bootstrap in-flight reused`。

后续复测判断：

- 如果第一条 bootstrap 慢，但第二条出现 `bootstrap cache hit` 且总耗时接近毫秒级，API 短缓存生效。
- 如果第二条仍慢且没有 cache hit，说明请求间隔超过 15 秒、query mode 不一致，或端上触发了不同 token / 不同员工上下文。
- 如果 cache hit 已生效但用户仍体感慢，下一步继续看 `/customers` 和 `/projects/status` 是否还在首屏阻塞。

## 2026-05-21 09:18 API bootstrap profile 短等待优化

上一轮复测显示，token cache 命中后重复 bootstrap 已经降到 `1ms`，但冷 bootstrap 里 `[employee-bootstrap] synchronous data resolved` 仍可能等待用户 profile 约 `1s+`。

本轮 API 已调整：

- `/employee/bootstrap` 读取用户 profile 时优先使用 `customerSelfServiceService` 的 profile 短缓存。
- 如果没有 profile 缓存，API 最多同步等待 `250ms`。
- 超过 `250ms` 时，bootstrap 先返回：
  - `nickname: null`
  - `avatar: null`
  - `profile_completed: false`
- 原 profile 查询继续在后台完成，并写入服务端短缓存。
- 下次 bootstrap 或个人资料页读取时可命中 profile 缓存。
- 新增同步数据日志字段：
  - `profileSource: "cache" | "remote" | "timeout" | "error"`

预期效果：

- 冷 bootstrap 不再因为 profile 远端读阻塞 `1s+`。
- 员工首页首屏可先用 `context` 渲染；昵称和头像不是进入首页的阻塞条件。
- 如果小程序端需要更完整个人资料，应在个人资料页或非首屏时再刷新 profile。

复测重点：

- `[employee-bootstrap] synchronous data resolved` 应从约 `1s+` 降到 `0ms - 250ms`。
- 如果出现 `profileSource: "timeout"`，说明 profile 被后台补齐，首屏不等它。
- 首条 bootstrap 剩余慢点应主要来自 auth-plugin 校验和 auth context。

## 2026-05-21 09:25 API bootstrap auth context 并行预热

上一轮复测显示，profile 同步等待已经压到约 `250ms`，首条 bootstrap 剩余慢点集中在：

- auth-plugin 微信 OAuth / business binding 校验。
- controller 内 `auth context resolved`。

本轮 API 已调整：

- auth 插件只针对 `GET /employee/bootstrap` 提前启动 `authorizationService.prewarmEmployeeAuthContext()`。
- 预热使用 JWT 中的 `sub` 和 `employee_id`。
- 预热与 `assert_wechat_oauth_credential`、`assert_wechat_business_binding` 并行执行。
- controller 随后调用 `getRequiredTenantContext()` 时，会复用 authorizationService 的 in-flight / cache。
- 预热完成会打印：
  - `[auth-plugin] background stage completed`
  - `stage: "prewarm_employee_auth_context"`

预期效果：

- 冷 bootstrap 的 auth context 等待可以和微信绑定校验重叠。
- 如果微信校验耗时约 `1.5s`、auth context 约 `2s`，总等待应从串行约 `3.5s` 降到接近两者最大值。
- 如果日志里 `auth context resolved` 接近 `0ms`，说明 controller 已复用预热结果。

## 2026-05-21 09:40 API 员工首页延迟列表 home 模式

小程序端已确认 `/customers`、`/projects/status` 不再阻塞员工首页首屏，但冷请求仍可能在延迟加载阶段达到 `1s+`。本轮 API 为员工首页卡片场景增加轻量模式：

```text
GET /customers?mode=home&page=1&pageSize=20
GET /projects/status?mode=home&ownership=self&page=1&pageSize=20
```

API 行为：

- `mode=home` 只用于员工首页延迟卡片列表，不用于完整客户列表页或项目列表页。
- `/customers?mode=home` 仍保留租户、员工权限、状态、来源、关键词、今日工作等过滤，但跳过同步 `count`、客户房产摘要、来源摘要、手机号隐私上下文和跟进摘要。
- `/projects/status?mode=home` 仍保留租户、员工权限、状态、归属、关键词、今日工作等过滤，但跳过同步 `count` 和手机号隐私上下文。
- home 模式分页使用 `pageSize + 1` lookahead 判断是否还有下一页，`pagination.total` 是轻量估算值，只能用于首页判断是否还有更多，不应展示为精确总数。
- `/employee/bootstrap` 和 `/auth` 后台预热已改为预热 home 模式缓存；小程序端延迟请求必须带同样的 `mode=home` 才能命中预热/in-flight/cache。
- home 模式列表服务端短缓存已延长到 60 秒，缓存 key 会标准化角色和权限数组，减少 bootstrap 预热与页面延迟请求之间的缓存错位。

小程序端需要对接：

- 员工首页延迟加载客户列表时追加 `mode=home`。
- 员工首页延迟加载项目状态列表时追加 `mode=home`，并保留 `ownership=self`。
- 完整列表页、搜索页、筛选页不要传 `mode=home`，继续使用默认接口以获得完整字段和精确分页。
- 首页不要依赖 home 模式返回精确总数；如果需要“查看全部”，跳转完整列表页后重新拉默认接口。

## 验收标准

### API 验收

- 已绑定员工再次进入小程序，`POST /auth` 成功返回 `mode: "employee"`。
- `/auth` 不再访问旧身份映射或历史 auth user 修复链路。
- `/auth` 日志能看到每个阶段耗时。
- OAuth/membership best-effort 同步失败只记 warn/error，不影响主响应。
- 远端 `to_regclass('public.wechat_identities')` 和 `to_regprocedure('public.find_auth_user_by_openid(text)')` 均为 `null`。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。

### 小程序验收

- 登录超过 `1.5s` 有明确身份确认提示。
- 登录请求进行中，按钮不能重复点击。
- 请求失败后可重新触发 `wx.login()` 并重试。
- 员工已绑定时不进入手机号验证页。
- visitor 绑定员工时，验证码验证成功后能进入员工首页。
- customer 登录时，`/auth` 完成前不得出现 `/customer/project-acceptances`、`/customer/projects`、项目详情、日志、预约奖励或分享 summary 请求。
- customer 登录成功后，必须先进入 `customer_ready` 再拉客户首屏数据。
- 客户项目详情页的预约奖励和分享 summary 不阻塞页面主体展示，允许局部 loading 或延迟加载。

## 当前建议优先级

1. 小程序端先补 employee/customer 登录态门禁，杜绝 `/auth` 未完成时抢跑业务接口。
2. 小程序端拆分客户项目详情页首屏和活动/验收扩展数据，避免分享 summary、预约奖励、验收列表阻塞页面主体。
3. API 继续优化 customer project acceptances 和客户项目详情日志/活动扩展的首个请求耗时。
4. 完成 visitor、customer、employee 三条真实登录回归后，记录耗时日志并关闭本轮登录链路清理。
