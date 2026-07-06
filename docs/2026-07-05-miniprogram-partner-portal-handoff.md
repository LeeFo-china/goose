# 小程序城市合伙人登录与看板交接文档

日期：2026-07-05
当前仓库：`/Users/leefo/Public/work/gooes`
小程序仓库：`/Users/leefo/Public/work/orange`（本次只读边界，gooes 任务不修改）
状态：已实现后端契约，待小程序端对接/验收

## 目标

小程序端给城市合伙人提供独立登录和只读运营看板，让合伙人能查看自己的推广归因、绑定装企、平台收入分佣和月结状态。

第一期只做查看和运营辅助：

- 合伙人不操作结算，不发起提现，不触发微信支付分账。
- 合伙人只能查看自己名下数据，不能查看平台全量数据。
- 合伙人只查看平台收入分佣，不查看装企自有收支、客户收款、项目回款、项目成本、内部利润和日常财务。
- 平台收入第一期只包含装修公司充值消费、平台线索成交后的线索服务费。线索服务费默认 `2.5%`，结算周期为自然月月结，第一期人工结算。

## 已实现范围

后端已实现独立的合伙人登录成员模型、微信首次绑定、合伙人 token、服务端按 token `partner_id` 强制隔离的 partner portal 接口。

`POST /auth` 也会识别已绑定城市合伙人成员的微信用户。小程序 landing 可以继续只做微信静默登录和身份分流：

- 已绑定城市合伙人成员且成员/合伙人可用时，`POST /auth` 直接返回 `platform_partner` 身份。
- 未绑定客户、员工、城市合伙人的微信，`POST /auth` 继续返回 `platform_visitor`，由访客首页承接手机号验证码绑定。
- 城市合伙人手机号绑定仍使用 `/partner/auth/send-code` 和 `/partner/auth/bind-phone`，不重做绑定接口。

已实现的小程序合伙人接口：

- `POST /auth`（已绑定城市合伙人微信时直接分流为 `platform_partner`）
- `POST /partner/auth/login`
- `POST /partner/auth/send-code`
- `POST /partner/auth/bind-phone`
- `GET /partner/auth/me`
- `GET /partner/dashboard/summary`
- `GET /partner/invite-codes`
- `GET /partner/dashboard/tenants`
- `GET /partner/dashboard/revenue-events`
- `GET /partner/dashboard/commission-ledger`
- `GET /partner/dashboard/settlements`

已实现的超管合伙人成员管理接口：

- `GET /platform/partners/:id/members?page=1&pageSize=20`
- `POST /platform/partners/:id/members`
- `PATCH /platform/partner-members/:memberId/status`

装企扫码入驻归因接口保持不变：

- `GET /partner-onboarding/invite-codes/:code`
- `POST /partner-onboarding/tenant-binding`

## 身份与 Token

合伙人登录不复用装企员工身份。后端签发 `token_type = platform_partner` 的 JWT，并在 payload 中写入服务端确认过的 `partner_id`。

JWT payload 关键字段：

```json
{
  "sub": "auth-user-id",
  "token_type": "platform_partner",
  "login_channel": "wechat",
  "roles": ["platform_partner"],
  "partner_id": "partner-id",
  "openid": "wx-openid",
  "unionid": "wx-unionid-or-null"
}
```

`/partner/...` 接口只从 token 读取 `partner_id`，不接受小程序传入 `partner_id` 作为数据隔离依据。

登录成功响应示例：

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
      "region_codes": ["411500"],
      "level": {
        "code": "city_partner",
        "name": "城市合伙人"
      }
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

字段说明：

- `member` 是合伙人登录成员，不是装企员工；小程序可用于展示成员姓名、手机号、角色和状态。
- `partner.region_codes` 是该合伙人的区域范围，后端已按 token 中的 `partner_id` 控制数据范围。
- `partner.level` 是看板上下文中的等级摘要，顶层 `level` 是完整等级信息。
- `token_type=platform_partner` 用于区分装企员工、客户、访客和 H5 token。

## 登录与绑定流程

### 已绑定微信登录

landing 静默登录优先调用统一登录接口：

```http
POST /auth
```

如果当前微信已绑定可用的城市合伙人成员，响应体中的 `data` 会直接包含：

- `token`
- `mode: "platform_partner"`
- `authMode: "platform_partner"`
- `roles: ["platform_partner"]`
- `member`
- `partner`
- `level`

