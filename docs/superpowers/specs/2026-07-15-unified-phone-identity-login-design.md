# 小程序统一手机号身份登录设计

**日期：** 2026-07-15

**状态：** 推荐方案已确认，待书面规格审阅

**范围：** gooes 后端接口、认证服务、Supabase migration、平台线索归因，以及 orange 小程序联调契约

## 1. 背景与目标

orange 访客首页当前要求用户先选择客户、员工或城市合伙人，再分别调用客户/员工登录接口或城市合伙人登录接口。该设计将三个入口收敛为一次手机号验证码验证，由后端发现手机号关联的全部具体业务身份。

统一登录遵循以下状态机：

- 零个可用具体身份：返回带已验证手机号的 `platform_visitor` 会话，不创建 `customers`，也不自动创建 `platform_leads`。
- 一个具体身份：后端直接登录或绑定该身份并返回正式业务登录态。
- 两个及以上具体身份：返回短期一次性选择凭证和候选列表，用户选择后换取正式业务登录态。
- 只命中停用或业务不可用身份：返回稳定的账号不可用错误，不降级成普通访客。
- 已绑定其他微信的身份：保留既有客户/员工或城市合伙人换绑流程，不自动覆盖绑定。

目标不是重做现有认证体系，而是在现有客户、员工、城市合伙人绑定和 token 构建能力之上增加统一的身份发现与安全选择层。

## 2. 已确认决策

- 新增三个接口：`send-code`、`verify`、`select`。
- 使用数据库持久化的不透明 `selection_token`，不采用纯 JWT 选择凭证。
- TypeScript service 负责编排业务，数据库 RPC 只承担验证码核销和选择状态原子变更。
- 旧版 Orange 使用的登录、选择租户、身份切换和换绑接口全部保留。
- `GET /auth/identities` 继续只表示当前微信已经绑定的身份，不能用于手机号身份发现。
- 统一登录不接受前端传入 `target_role`、`auth_user_id`、openid 或业务主键决定身份范围。
- 零身份手机号验证阶段禁止创建客户或空平台线索。
- 保留当前数据库约束：一个手机号最多关联一个非 disabled 城市合伙人成员。未来若允许同一手机号属于多个城市合伙人，应作为独立业务变更评审。
- 不引入 Redis、队列、新认证框架或新运行时依赖。

## 3. 非目标

- 不删除或改变旧登录接口的请求响应。
- 不合并租户侧 `wechat_rebind_requests` 与平台侧 `platform_partner_member_rebind_requests`。
- 不改变正式业务 token 的租户、员工、客户或合伙人数据隔离规则。
- 不允许统一登录一次绑定手机号下的所有候选。
- 不修改 Orange 仓库代码；本设计只提供后端契约与小程序团队改造清单。
- 不扩展城市合伙人手机号的全局唯一业务边界。
- 不通过登录请求自动分配默认租户、默认客户或默认城市合伙人。

## 4. 当前实现与差距

### 4.1 客户与员工

`POST /auth/verify-role` 依赖前端传 `target_role`。客户零命中时已经能够返回 `platform_visitor`，但员工手机号命中多个员工档案时会直接报错，无法让用户选择具体租户身份。

客户 `share_token` 路径当前调用 `bind_customer_from_tenant_share`。该 RPC 可以创建客户，因此不能用于统一登录的无副作用身份发现。

员工旧登录响应仍可能返回 `mode=employee`。统一接口必须统一输出 `mode/authMode=tenant_employee`，但旧接口保持兼容。

### 4.2 城市合伙人

城市合伙人当前通过独立的 `POST /partner/auth/send-code` 和 `POST /partner/auth/bind-phone` 完成登录。现有 repository 只查询一个可绑定成员，绑定 RPC 同时核销 `bind_platform_partner` 验证码。

统一流程需要复用成员可用性、绑定冲突和 token 构建规则，但改用统一的 `login_identity` 验证码场景，不能再次要求 Orange 调用微信登录换取 code。

### 4.3 Visitor 与平台线索

当前 visitor token 可以携带 `verified_phone`，但不携带 `sub`。`POST /platform/leads` service 同时要求 `authUserId` 和 `verifiedPhone`，因此零身份验证后的标准线索链路尚未闭环。

