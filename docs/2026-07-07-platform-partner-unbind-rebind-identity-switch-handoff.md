# 城市合伙人成员解绑、换绑与身份切换方案

日期：2026-07-07
当前仓库：`/Users/leefo/Public/work/gooes`
小程序仓库：`/Users/leefo/Public/work/orange`（本次只读参考，不修改）
状态：Phase 1 自助解绑/身份切换已实现；Phase 2 旧微信不可用时人工换绑后端与 admin 审核已实现，待发布联调环境后小程序端对接

## 目标

补齐城市合伙人成员在小程序端的账号自助能力：

- 合伙人成员可以在当前微信仍可用时自主解绑微信。
- 解绑后可以用新的微信重新绑定同一个合伙人成员手机号。
- 旧微信不可用时，可以在新微信端提交平台级人工换绑申请，由超管审核。
- 同一个微信如果同时是客户、员工、城市合伙人成员，需要支持身份切换。
- 用户可以从客户、员工、城市合伙人身份返回访客首页，但这不等于解绑微信。

核心边界：

- 合伙人成员绑定关系以 `platform_partner_members.auth_user_id` 为准。
- 解绑合伙人身份时，只清空合伙人成员绑定，不全局解绑同一微信的 OAuth identity。
- 如果同一微信同时绑定客户或员工身份，解绑城市合伙人后，客户/员工身份仍然保留。
- 城市合伙人收益、分佣、装企归因仍按 `partner_id` 隔离，小程序不传 `partner_id` 决定数据范围。

## 当前现状

已存在能力：

- `POST /auth` 可以识别已绑定城市合伙人成员的微信，并返回 `platform_partner`。
- `POST /partner/auth/send-code` 发送合伙人成员绑定验证码。
- `POST /partner/auth/bind-phone` 通过申请手机号和验证码绑定当前微信。
- `GET /partner/auth/me` 返回当前合伙人身份。
- `/partner/dashboard/*` 看板接口按 token 中的 `partner_id` 隔离数据。
- 客户和员工已有自助解绑、旧微信不可用时人工换绑的参考模式。

当前缺口：

- 没有 `POST /partner/auth/unbind-wechat`。
- 没有合伙人旧微信不可用时的平台级换绑申请表和审核接口。
- `/auth` 目前偏向直接分流到一个身份，没有独立的“可切换身份列表”和“切换身份签发 token”接口。
- 现有 `wechat_rebind_requests` 表强依赖 `tenant_id`、`customer/employee` 和租户员工审核，不适合直接承载平台级合伙人成员换绑。

## 推荐方案

分两期落地。

### 第一期：自助解绑、重新绑定、身份切换

第一期优先解决小程序端可立即闭环的路径：

1. 当前微信已登录城市合伙人。
2. 在合伙人工作台点击“解绑微信”。
3. 后端向该成员手机号发送解绑验证码。
4. 用户输入验证码后解除 `platform_partner_members.auth_user_id`。
5. 后端返回 `platform_visitor` auth，让小程序直接回访客首页。
6. 用户换到新微信后，从访客首页城市合伙人入口输入同一手机号，继续使用现有 `send-code + bind-phone` 完成重新绑定。

这条链路不需要平台人工审核，因为旧微信仍然可用，且手机号验证码证明成员仍能接收账号手机号。

### 第二期：旧微信不可用时人工换绑

第二期解决旧微信丢失、无法登录旧微信解绑的情况：

1. 新微信打开小程序，进入访客首页。
2. 用户选择“城市合伙人换绑”，输入成员手机号并接收换绑验证码。
3. 后端确认手机号对应一个已绑定旧微信的合伙人成员。
4. 创建平台级换绑申请。
5. 超管在 admin 审核。
6. 审核通过后，后端把该合伙人成员的 `auth_user_id` 从旧 auth user 切到新 auth user。
7. 旧微信的客户/员工身份不受影响；只转移该合伙人成员绑定。

不建议第一期把旧 `wechat_rebind_requests` 直接扩展成合伙人换绑。旧表有 `tenant_id NOT NULL` 和租户员工审核语义，平台级合伙人没有天然租户上下文，硬塞会增加权限泄漏风险。推荐新建 `platform_partner_member_rebind_requests`。

## 后端接口契约

### 1. 查询可切换身份