如果当前微信没有绑定客户、员工、城市合伙人成员，`POST /auth` 继续返回 `platform_visitor`。

访客首页中的“城市合伙人”身份验证入口继续使用：

```http
POST /partner/auth/login
```

请求体：

```json
{
  "code": "wx-login-code"
}
```

行为：

- 小程序通过 `Taro.login()` 获取 `code`。
- 后端解析微信 `openid/unionid`，定位已绑定 `auth_user_id` 的 active 合伙人成员。
- 合伙人成员、合伙人均可用时返回 `platform_partner` token 和上下文。

### 发送首次绑定验证码

```http
POST /partner/auth/send-code
```

请求体：

```json
{
  "phone": "13800138000"
}
```

行为：

- 后端校验手机号对应 `pending_bind` 或 `active` 合伙人成员。
- 合伙人和成员可用时发送 `bind_platform_partner` 场景短信验证码。

成功响应：

```json
{
  "data": {
    "success": true
  }
}
```

### 首次绑定微信并登录

```http
POST /partner/auth/bind-phone
```

请求体：

```json
{
  "code": "wx-login-code",
  "phone": "13800138000",
  "sms_code": "123456"
}
```

行为：

- 后端用微信 `code` 解析或创建 auth user。
- 校验短信验证码。
- 通过 RPC 原子绑定手机号对应合伙人成员和当前微信 auth user。
- 成功后返回与 `POST /partner/auth/login` 相同的 token 和上下文。

### 当前合伙人身份

```http
GET /partner/auth/me
```

认证：

- `Authorization: Bearer <platform_partner token>`
- token 必须包含 `roles: ["platform_partner"]` 和 `partner_id`。

成功响应与登录响应一致，但不返回 `token`。

## 看板接口契约

所有看板接口都要求 `platform_partner` token，并且服务端按 token `partner_id` 过滤。列表接口默认 `page=1&pageSize=20`，`pageSize` 最大 `100`。

### 看板汇总

```http
GET /partner/dashboard/summary?month=2026-07
```

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `month` | string | 否 | `YYYY-MM`，默认当前自然月。 |

成功响应：

```json
{
  "data": {
    "month": "2026-07",
    "range": {
      "start": "2026-07-01T00:00:00.000Z",
      "end": "2026-08-01T00:00:00.000Z"
    },
    "metrics": {
      "tenant_count": 18,
      "revenue_event_count": 12,
      "revenue_amount_fen": 200000,
      "paid_amount_fen": 120000,
      "commission_amount_fen": 30000,
      "available_commission_amount_fen": 20000,
      "settled_commission_amount_fen": 10000,
      "settlement_batch_count": 1,
      "settlement_total_amount_fen": 10000,
      "paid_settlement_amount_fen": 10000
    }
  }
}
```

### 专属邀请码

```http
GET /partner/invite-codes
```

说明：

- 只返回当前合伙人自己的邀请码。
- 该接口为辅助入口，后端最多返回最近 `50` 条。

成功响应：

```json
{
  "data": [
    {
      "id": "invite-code-id",
      "partner_id": "partner-id",
      "code": "CP-411500-0001",
      "region_code": "411500",
      "campaign_code": null,
      "status": "active",
      "scan_count": 10,
      "submitted_count": 3,
      "approved_count": 1,
      "expires_at": null,
      "created_at": "2026-07-05T00:00:00.000Z",
      "updated_at": "2026-07-05T00:00:00.000Z"
    }
  ]
}
```

### 绑定装企列表

```http
GET /partner/dashboard/tenants?page=1&pageSize=20&status=active
```

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | number | 否 | 默认 `1`。 |
| `pageSize` | number | 否 | 默认 `20`，最大 `100`。 |
| `status` | string | 否 | `active`、`pending_transfer`、`ended`。 |

成功响应：

```json
{
  "data": {
    "list": [
      {
        "id": "binding-id",
        "tenant_id": "tenant-id",
        "partner_id": "partner-id",
        "invite_code_id": "invite-code-id",
        "source_type": "invite_code",
        "source_id": "invite-code-id",
        "status": "active",
        "bound_at": "2026-07-05T00:00:00.000Z",
        "unbound_at": null,
        "change_reason": null,
        "created_at": "2026-07-05T00:00:00.000Z",
        "updated_at": "2026-07-05T00:00:00.000Z",
        "tenant": {
          "id": "tenant-id",
          "name": "某某装饰",
          "slug": "demo"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 18,
      "totalPages": 1
    }
  }
}
```