认证白名单当前也没有允许 visitor session 提交 `POST /platform/leads`。本需求需要同时修复 token 内容和路由授权，service 继续校验请求手机号等于 token 中的 `verified_phone`。

### 4.4 验证码并发

客户/员工旧流程先查询 pending 验证码，完成绑定后再更新为 verified。统一登录不能沿用该顺序，否则并发请求可能在验证码核销前重复进入身份处理。

统一流程必须通过数据库事务原子完成：锁定并核销验证码、创建已验证登录会话。验证码核销成功后，后续多身份选择只依赖选择凭证。

## 5. 总体架构

```text
Orange
  -> POST /auth/phone-login/send-code
     -> Controller: schema + request context
     -> PhoneIdentityLoginService.sendCode
     -> SmsVerificationCodeService(login_identity)

  -> POST /auth/phone-login/verify
     -> Controller: schema + trusted request.user
     -> PhoneIdentityLoginService.verify
        -> resolve current WeChat auth user
        -> atomically consume SMS + create verified session
        -> resolve and validate share context without mutation
        -> load customer / employee / partner candidates in parallel
        -> normalize, filter, de-duplicate and sort
        -> 0: issue verified visitor auth
        -> 1: revalidate and authenticate selected identity
        -> 2+: persist opaque candidates and return selection_token

  -> POST /auth/phone-login/select
     -> Controller: schema + trusted request.user
     -> PhoneIdentityLoginService.select
        -> load session by token hash
        -> assert same WeChat, expiry and candidate membership
        -> atomically reserve/confirm selected candidate
        -> re-query latest business state
        -> bind only selected identity
        -> issue formal auth token
        -> finalize consumed state
```

Controller 只处理 HTTP、schema、service 调用和 `ResponseHandler.success`。Service 负责状态机和领域编排。Repository 直接访问 Supabase、表和 RPC。

## 6. API 契约

### 6.1 发送验证码

```http
POST /auth/phone-login/send-code
Authorization: Bearer <valid mini-program auth or visitor token>
Content-Type: application/json
```

请求：

```json
{
  "phone": "13800138000"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "success": true,
    "cooldown_seconds": 60
  },
  "message": "验证码已发送"
}
```

该接口不查询业务身份，不暴露手机号是否存在。限流继续使用验证码服务，至少覆盖手机号、IP 和可用的设备标识。日志只记录场景、请求 ID、限流维度和脱敏手机号。

### 6.2 验证并发现身份

```http
POST /auth/phone-login/verify
Authorization: Bearer <same mini-program auth or visitor token>
Content-Type: application/json
```

请求：

```json
{
  "phone": "13800138000",
  "code": "123456",
  "share_token": "optional-share-token"
}
```

零身份响应：

```json
{
  "success": true,
  "data": {
    "status": "visitor_verified",
    "next_action": "submit_platform_lead",
    "auth": {
      "token": "visitor-session-jwt",
      "user_id": null,
      "visitor_id": "wechat_visitor_xxx",
      "roles": ["visitor"],
      "mode": "platform_visitor",
      "authMode": "platform_visitor",
      "phone": "13800138000",
      "verified_phone": "13800138000",
      "has_customer_profile": false,
      "tenant": null,
      "customer": null,
      "employee": null,
      "partner": null
    }
  },
  "message": "手机号验证成功，可提交装修需求"
}
```

visitor 响应继续保持 `user_id=null`，避免把内部 auth user 当成访客业务身份暴露给前端。服务端仍根据当前微信解析或创建 auth user，并在 visitor JWT 的 `sub` 中携带该受信任 ID。visitor JWT 同时包含 `openid`、`visitor_id`、`verified_phone` 和受信任的分享归因引用。

单身份响应：

```json
{
  "success": true,
  "data": {
    "status": "authenticated",
    "auth": {
      "token": "business-auth-jwt",
      "user_id": "auth-user-id",
      "roles": ["employee"],
      "mode": "tenant_employee",
      "authMode": "tenant_employee",
      "tenant": {
        "id": "tenant-id",
        "name": "某某装饰"
      },
      "employee": {
        "id": "employee-id",
        "name": "张三"
      }
    }
  },
  "message": "登录成功"
}
```

多身份响应：

