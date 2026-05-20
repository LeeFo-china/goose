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
- `/customer/projects/:projectId/share-campaigns/summary` 增加 10 秒 per-auth-user/per-project 短缓存和 in-flight 合并，用于降低客户项目详情页重复刷新等待。
- membership 模式下，如果当前账号只有 customer membership，`/auth` 直接推导 `roles: ["customer"]`，不再额外查询角色表。
- `/customer/projects/:projectId/appointment-reward-campaign` 对“未命中活动”的 404 增加 10 秒负缓存和 in-flight 合并，避免项目详情页重复等待慢 404。
- `/auth` 客户租户选项改为 lean 查询：单租户 customer 自动登录不再加载项目数和最近项目名；只有返回 `select_tenant` 时才补充项目概览。
- `/customer/project-acceptances` 增加 10 秒 per-auth-user/per-tenant/per-customer/per-query 短缓存和 in-flight 合并；列表详情从逐条补齐改为批量补齐 items、actions、project、参与人和短信通知记录，减少客户项目详情页首次加载时的远端查询轮次。
- `/customer/projects/:projectId/share-campaigns/summary` 首次请求改为并行读取客户项目归属和分享配置，并提前并行读取最近图片日志；同一首屏内复用 customer、ownedProject、projectTenant、marketingCampaign 匹配和 recent image log 的 10 秒热点缓存/in-flight。
- `/customer/projects/:projectId/appointment-reward-campaign` 首次请求改为并行读取客户项目归属和预约奖励活动匹配；未命中活动时仍保留 10 秒负缓存，同一首屏内复用 ownedProject、projectTenant 和 marketingCampaign 匹配结果。
- `/customer/projects/:projectId` 增加 10 秒 per-customer/per-tenant/per-project 短缓存和 in-flight；`/customer/projects` 列表返回时同步预热项目详情缓存，降低列表后立刻进详情的重复项目查询。
- `/customer/projects/:projectId/logs` 增加 10 秒 per-project/per-tenant/per-page 日志列表缓存和日志评论聚合缓存，减少页面 onShow 或详情页并发刷新时的重复日志查询。
- `/auth` 客户租户选项关键读查询增加 8 秒快速超时和 1 次瞬时网络错误重试，避免 Supabase socket 短暂断开时单次登录卡到几十秒。
- `/customer/project-acceptances` 首次请求继续缩短串行链路：优先复用 customer token 中的 `customer_id/tenant_id` 做客户校验，客户校验和项目校验并行执行，并复用本次已查到的 project/customer 参与列表详情拼装。

边界：

- 该阶段只优化客户自助端重复请求和首屏串行等待，不改变员工身份判断。
- 缓存 TTL 仍保持 10 秒，避免客户资料、项目列表、项目详情、日志、验收列表和营销活动状态长时间陈旧。
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

### 避免重复触发登录

- 登录请求未完成前禁用按钮。
- 同一个 `wx.login()` code 只能使用一次，失败重试必须重新调用 `wx.login()`。
- 页面 onShow / 初始化不要重复并发调用 `/auth`。
- 退出登录后必须先清空旧 token 和用户态，再进入登录状态机。
- 新一轮 `/auth` 未完成、未写入新 token 前，不要并发请求员工首页接口：
  - `/auth/me/permissions`
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
3. `employee_ready`：`/auth` 返回 `mode: "employee"`，并且新 token 已写入本地存储，可以发员工首页接口。
4. `visitor_ready`：`/auth` 返回 visitor，只能发 visitor 允许接口；点击员工登录再进入 `/auth/verify-role`。
5. `auth_failed`：清理本次 code 和临时状态，重新触发必须重新调用 `wx.login()`。

首页数据请求只允许从 `employee_ready` 状态触发。页面 `onShow` 如果发现状态是 `authenticating`，只订阅登录完成事件，不主动请求员工接口。

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
3. 先请求 `/auth/me/customer-context` 和 `/customer/projects`。
4. 只有用户进入具体项目详情页时，再请求项目详情、日志、验收、预约奖励和分享 summary。
5. 预约奖励和分享活动不是进入客户首页的阻塞条件，建议延后加载；接口未返回前展示局部骨架或隐藏活动卡片。

端上去重要求：

- 同一轮登录只允许一个 `/auth` in-flight。
- 同一 projectId 的项目详情、日志、验收、预约奖励、分享 summary 在 in-flight 时复用同一个 Promise，不重复发请求。
- 页面 `onShow` 如果发现状态是 `authenticating`，只能订阅登录完成事件，不能主动拉客户接口。
- 退出登录时必须同步清空 token、角色、`customer_id`、`tenant_id`、项目缓存和所有 in-flight 请求引用。
- 新 token 写入前，不允许旧页面的 mounted/onShow 逻辑继续用旧 token 拉 `/customer/*`。

### 缓存短期登录态

- 本地已有有效 employee token 时，优先进入页面。
- 后台调用 `/auth/me/profile` 或权限接口刷新身份。
- token 失效再走完整登录。

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
3. API 继续优化 customer tenant options、project acceptances、share summary 的首个请求耗时。
4. 完成 visitor、customer、employee 三条真实登录回归后，记录耗时日志并关闭本轮登录链路清理。