```http
GET /auth/identities
Authorization: Bearer <任意有效 auth token>
```

认证：

- 支持 `platform_partner`、`tenant_employee`、`customer/customer_portal`、`platform_visitor` token。
- 服务端只根据 token 中的 `sub/auth_user_id` 查当前微信关联身份。

响应：

```json
{
  "data": {
    "current_mode": "platform_partner",
    "identities": [
      {
        "mode": "platform_visitor",
        "label": "访客首页",
        "available": true
      },
      {
        "mode": "platform_partner",
        "label": "城市合伙人",
        "available": true,
        "partner_id": "partner-id",
        "partner_name": "信阳城市合伙人",
        "member_id": "member-id",
        "member_name": "张三",
        "phone_masked": "138****8000",
        "status": "active"
      },
      {
        "mode": "tenant_employee",
        "label": "员工",
        "available": true,
        "tenant_id": "tenant-id",
        "tenant_name": "某某装饰",
        "employee_id": "employee-id",
        "employee_name": "张三",
        "status": "active"
      },
      {
        "mode": "customer",
        "label": "客户",
        "available": true,
        "tenant_id": "tenant-id",
        "tenant_name": "某某装饰",
        "customer_id": "customer-id",
        "customer_name": "张三"
      }
    ]
  }
}
```

说明：

- `platform_visitor` 始终可返回。
- 身份列表是当前 auth user 绑定身份，预期数量很小，服务端最多返回 50 个。
- 如果一个微信有多个客户或多个员工身份，返回多条，切换时由前端带回对应 `tenant_id + identity_id`。
- 小程序不得缓存该列表作为权限依据，每次打开身份切换页应重新拉取。

错误码：

- `TOKEN_MISSING`
- `TOKEN_INVALID`
- `TOKEN_EXPIRED`

### 2. 切换身份

```http
POST /auth/switch
Authorization: Bearer <任意有效 auth token>
```

请求：

```json
{
  "target_mode": "platform_partner",
  "partner_member_id": "member-id"
}
```

切到访客首页：

```json
{
  "target_mode": "platform_visitor"
}
```

也可以使用专用接口返回访客首页：

```http
POST /auth/switch/visitor
Authorization: Bearer <任意有效 auth token>
```

请求体可为空，响应与 `POST /auth/switch` 切到 `platform_visitor` 一致。

切到员工：

```json
{
  "target_mode": "tenant_employee",
  "tenant_id": "tenant-id",
  "employee_id": "employee-id"
}
```

切到客户：

```json
{
  "target_mode": "customer",
  "tenant_id": "tenant-id",
  "customer_id": "customer-id"
}
```

响应：

```json
{
  "data": {
    "token": "jwt",
    "user_id": "auth-user-id",
    "roles": ["platform_partner"],
    "mode": "platform_partner",
    "authMode": "platform_partner",
    "member": {
      "id": "member-id",
      "partner_id": "partner-id",
      "name": "张三",
      "phone": "13800138000",
      "role": "owner",
      "status": "active"
    },
    "partner": {
      "id": "partner-id",
      "name": "信阳城市合伙人",
      "status": "active",
      "region_codes": ["411500"]
    },
    "level": {
      "id": "level-id",
      "code": "city_partner",
      "name": "城市合伙人",
      "status": "active"
    }
  }
}
```

说明：

- 返回结构与对应身份登录成功结构一致，小程序直接复用现有 `persistAuthResponse`。
- 切到 `platform_visitor` 时返回 visitor session token，`roles=["visitor"]`，`mode/authMode="platform_visitor"`。
- 切换身份只改变当前小程序会话 token，不改变绑定关系。
- 后端必须实时校验目标身份仍然存在且可用，不接受前端传来的显示信息。

错误码：

- `IDENTITY_OPTION_NOT_FOUND`
- `IDENTITY_SWITCH_NOT_ALLOWED`
- `PARTNER_AUTH_REQUIRED`
- `PARTNER_ACCOUNT_DISABLED`
- `PARTNER_MEMBER_NOT_FOUND`
- `CUSTOMER_CONTEXT_MISSING`
- `EMPLOYEE_CONTEXT_MISSING`

### 3. 发送合伙人成员解绑验证码