```json
{
  "success": true,
  "data": {
    "status": "selection_required",
    "selection_token": "opaque-random-token",
    "expires_in": 300,
    "phone_masked": "138****8000",
    "candidates": [
      {
        "candidate_id": "opaque-candidate-id",
        "target_mode": "customer",
        "role_label": "客户",
        "title": "某某装饰",
        "subtitle": "张三",
        "binding_state": "bindable"
      }
    ]
  },
  "message": "请选择登录身份"
}
```

### 6.3 选择身份

```http
POST /auth/phone-login/select
Authorization: Bearer <same mini-program auth or visitor token>
Content-Type: application/json
```

请求：

```json
{
  "selection_token": "opaque-random-token",
  "candidate_id": "opaque-candidate-id"
}
```

成功响应统一为 `status=authenticated` 和对应正式 `auth`。请求不再携带 phone、角色、租户或业务主键。

## 7. 数据模型与 migration

所有数据库变更通过 `supabase/migrations/` 提交。推荐新增以下表。

### 7.1 `phone_identity_login_sessions`

- `id uuid primary key`
- `auth_user_id uuid not null`
- `openid_hash text not null`
- `verified_phone text not null`
- `selection_token_hash text unique null`
- `status text not null`：`verified`、`selection_required`、`binding`、`consumed`、`expired`
- `selected_candidate_id uuid null`
- `share_context jsonb not null default '{}'`
- `expires_at timestamptz not null`
- `consumed_at timestamptz null`
- `created_at`、`updated_at`

会话状态约束：

- 零身份和单身份流程也创建已验证 session，用于验证码核销审计和服务端归因，但不返回 `selection_token`。
- 只有多身份 session 保存 `selection_token_hash` 并进入 `selection_required`。
- `selection_token` 原文只返回一次，数据库只保存 SHA-256 hash。
- `expires_at` 默认创建后 5 分钟。
- session 不存验证码、原始 token 或明文 openid。

### 7.2 `phone_identity_login_candidates`

- `id uuid primary key`，直接作为不透明 `candidate_id`
- `session_id uuid not null`
- `target_mode text not null`：`customer`、`tenant_employee`、`platform_partner`
- `tenant_id uuid null`
- `customer_id uuid null`
- `employee_id uuid null`
- `partner_id uuid null`
- `partner_member_id uuid null`
- `binding_state text not null`：`current`、`bindable`、`rebind_required`
- `display_snapshot jsonb not null`
- `created_at timestamptz not null`

数据库 check constraint 保证每个 `target_mode` 只填写对应业务主键。候选表保存的是已验证时快照，选择时仍重新查询真实业务记录。

### 7.3 索引与函数

- session token hash 唯一索引。
- `auth_user_id + created_at` 审计索引。
- `status + expires_at` 清理和过期判断索引。
- candidate `session_id + id` 唯一查询索引。
- 客户 `phone` 查询索引，包含候选所需租户关联键。
- 员工 `phone` 查询索引，包含状态和租户关联键。
- 保留已有城市合伙人成员手机号唯一索引。
- 更新 `sms_verification_codes_scene_check`，加入 `login_identity`。

新增原子 RPC：

- `claim_phone_identity_login_verification(...)`：锁定最新 pending 验证码、区分 invalid/expired、核销验证码并创建 verified session。
- `begin_phone_identity_selection(...)`：校验 session 状态并写入 token hash 与候选快照。
- `reserve_phone_identity_selection(...)`：对 session 加行锁；同候选重试返回幂等状态，其他候选返回 consumed 冲突。
- `finalize_phone_identity_selection(...)`：绑定成功后将 session 置为 consumed。
- `release_phone_identity_selection(...)`：仅在可安全重试的绑定失败场景把 binding 恢复为 selection_required。

所有函数设置固定 `search_path`，撤销 `public/anon/authenticated` 执行权限，只授予 `service_role`。

## 8. selection_token 安全与幂等

### 8.1 Token 生成

- 使用 `node:crypto.randomBytes(32)` 生成 256-bit 随机值并编码为 base64url。
- 数据库保存 `sha256(selection_token)`。
- 有效期固定为 300 秒，首版不提供续期。
- token 绑定 `auth_user_id`、`openid_hash`、`verified_phone` 和 session 候选集合。

### 8.2 选择状态

```text
selection_required
  -> binding(candidate A)
     -> consumed(candidate A)
     -> selection_required 仅限明确可重试失败
```