注意：这里不展示装企自己的客户收款、项目回款、项目成本或利润。

### 平台收入事件

```http
GET /partner/dashboard/revenue-events?page=1&pageSize=20&revenue_type=lead_service_fee&month=2026-07
```

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | number | 否 | 默认 `1`。 |
| `pageSize` | number | 否 | 默认 `20`，最大 `100`。 |
| `revenue_type` | string | 否 | `tenant_recharge`、`lead_service_fee`。 |
| `status` | string | 否 | `pending`、`confirmed`、`refunded`、`reversed`、`blocked`。 |
| `month` | string | 否 | `YYYY-MM`。 |

成功响应：

```json
{
  "data": {
    "list": [
      {
        "id": "event-id",
        "revenue_type": "lead_service_fee",
        "tenant_id": "tenant-id",
        "partner_id": "partner-id",
        "partner_level_id": "level-id",
        "binding_id": "binding-id",
        "source_type": "platform_lead_deal",
        "source_id": "lead-id",
        "gross_amount_fen": 3200000,
        "revenue_amount_fen": 80000,
        "paid_amount_fen": 80000,
        "service_fee_rate_bps": 250,
        "commission_rate_bps": 1500,
        "status": "confirmed",
        "confirmed_at": "2026-07-05T00:00:00.000Z",
        "paid_at": null,
        "refundable_until": null,
        "created_at": "2026-07-05T00:00:00.000Z",
        "updated_at": "2026-07-05T00:00:00.000Z",
        "tenant": {
          "id": "tenant-id",
          "name": "某某装饰",
          "slug": "demo"
        },
        "partner_level": {
          "id": "level-id",
          "code": "city_partner",
          "name": "城市合伙人"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

### 分佣台账

```http
GET /partner/dashboard/commission-ledger?page=1&pageSize=20&status=pending
```

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | number | 否 | 默认 `1`。 |
| `pageSize` | number | 否 | 默认 `20`，最大 `100`。 |
| `status` | string | 否 | `pending`、`blocked`、`available`、`settling`、`settled`、`failed`、`reversed`。 |

成功响应：

```json
{
  "data": {
    "list": [
      {
        "id": "ledger-id",
        "partner_id": "partner-id",
        "revenue_event_id": "event-id",
        "revenue_type": "tenant_recharge",
        "base_amount_fen": 120000,
        "commission_rate_bps": 1500,
        "commission_amount_fen": 18000,
        "status": "pending",
        "available_at": null,
        "settlement_batch_id": null,
        "blocked_reason": null,
        "failure_reason": null,
        "created_at": "2026-07-05T00:00:00.000Z",
        "updated_at": "2026-07-05T00:00:00.000Z",
        "revenue_event": {
          "id": "event-id",
          "tenant_id": "tenant-id",
          "source_type": "tenant_recharge",
          "source_id": "recharge-id",
          "revenue_amount_fen": 120000
        }
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

### 月结批次

```http
GET /partner/dashboard/settlements?page=1&pageSize=20&status=paid
```

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | number | 否 | 默认 `1`。 |
| `pageSize` | number | 否 | 默认 `20`，最大 `100`。 |
| `status` | string | 否 | `draft`、`reviewing`、`paid`、`canceled`。 |

成功响应：

```json
{
  "data": {
    "list": [
      {
        "id": "batch-id",
        "batch_no": "CP-202606-0001",
        "partner_id": "partner-id",
        "period_start": "2026-06-01",
        "period_end": "2026-07-01",
        "total_amount_fen": 10000,
        "status": "paid",
        "settlement_method": "manual",
        "payment_reference": "bank-transfer-no",
        "payment_proof_url": null,
        "reviewed_by_employee_id": "employee-id",
        "paid_by_employee_id": "employee-id",
        "paid_at": "2026-07-05T00:00:00.000Z",
        "remark": "线下已结算",
        "created_at": "2026-07-05T00:00:00.000Z",
        "updated_at": "2026-07-05T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

## 错误行为

错误响应由 gooes 后端统一错误工厂包装。小程序侧应按后端 `code` 分支处理，重点错误码：

| HTTP | code | 场景 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 请求体或查询参数格式错误，例如 `pageSize > 100`。 |
| 401 | `TOKEN_MISSING` | 缺少 `Authorization` 头。 |
| 401 | `TOKEN_EXPIRED` | token 已过期，需要重新登录。 |
| 401 | `PARTNER_WECHAT_NOT_BOUND` | 当前微信用户未绑定合伙人身份，应进入手机号绑定流程或提示联系平台。 |
| 401 | `SMS_CODE_INVALID` | 验证码错误或过期。 |
| 403 | `PARTNER_AUTH_REQUIRED` | token 类型不是 `platform_partner`、角色不是 `platform_partner` 或缺少 `partner_id`。 |
| 403 | `PARTNER_ACCOUNT_DISABLED` | 合伙人成员或合伙人不可用。 |
| 404 | `PARTNER_MEMBER_NOT_FOUND` | 未找到可绑定的合伙人成员。 |
| 409 | `PARTNER_MEMBER_ALREADY_BOUND` | 当前手机号已绑定其他微信用户。 |

## orange 端改造点

以下内容由小程序团队在 `/Users/leefo/Public/work/orange` 实施。gooes 仓库任务只提供后端/admin 契约和交接文档，不修改 orange 文件。

### 类型与状态

orange 端需要修改：

- `src/store/auth_types.ts`
- `src/store/auth.ts`
- `src/services/auth_types.ts`

orange 端需要新增：

```ts
export type UserRole =
  | 'platform_partner'
  | 'platform_admin'
  | 'employee'
  | 'customer'
  | 'visitor'
  | '';

export type AuthMode =
  | 'platform_partner'
  | 'platform_admin'
  | 'tenant_employee'
  | 'customer'
  | 'customer_portal'
  | 'select_tenant'
  | 'platform_visitor'
  | '';
```

orange 端需要新增合伙人上下文：

```ts
export interface AuthPartnerInfo {
  id?: string | null;
  name?: string | null;
  status?: string | null;
  region_codes?: string[] | null;
  level?: {
    code?: string | null;
    name?: string | null;
  } | null;
}

export interface AuthPartnerMemberInfo {
  id?: string | null;
  partner_id?: string | null;
  name?: string | null;
  phone?: string | null;
  role?: string | null;
  status?: string | null;
}
```

`AuthState` 需要增加：

- `partner: AuthPartnerInfo | null`
- `partnerMember: AuthPartnerMemberInfo | null`
- `authStatus` 增加 `partner_ready`
- `setAuthContext` 支持写入 `partner`、`partnerMember`
- `clearStoredSession` 清理 `partner`、`partnerMember`

`getPrimaryRole` 和 `getPrimaryRoleByAuthMode` 中，`platform_partner` 优先级应高于 `visitor`，但不应高于 `platform_admin`。

### 登录服务

orange 端需要新增：

- `src/services/partner.ts`
- `src/services/index.ts` 导出 `PartnerService`

示例：

```ts
import { api } from '@/utils/api';

export const PartnerService = {
  login: (code: string) =>
    api.post('/partner/auth/login', { code }, { skipAuth: true }),
  sendCode: (phone: string) =>
    api.post('/partner/auth/send-code', { phone }, { skipAuth: true }),
  bindPhone: (input: { code: string; phone: string; sms_code: string }) =>
    api.post('/partner/auth/bind-phone', input, { skipAuth: true }),
  me: () => api.get('/partner/auth/me'),
  summary: (params?: { month?: string }) =>
    api.get('/partner/dashboard/summary', params),
  inviteCodes: () => api.get('/partner/invite-codes'),
  tenants: (params?: Record<string, unknown>) =>
    api.get('/partner/dashboard/tenants', params),
  revenueEvents: (params?: Record<string, unknown>) =>
    api.get('/partner/dashboard/revenue-events', params),
  commissionLedger: (params?: Record<string, unknown>) =>
    api.get('/partner/dashboard/commission-ledger', params),
  settlements: (params?: Record<string, unknown>) =>
    api.get('/partner/dashboard/settlements', params),
};
```

### 登录入口与分发

orange 端需要修改：

- `src/pages/landing/index.tsx`
- `src/services/auth.ts`
- `src/services/auth_navigation.ts`

orange 端登录流程：

1. 合伙人入口页面或按钮触发 `Taro.login()`。
2. 优先调用 `PartnerService.login(code)`。
3. 如果返回 `PARTNER_WECHAT_NOT_BOUND`，进入手机号验证码绑定流程。
4. 调用 `PartnerService.sendCode(phone)` 发送验证码。
5. 调用 `PartnerService.bindPhone({ code, phone, sms_code })` 完成首次绑定并登录。
6. 复用现有 token 存储方式保存 `token` 和 `userInfo`。
7. 在 auth store 中写入 `authMode: 'platform_partner'`、`partner`、`partnerMember`。
8. `auth_navigation.ts` 中新增 `platform_partner` 分支，跳转合伙人看板首页。

不要把合伙人登录态写成 `tenant_employee`，否则会触发租户员工 bootstrap、账期锁、租户停用等装企侧逻辑。

### 页面建议

orange 端需要新增独立分包：

- `packagePartner/pages/dashboard/index`
- `packagePartner/pages/tenants/index`
- `packagePartner/pages/revenue/index`
- `packagePartner/pages/commissions/index`
- `packagePartner/pages/settlements/index`
- `packagePartner/pages/invite-codes/index`

第一版页面能力：

- 首页：本月平台收入、本月预估分佣、已绑定装企数、最新月结状态。
- 邀请码：展示专属邀请码和小程序码入口。
- 装企：分页查看已绑定装企。
- 收入：分页查看平台收入事件。
- 分佣：分页查看分佣台账。
- 月结：分页查看月结批次状态。

## 调用时序

合伙人打开小程序：

1. 小程序进入 landing。
2. `Taro.login()` 获取 `code`。
3. `POST /auth` 做静默身份分流。
4. 如果 `/auth` 返回 `platform_partner`，保存 token、roles、mode、authMode、member、partner、level，跳转 `packagePartner/pages/dashboard/index`。
5. 如果 `/auth` 返回 `platform_visitor`，进入访客首页。
6. 用户在访客首页选择“城市合伙人”后，调用 `POST /partner/auth/login`。
7. 如果微信未绑定合伙人成员，进入手机号验证码绑定：`POST /partner/auth/send-code`、`POST /partner/auth/bind-phone`。
8. 绑定成功后保存 token、roles、mode、authMode、member、partner、level，跳转 `packagePartner/pages/dashboard/index`。
9. 页面调用 `GET /partner/dashboard/summary`。
10. 列表页按需调用 tenants、revenue-events、commission-ledger、settlements。

装企扫码入驻：

1. 继续使用 `GET /partner-onboarding/invite-codes/:code`。
2. 装企完成登录/入驻后调用 `POST /partner-onboarding/tenant-binding`。
3. 该流程只绑定装企与合伙人的归因，不代表合伙人本人登录。

这两个流程必须分开，避免把“装企扫描合伙人二维码”误判为“合伙人登录”。

## 小程序验收清单

- 未绑定合伙人身份的微信用户点击合伙人入口，提示联系平台开通或进入手机号绑定流程。
- 已绑定合伙人成员的微信用户，landing 调 `POST /auth` 后直接进入合伙人看板。
- 未绑定客户、员工、城市合伙人的微信用户，landing 调 `POST /auth` 后进入访客首页。
- 已录入平台预留手机号的合伙人，可通过手机号验证码首次绑定微信。
- 已绑定其他微信的手机号，不能被新微信覆盖。
- 停用合伙人成员或合伙人不能进入看板。
- 合伙人登录成功后，store 中 `authMode = platform_partner`。
- 合伙人登录后不触发员工 bootstrap，不进入租户首页。
- 看板汇总只展示当前合伙人的数据。
- 装企列表、收入事件、分佣台账、月结批次均分页请求。
- `pageSize` 超过 `100` 时后端拒绝。
- 合伙人看不到装企自己的客户收款、项目回款、成本、利润等内部财务数据。
- token 过期后能回到合伙人登录入口重新登录。

## 分工边界

gooes 后端/admin：

- 提供 partner portal 登录、身份、看板和分页列表接口。
- 在超管后台维护合伙人、成员绑定、邀请码、分佣和月结。
- 通过 migration 管理新增表、索引、RPC 和约束。

orange 小程序：

- 只在 orange 仓库中新增合伙人角色、登录入口、store 上下文和页面分包。
- 调用 `/partner/...` 接口展示只读看板。
- 保留原有装企扫码入驻归因流程。

不在第一期范围：

- 合伙人发起提现。
- 微信支付自动分账。
- 合伙人编辑装企资料。
- 合伙人查看装企业务流水。
- 合伙人直接创建或修改平台收入事件。