```http
POST /partner/auth/unbind-code
Authorization: Bearer <platform_partner token>
```

请求体为空：

```json
{}
```

响应：

```json
{
  "data": {
    "success": true,
    "cooldown_seconds": 60
  }
}
```

行为：

- 后端从 token 定位当前 `partner_id + auth_user_id`。
- 查询当前 active 合伙人成员。
- 使用成员手机号发送 `unbind_platform_partner` 场景验证码。
- 对手机号、IP、auth user 做限流。
- 验证码建议 5 分钟有效。

错误码：

- `PARTNER_AUTH_REQUIRED`
- `PARTNER_ACCOUNT_DISABLED`
- `PARTNER_MEMBER_NOT_FOUND`
- `PARTNER_MEMBER_NOT_BOUND`
- `SMS_CODE_RATE_LIMITED`

数据库要求：

- migration 扩展 `sms_verification_codes.scene` 约束，新增 `unbind_platform_partner`。

### 4. 合伙人成员自助解绑微信

```http
POST /partner/auth/unbind-wechat
Authorization: Bearer <platform_partner token>
```

请求：

```json
{
  "sms_code": "123456",
  "confirm": true
}
```

成功响应：

```json
{
  "data": {
    "success": true,
    "message": "微信绑定已解除",
    "auth": {
      "token": "visitor-session-jwt",
      "user_id": "auth-user-id",
      "visitor_id": "wechat_visitor_4f9c2b7a1d0e8c6b",
      "roles": ["visitor"],
      "mode": "platform_visitor",
      "authMode": "platform_visitor",
      "is_new_user": false
    }
  }
}
```

行为：

- 必须要求 `platform_partner` token。
- 必须验证 `sms_code` 与当前合伙人成员手机号匹配、未过期、未使用。
- 必须确认 token 中 `partner_id` 与成员 `partner_id` 一致。
- 将当前 `platform_partner_members.auth_user_id` 置空。
- 将成员状态改回 `pending_bind`，除非成员或合伙人已被停用。
- 将短信验证码置为已使用。
- 写入平台审计日志。
- 失效当前 auth user 的合伙人上下文缓存。
- 返回 `platform_visitor` auth，方便小程序直接回访客首页。

不能做的事：

- 不能删除或停用 `user_oauth_identities`。
- 不能解绑客户身份。
- 不能解绑员工身份。
- 不能影响该合伙人名下装企归因、分佣台账、月结批次。
- 不能接受前端传 `partner_id` 决定解绑目标。

错误码：

- `PARTNER_AUTH_REQUIRED`
- `PARTNER_ACCOUNT_DISABLED`
- `PARTNER_MEMBER_NOT_FOUND`
- `PARTNER_MEMBER_NOT_BOUND`
- `SMS_CODE_REQUIRED`
- `SMS_CODE_INVALID`
- `PARTNER_UNBIND_CONFIRM_REQUIRED`

### 5. 重新绑定到新微信

旧微信已自助解绑后，新微信不需要新增接口，继续使用现有接口：

```http
POST /partner/auth/send-code
POST /partner/auth/bind-phone
```

新微信绑定请求：

```json
{
  "code": "wx-login-code",
  "phone": "13800138000",
  "sms_code": "123456"
}
```

成功后返回 `platform_partner` auth。

小程序注意：

- 不传 `partner_id`。
- 不传 `member_id`。
- 手机号必须是合伙人成员手机号。
- 如果成员已绑定其他微信，后端返回 `PARTNER_MEMBER_ALREADY_BOUND`，小程序引导用户走“旧微信不可用换绑申请”。

### 6. 旧微信不可用时发送换绑验证码

```http
POST /partner/auth/rebind-code
Authorization: Bearer <platform_visitor 或其他有效 auth token>
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
  "data": {
    "success": true,
    "cooldown_seconds": 60
  }
}
```

行为：

- 后端按手机号查找 active 合伙人成员。
- 该成员必须已经绑定旧 `auth_user_id`。
- 使用 `rebind_platform_partner` 场景发送验证码。
- 对手机号、IP、auth user 做限流。

错误码：

- `PARTNER_MEMBER_NOT_FOUND`
- `PARTNER_MEMBER_NOT_BOUND`
- `PARTNER_ACCOUNT_DISABLED`
- `SMS_CODE_RATE_LIMITED`