- token 不存在、hash 不匹配或 candidate 不属于 session：返回 `IDENTITY_OPTION_UNAVAILABLE`，不透露候选是否真实存在。
- 已过期：返回 `IDENTITY_SELECTION_EXPIRED`。
- `consumed(candidate A)` 再选 A：重新加载 A 的当前正式身份并签发新的等价登录 token。
- `consumed(candidate A)` 再选 B：返回 `IDENTITY_SELECTION_CONSUMED`。
- `binding(candidate A)` 的并发请求返回 409，不并行执行第二次绑定。
- 只有绑定和正式 auth 构建成功后才 finalize consumed。
- 在业务写入前发现状态变化、账号不可用或换绑冲突时，释放 binding 锁并恢复为 `selection_required`；客户端可进入换绑流程，也可在凭证有效期内选择其他候选。
- 如果数据库写入结果不确定，service 重新查询目标绑定：已经绑定当前 auth user 时完成正式 auth 构建并 finalize；确认未绑定时恢复为 `selection_required`；仍无法确认时保持 `binding` 并返回 `IDENTITY_SELECTION_IN_PROGRESS`，禁止盲目执行第二次写入。

## 9. 候选发现与排序

三类 repository 查询并行执行，均只选择候选展示、状态判断和后续绑定需要的字段。每类查询 `.limit(101)`，聚合后最多允许 100 个候选；超过上限返回 `IDENTITY_CANDIDATE_LIMIT_EXCEEDED`，禁止无上限返回身份列表。

### 9.1 客户候选

- 按 `tenant_id + customer_id` 去重。
- 租户必须为 active；客户当前没有独立登录停用字段。
- `user_id` 或活跃 membership 属于当前 auth user 时为 `current`。
- 没有其他微信绑定时为 `bindable`。
- 已绑定其他微信且未通过既有换绑授权时为 `rebind_required`，`rebind_kind=tenant_wechat`。
- 同一手机号在多个租户有客户档案时，每条租户客户档案是一个候选。

### 9.2 员工候选

- 按 `tenant_id + employee_id` 去重。
- 员工状态必须通过 `isEmployeeOperableStatus`，租户必须 active。
- 绑定状态沿用员工现有 membership 与微信绑定校验。
- 同一手机号在多个租户有员工档案时，每条有效员工档案是一个候选。
- 正式响应统一使用 `tenant_employee`，岗位和权限继续由现有员工认证上下文计算。

### 9.3 城市合伙人候选

- 按 `partner_member_id` 去重。
- 成员状态必须为 `active` 或可绑定的 `pending_bind`，partner 必须 active，level 如存在也必须可用。
- 当前 auth user 已绑定为 `current`，未绑定为 `bindable`，绑定其他 auth user 为 `rebind_required`。
- `rebind_kind=platform_partner`，继续使用平台侧换绑申请。
- 当前数据库约束保证最多一个非 disabled 合伙人成员命中该手机号。

### 9.4 不可用身份判断

发现过程保留“原始命中数”和“可用候选数”：

- 原始命中为 0：返回 verified visitor。
- 原始命中大于 0 且没有可用或可换绑候选：返回 `IDENTITY_ACCOUNT_UNAVAILABLE`。
- 同时存在可用和停用记录：只返回可用候选，停用记录不参与数量计算。

当最终只有一个候选时：

- `current` 或 `bindable`：直接执行正式登录。
- `rebind_required`：不签发正式登录态，返回该身份对应的稳定换绑错误和受限上下文。

### 9.5 排序

候选顺序稳定：

1. 经验证的 share context 明确命中的客户候选。
2. `current`。
3. `bindable`。
4. `rebind_required`。
5. `target_mode` 固定顺序：customer、tenant_employee、platform_partner。
6. 租户或合伙人展示名称、业务 ID 作为稳定尾排序。

## 10. 正式绑定与换绑

选择时必须按业务 ID 重新查询，不使用 `display_snapshot` 做权限判断。

### 10.1 客户

复用现有客户绑定、membership 同步、缓存失效和 customer auth 构建。统一流程显式传入选中的客户，不调用会自动选择或创建客户的旧入口。

绑定其他微信时返回 `WECHAT_ALREADY_BOUND` 和受限换绑上下文，继续调用 `POST /auth/wechat-rebind-requests`。