### 7. 提交合伙人成员换绑申请

```http
POST /partner/auth/rebind-requests
Authorization: Bearer <platform_visitor 或其他有效 auth token>
```

请求：

```json
{
  "phone": "13800138000",
  "sms_code": "123456",
  "applicant_name": "张三",
  "reason": "旧微信无法使用"
}
```

成功响应：

```json
{
  "data": {
    "id": "request-id",
    "status": "pending",
    "message": "换绑申请已提交，请等待平台审核"
  }
}
```

行为：

- 后端从 token 获取新微信对应 `auth_user_id`。
- 校验手机号验证码。
- 按手机号查找当前 active 合伙人成员和所属 active 合伙人。
- 该成员必须已经绑定旧 `auth_user_id`，且旧 `auth_user_id` 不能等于当前新 `auth_user_id`。
- 同一成员只能有一条 pending 换绑申请。
- 创建 `platform_partner_member_rebind_requests`。
- 小程序不传 `partner_id` 和 `member_id`。

错误码：

- `SMS_CODE_REQUIRED`
- `SMS_CODE_INVALID`
- `PARTNER_MEMBER_NOT_FOUND`
- `PARTNER_MEMBER_NOT_BOUND`
- `PARTNER_ACCOUNT_DISABLED`
- `PARTNER_REBIND_REQUEST_DUPLICATED`
- `PARTNER_REBIND_SAME_WECHAT`

### 8. 超管审核合伙人成员换绑

列表：

```http
GET /platform/partner-member-rebind-requests?status=pending&page=1&pageSize=20&keyword=13800138000&partner_id=partner-id
```

审核通过：

```http
POST /platform/partner-member-rebind-requests/:id/approve
```

请求：

```json
{
  "comment": "身份资料已核验"
}
```

审核拒绝：

```http
POST /platform/partner-member-rebind-requests/:id/reject
```

请求：

```json
{
  "comment": "资料不匹配"
}
```

审核通过行为：

- 申请必须仍为 `pending`。
- 成员手机号必须仍匹配。
- 成员必须仍为 `active` 且未停用。
- 所属合伙人必须 active。
- 成员当前 `auth_user_id` 必须仍等于申请记录中的 `old_auth_user_id`。
- 新 `auth_user_id` 不能已绑定其他未停用的合伙人成员。
- 更新 `platform_partner_members.auth_user_id = new_auth_user_id`，`status = active`。
- 写平台审计日志。
- 失效 old/new auth user 的合伙人上下文缓存。
- 不全局解绑旧微信 OAuth identity。

列表分页：

- 默认 `page=1&pageSize=20`。
- `pageSize` 最大 `100`。

admin 入口：

- 超管平台侧 `/platform/partners` 新增 `换绑审核` tab。
- 支持按合伙人、状态、关键词过滤。
- 行内支持详情、通过、驳回。

## 推荐数据库变更

所有数据库变更必须通过 migration。

### 1. 短信场景

扩展 `sms_verification_codes.scene` 约束，新增：

- `unbind_platform_partner`
- `rebind_platform_partner`

### 2. 合伙人换绑申请表

推荐新增表：`platform_partner_member_rebind_requests`

字段建议：

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `partner_id` | 合伙人 ID |
| `member_id` | 合伙人成员 ID |
| `phone` | 校验手机号 |
| `old_auth_user_id` | 旧微信 auth user |
| `new_auth_user_id` | 新微信 auth user |
| `applicant_name` | 申请人姓名 |
| `reason` | 申请原因 |
| `status` | `pending`、`approved`、`rejected`、`cancelled` |
| `reviewer_employee_id` | 审核超管员工 ID |
| `review_comment` | 审核说明 |
| `reviewed_at` | 审核时间 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

索引建议：

- `(status, created_at DESC)`
- `(partner_id, status, created_at DESC)`
- `(phone, created_at DESC)`
- pending 唯一索引：`member_id WHERE status='pending'`

## 后端实现边界

建议按现有分层实现：

- controller 只处理 HTTP、参数校验和 `ResponseHandler.success`。
- service 编排解绑、身份切换、换绑申请审核。
- repository 直接访问 Supabase 或 RPC。
- 错误响应必须经过 `error-factory.ts`。

建议涉及文件：