### 10.2 员工

把旧 `bindEmployeeRole(phone)` 中“查询唯一员工”和“绑定指定员工”拆开。统一服务调用指定员工绑定能力，旧接口继续使用唯一员工包装器。

绑定其他微信时返回 `WECHAT_ALREADY_BOUND`，继续走租户侧审核。不得清理同一微信下其他角色或其他租户身份。

### 10.3 城市合伙人

复用 `assertUsablePlatformPartnerMember`、原子成员绑定和 `buildAuthResponse`。统一流程已经拥有受信任的 auth user 和 openid，不再调用 `Taro.login()` 对应的 code2session 流程。

绑定其他微信时返回 `PARTNER_MEMBER_ALREADY_BOUND`，继续使用 `POST /partner/auth/rebind-code` 和 `POST /partner/auth/rebind-requests`。

## 11. Visitor、平台线索与 share 归因

### 11.1 Visitor token

零身份响应的 visitor token 包含：

- `token_type=visitor_session`
- `sub=auth_user_id`
- `openid`
- `visitor_id`
- `roles=[visitor]`
- `verified_phone`
- `share_link_id` 或等价的受信任服务端归因引用

初始静默登录生成的未验证 visitor token不包含 `verified_phone`。即使 auth 白名单允许其到达 `POST /platform/leads`，service 仍因缺少手机号验证而返回 401。

### 11.2 无副作用 share 解析

新增只读 share context 解析能力：

- 校验 token 存在、状态、过期时间、tenant 状态和分享员工归属。
- 返回服务端可信的 `share_link_id`、`tenant_id`、`share_employee_id`、source 和可选目标。
- 不创建客户、不绑定 auth user、不增加使用次数。
- 如果手机号已有该租户客户，标记对应候选为 share 优先。
- share token 不能绕过手机号匹配、租户状态或换绑校验。

### 11.3 平台线索

`POST /platform/leads` 增加可选 `share_token` 仅用于兼容上下文恢复；优先使用 visitor token 中已经验证的 `share_link_id`。若前端再次传 token，后端必须重新验证并确认与 token 归因一致。

service 构造受信任 `source_context`：

```json
{
  "share_link_id": "share-link-id",
  "share_employee_id": "employee-id",
  "attributed_tenant_id": "tenant-id",
  "share_source": "tenant_share"
}
```

前端不能直接提交这些字段。平台线索仍保持未分配；只有现有线索分配 RPC 才创建或关联目标租户客户。
分享归因只写入 `source_context`，不能把分享租户写入 `platform_leads.tenant_id`；现有 `visitor_project_detail` 咨询场景按原有受校验的项目上下文处理。

## 12. 鉴权边界

三个新接口都要求有效 Bearer token，不加入 public route：

- visitor session 可调用 send-code、verify、select。
- 普通小程序 auth token可调用，用于发现并绑定手机号关联的其他身份。
- platform partner token 可调用三个统一登录接口和既有身份切换接口。
- admin web token 和 H5 marketing token 不允许调用。

`POST /platform/leads` 加入 visitor session route，但 service 继续强制 `sub` 与 `verified_phone`。visitor token 仍不能访问客户项目、员工、平台管理或合伙人业务数据。

选择接口额外比较当前 token 的 `sub` 和 openid hash；只有 auth user 相同但微信 openid 不同仍视为不同调用方并拒绝。

## 13. 错误码

错误统一通过 `error-factory.ts` 构造，不直接抛出原生 Error。

| HTTP | code | 说明 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | schema 校验失败 |
| 400 | `SMS_CODE_REQUIRED` | 未提供验证码 |
| 400 | `SMS_CODE_INVALID` | 验证码不匹配或已核销 |
| 400 | `SMS_CODE_EXPIRED` | 验证码存在但已过期 |
| 401 | `AUTH_SESSION_REQUIRED` | 缺少有效小程序微信会话 |
| 403 | `IDENTITY_ACCOUNT_UNAVAILABLE` | 只命中不可用身份 |
| 409 | `WECHAT_ALREADY_BOUND` | 客户或员工绑定其他微信 |
| 409 | `PARTNER_MEMBER_ALREADY_BOUND` | 合伙人成员绑定其他微信 |
| 409 | `IDENTITY_OPTION_UNAVAILABLE` | 候选不存在或最新状态不可用 |
| 409 | `IDENTITY_SELECTION_IN_PROGRESS` | 同一凭证正在绑定 |
| 409 | `IDENTITY_SELECTION_CONSUMED` | 凭证已用于其他候选 |
| 410 | `IDENTITY_SELECTION_EXPIRED` | 选择凭证已过期 |
| 422 | `IDENTITY_CANDIDATE_LIMIT_EXCEEDED` | 手机号候选超过安全上限 |
| 429 | `SMS_CODE_RATE_LIMITED` | 复用现有短信限流错误码 |