- `apps/api/src/schema/platform-partner-portal.ts`
- `apps/api/src/controllers/platform-partner-portal/index.ts`
- `apps/api/src/services/platform-partner-portal.ts`
- `apps/api/src/repositories/platform-partner-portal.ts`
- `apps/api/src/schema/auth-identity-switch.ts`
- `apps/api/src/controllers/auth/index.ts` 或现有 auth controller 入口
- `apps/api/src/services/auth-identity-switch.ts`
- `apps/api/src/repositories/auth-identity-options.ts`
- `apps/api/src/schema/platform-partner-member-rebind-requests.ts`
- `apps/api/src/controllers/platform-partner-member-rebind-requests/index.ts`
- `apps/api/src/services/platform-partner-member-rebind-requests.ts`
- `apps/api/src/repositories/platform-partner-member-rebind-requests.ts`
- `supabase/migrations/*_platform_partner_member_unbind_rebind.sql`

实际落地文件：

- `apps/api/src/schema/platform-partner-member-rebind.ts`
- `apps/api/src/controllers/platform-partner-member-rebind-requests/index.ts`
- `apps/api/src/services/platform-partner-member-rebind.ts`
- `apps/api/src/repositories/platform-partner-member-rebind.ts`
- `supabase/migrations/20260707183000_platform_partner_member_rebind_requests.sql`
- `apps/admin/app/(console)/platform/partners/page.tsx`
- `apps/admin/components/platform-partners/platform-partner-member-rebind-table.tsx`

最小验证：

- 单测覆盖自助解绑不会删除客户/员工 OAuth identity。
- 单测覆盖解绑后 `/partner/auth/me` 返回 `PARTNER_AUTH_REQUIRED`。
- 单测覆盖解绑后新微信可通过现有 `bind-phone` 绑定。
- 单测覆盖同一微信同时有客户、员工、城市合伙人身份时，`identities` 全部返回。
- 单测覆盖 `switch` 返回目标身份 token。
- migration 应用后执行 `supabase migration list` 确认 Local/Remote 对齐。

## 小程序对接清单

orange 目前已有：

- `src/store/auth_types.ts` 支持 `platform_partner`。
- `src/services/partner.ts` 已有 `login/sendCode/bindPhone/me`。
- `src/pages/visitor/VerifyPopup.tsx` 已有城市合伙人登录入口。
- `src/packagePartner/model.ts` 已有合伙人会话保护和登录回退。

需要新增：

### 1. partner service 方法

在 `src/services/partner.ts` 增加：

- `sendUnbindCode() -> POST /partner/auth/unbind-code`
- `unbindWechat({ sms_code, confirm }) -> POST /partner/auth/unbind-wechat`
- `sendRebindCode(phone) -> POST /partner/auth/rebind-code`
- `createRebindRequest(payload) -> POST /partner/auth/rebind-requests`

### 2. identity service 方法

建议新增 `src/services/identity.ts`：

- `getIdentityOptions() -> GET /auth/identities`
- `switchIdentity(payload) -> POST /auth/switch`
- `switchToVisitor() -> POST /auth/switch/visitor`

切换成功后调用现有 `AuthService.persistAuthResponse(auth)`，再按 `dispatchByAuthMode(auth)` 跳转。

### 3. 合伙人工作台账号入口

在合伙人工作台增加“账号与身份”入口，至少提供：

- 当前合伙人成员信息。
- 身份切换。
- 返回访客首页。
- 解绑微信。

解绑交互：

1. 点击“解绑微信”。
2. 弹确认，说明解绑后需要用手机号重新绑定才能进入合伙人工作台。
3. 调 `sendUnbindCode()`。
4. 输入短信验证码。
5. 调 `unbindWechat({ sms_code, confirm: true })`。
6. 成功后保存返回的 `auth`，跳到 `/pages/visitor/index`。

### 4. 身份切换页

身份切换页从 `GET /auth/identities` 渲染身份列表：

- 访客首页。
- 客户身份。
- 员工身份。
- 城市合伙人身份。

点击任一身份：

1. 访客首页调 `POST /auth/switch/visitor`；其他身份调 `POST /auth/switch`。
2. 保存返回 auth。
3. 用现有 `dispatchByAuthMode` 跳转。

### 5. 旧微信不可用换绑入口