数据库和第三方错误继续映射为 `DB_ERROR` 或既有稳定业务错误，不能将未匹配、停用和换绑冲突返回为 500。

## 14. 性能与数据边界

- 三类候选查询并行执行，避免串行增加登录延迟。
- 查询只选择 ID、显示字段、绑定字段、业务状态和租户/合伙人状态。
- 每类 `.limit(101)`，总候选最多 100。
- 不对候选逐条查询租户、openid 或 membership；通过关系 select、批量查询或现有登录 membership RPC 获取。
- 选择阶段只查询被选候选，不重新加载整个候选列表。
- 新增客户、员工 phone-first 索引前后，用代表性单身份、多租户和停用身份数据执行 `EXPLAIN ANALYZE`。
- session 与 candidate 查询使用 token hash、session ID 和 candidate ID 索引。
- 过期 session 默认保留 24 小时用于安全审计，之后由受限清理函数批量删除；不引入独立队列或 Redis。

## 15. 日志与审计

记录以下事件：

- `phone_identity_login_sms_sent`
- `phone_identity_login_verified`
- `phone_identity_login_selection_required`
- `phone_identity_login_authenticated`
- `phone_identity_login_selection_rejected`
- `phone_identity_login_rebind_required`

日志允许记录 request ID、session ID、target mode、候选数量、binding state、耗时和错误码。禁止记录验证码、完整手机号、原始 selection token、JWT、openid 或候选业务敏感数据。

安全审计至少能回答：哪个 auth user 在何时验证了哪个脱敏手机号、得到多少候选、最终选择哪个候选类型，以及是否发生跨微信或篡改拒绝。

## 16. 测试策略

### 16.1 单元测试

- schema：手机号、验证码、share token、selection token 和 candidate ID。
- candidate normalization：去重、状态过滤、binding state、稳定排序和 100 条上限。
- state machine：零身份、单身份、多身份、只命中停用身份。
- selection：篡改、过期、跨微信、同候选幂等、不同候选 consumed、并发 in-progress。
- share context：有效、过期、停用租户、手机号不匹配和零身份不创建客户。
- visitor lead：缺少 sub、缺少 verified_phone、手机号不一致、可信归因写入。

### 16.2 Repository 与 migration 测试

- `login_identity` scene constraint。
- 验证码并发核销只能成功一次。
- selection session 行锁和状态转换。
- candidate check constraint 和 token hash 唯一约束。
- RPC 权限只允许 service_role。
- 手机号索引执行计划。

### 16.3 路由测试

- visitor、auth、platform partner token 可以调用统一接口。
- 无 token、admin、H5 token 被拒绝。
- verified visitor 可以提交 `/platform/leads`；未验证 visitor 到达 service 后被拒绝。
- 旧登录、身份切换和两套换绑路由保持原授权边界。

### 16.4 联调手机号矩阵

联调环境准备独立测试数据：

| 类型 | 预期 |
| --- | --- |
| 零身份 | `visitor_verified`，无 customer/lead 副作用 |
| 单客户 bindable | 直接 customer auth |
| 单员工 bindable | 直接 tenant_employee auth |
| 单合伙人 bindable | 直接 platform_partner auth |
| 客户 + 员工 | 两候选 |
| 两租户客户 | 两个具体客户候选 |
| 两租户员工 | 两个具体员工候选 |
| 客户 + 员工 + 合伙人 | 三候选 |
| 仅停用身份 | `IDENTITY_ACCOUNT_UNAVAILABLE` |
| 客户已绑其他微信 | `WECHAT_ALREADY_BOUND` |
| 合伙人已绑其他微信 | `PARTNER_MEMBER_ALREADY_BOUND` |
| share 命中已有客户 | 对应客户优先且保留归因 |
| share + 零身份 | visitor，不创建客户，提交 lead 后写归因 |