当城市合伙人绑定返回 `PARTNER_MEMBER_ALREADY_BOUND` 时，小程序展示：

- “该手机号已绑定其他微信”
- “如果旧微信无法使用，可提交换绑申请”

用户确认后：

1. 调 `POST /partner/auth/rebind-code`。
2. 输入验证码和换绑原因。
3. 调 `POST /partner/auth/rebind-requests`。
4. 提示“换绑申请已提交，平台审核通过后可使用当前微信登录”。

## 小程序联调验收

### 用例 1：合伙人自助解绑并返回访客首页

1. 使用已绑定合伙人的微信进入小程序。
2. `/auth` 返回 `platform_partner`。
3. 进入合伙人工作台。
4. 发送解绑验证码。
5. 提交解绑。

预期：

- `POST /partner/auth/unbind-wechat` 返回 success 和 `platform_visitor` auth。
- 小程序保存 visitor auth。
- 页面进入访客首页。
- 再访问 `/partner/auth/me` 返回 `PARTNER_AUTH_REQUIRED`。

### 用例 2：解绑后新微信重新绑定

1. 旧微信已完成自助解绑。
2. 新微信打开小程序进入访客首页。
3. 选择城市合伙人登录。
4. 使用同一成员手机号发送验证码并绑定。

预期：

- `POST /partner/auth/bind-phone` 返回 `platform_partner`。
- 看板接口能访问当前合伙人的数据。
- 不需要前端传 `partner_id`。

### 用例 3：同一微信有多个身份

1. 同一个微信已经绑定客户、员工、城市合伙人成员。
2. 登录后进入任一身份。
3. 打开身份切换页。

预期：

- `GET /auth/identities` 返回访客、客户、员工、城市合伙人。
- 切到访客后进入访客首页。
- 切回城市合伙人后进入合伙人工作台。
- 切到客户或员工后进入对应工作台。

### 用例 4：解绑城市合伙人不影响客户/员工

1. 同一个微信同时有客户、员工、城市合伙人身份。
2. 在城市合伙人工作台自助解绑。
3. 打开身份切换页或重新登录。

预期：

- 城市合伙人身份消失或不可用。
- 客户和员工身份仍可切换。
- 不出现客户/员工也被解绑的情况。

### 用例 5：旧微信不可用提交人工换绑

1. 新微信进入访客首页。
2. 城市合伙人绑定手机号时返回 `PARTNER_MEMBER_ALREADY_BOUND`。
3. 用户提交换绑申请。
4. 超管审核通过。
5. 新微信再次登录。

预期：

- 换绑申请创建成功且只创建一条 pending。
- 审核通过后新微信 `/auth` 返回 `platform_partner`。
- 旧微信不再能以该合伙人成员登录。
- 旧微信其他客户/员工身份不受影响。

## 和小程序端同步的短版话术

这次不是重做城市合伙人登录，而是在现有合伙人绑定基础上补齐四类能力：

1. 合伙人成员自助解绑微信。
2. 旧微信可用时，解绑后用新微信走现有 `send-code + bind-phone` 重新绑定。
3. 同一微信多身份时，支持访客、客户、员工、城市合伙人之间手动切换。
4. 旧微信不可用时，新微信在访客态提交平台人工换绑申请，超管审核通过后可登录城市合伙人。

已实现接口：

- `GET /auth/identities`
- `POST /auth/switch`
- `POST /auth/switch/visitor`
- `POST /partner/auth/unbind-code`
- `POST /partner/auth/unbind-wechat`
- `POST /partner/auth/rebind-code`
- `POST /partner/auth/rebind-requests`
- `GET /platform/partner-member-rebind-requests`
- `POST /platform/partner-member-rebind-requests/:id/approve`
- `POST /platform/partner-member-rebind-requests/:id/reject`

小程序侧需要新增“账号与身份”入口，提供身份切换、返回访客首页、解绑微信。解绑成功后后端会返回 `platform_visitor` auth，小程序保存后直接进访客首页。

旧微信不可用时，小程序用当前 visitor/auth token 调 `rebind-code` 和 `rebind-requests`。前端不传 `partner_id`、`member_id`、`auth_user_id`。审核通过后用户再次打开小程序或重新 `/auth`，后端会识别为 `platform_partner`。