手机号和业务主键由联调环境创建后写入后端交付文档，不在源码或 migration 中硬编码生产式测试数据。

## 17. 发布与回滚

发布顺序：

1. 在目标环境应用 additive migration。
2. 执行 `supabase migration list`，确认 Local/Remote 对齐。
3. 验证 RPC 权限、索引和联调测试数据。
4. 部署后端新接口并运行 API smoke。
5. 回传最终 OpenAPI、错误码、selection token 规则和测试手机号矩阵。
6. Orange 团队基于最终契约发布新版本。
7. 观察新旧接口日志和错误率，旧接口继续服务旧版客户端。

迁移均为 additive。紧急回滚优先回退 API 版本并让 Orange 使用旧流程；新增表、字段、索引和 SMS scene 可以保留，不需要立即执行破坏性 down migration。确认无旧客户端和审计保留需求前，不删除旧接口或 session 数据。

## 18. 建议代码影响范围

预计创建：

- `apps/api/src/schema/phone-identity-login.ts`
- `apps/api/src/services/phone-identity-login.ts`
- `apps/api/src/repositories/phone-identity-login.ts`
- `apps/api/src/services/phone-identity-login.test.ts`
- `apps/api/src/repositories/phone-identity-login.test.ts`
- `supabase/migrations/20260715xxxx_create_phone_identity_login.sql`

预计修改：

- `packages/domain/src/auth.ts`
- `apps/api/src/services/wechat-auth-legacy-controller.ts`
- `apps/api/src/services/wechat-auth-legacy/common.ts`
- `apps/api/src/services/wechat-auth-legacy/customer.ts`
- `apps/api/src/services/wechat-auth-legacy/employee.ts`
- `apps/api/src/repositories/wechat-customer-identities.ts`
- `apps/api/src/repositories/wechat-employee-identities.ts`
- `apps/api/src/services/platform-partner-portal.ts`
- `apps/api/src/repositories/platform-partner-portal.ts`
- `apps/api/src/plugins/auth/legacy/routes.ts`
- `apps/api/src/plugins/auth/legacy/routes.test.ts`
- `apps/api/src/utils/jwt.ts`
- `apps/api/src/errors/error-codes.ts`
- `apps/api/src/schema/platform-leads.ts`
- `apps/api/src/controllers/platform-leads/index.ts`
- `apps/api/src/services/platform-leads.ts`
- `apps/api/src/repositories/platform-leads.ts`
- `apps/api/src/types/database.ts`，通过 Supabase 类型生成命令更新

该列表是设计边界，不授权重构无关认证模块。实施计划必须再次核对真实导出、现有测试和 migration 最新序号。

## 19. Orange 对接责任

后端完成后，Orange 团队负责：

- 删除访客登录卡的客户、员工、城市合伙人 Tab。
- 调用三个统一接口并处理 `visitor_verified`、`authenticated`、`selection_required`。
- 使用底部 sheet 展示候选，不根据前端缓存推断身份。
- 正式登录后继续复用 auth 持久化和 `dispatchByAuthMode`。
- 零身份后展示装修需求表单，并使用新的 verified visitor token 调用 `/platform/leads`。
- 保留已绑定身份的 `/auth/identities` 与 `/auth/switch` 快速切换。
- 保留两套换绑入口和对应错误详情处理。

gooes 只输出契约和联调版本，不修改 `/Users/leefo/Public/work/orange`。

## 20. 后端交付物

完成实现后必须回传：

1. 最终接口路径、OpenAPI 和请求响应 schema。
2. `login_identity` SMS scene 及鉴权白名单。
3. selection token 的 300 秒有效期、绑定字段、hash 存储和幂等规则。
4. 三类候选过滤、去重、排序和不可用判定规则。
5. 零身份 visitor token 支持 `/platform/leads` 的方式。
6. share token 的无副作用解析及平台线索归因字段。
7. 复用和新增错误码清单。
8. 自动化测试、migration 状态、执行计划和 API smoke 结果。
9. 联调手机号矩阵。
10. 后端部署环境、提交号和 Orange 可开始联调的版本。
