# 租户积分计费系统阶段 1 后端对接实施文档

日期：2026-05-12

关联总方案：

- `docs/2026-05-12-tenant-prepaid-credit-billing-implementation-plan.md`

## 1. 目标

阶段 1 只落地计费底座，不直接改造短信、AI、视频转文本的扣费链路。

本阶段完成后，后端应具备：

1. 租户积分账户。
2. 平台人工充值。
3. 积分流水。
4. 价格规则配置。
5. 业务账单事件表。
6. 积分冻结、释放、实扣的事务 RPC。
7. admin 和小程序可读取余额。
8. 后续 worker 能基于 `ai_call_logs`、`sms_send_logs`、`social_video_transcriptions` 生成账单事件。

## 2. 当前后端已具备能力

截至 2026-05-12，已完成：

- `ai_providers`
- `ai_models`
- `ai_scene_routes`
- `ai_call_logs`
- `/platform/ai-config`
- admin `/platform/ai-models`
- `ai_call_logs.raw_usage`
- `ai_call_logs.cached_input_tokens`
- `ai_call_logs.reasoning_tokens`

这意味着 AI 侧已经具备按 `scene_code + provider_code + model_code` 做价格规则匹配和试算的基础数据。

仍未完成：

- 租户积分账户表
- 租户充值订单表
- 积分总账表
- 业务账单事件表
- 租户价格规则表
- 账务 RPC
- billing worker
- admin 账务页面
- 小程序余额接口

## 3. 阶段 1 数据库 migration

建议新增 migration：

```text
supabase/migrations/YYYYMMDDHHMMSS_create_tenant_credit_billing.sql
```

### 3.1 `tenant_credit_accounts`

```sql
create table if not exists public.tenant_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id),
  balance_credits bigint not null default 0,
  frozen_credits bigint not null default 0,
  total_recharged_credits bigint not null default 0,
  total_consumed_credits bigint not null default 0,
  total_granted_credits bigint not null default 0,
  status text not null default 'active',
  is_test boolean not null default false,
  expires_at timestamptz null,
  last_recharged_at timestamptz null,
  last_activity_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_credit_accounts_non_negative_check check (
    balance_credits >= 0
    and frozen_credits >= 0
    and frozen_credits <= balance_credits
  ),
  constraint tenant_credit_accounts_status_check check (
    status in ('active', 'disabled')
  )
);
```

索引：

```sql
create index if not exists tenant_credit_accounts_status_idx
on public.tenant_credit_accounts(status);
```

### 3.2 `tenant_credit_account_balances`

可用积分不落库，用视图计算。

```sql
create or replace view public.tenant_credit_account_balances as
select
  account.*,
  greatest(account.balance_credits - account.frozen_credits, 0) as available_credits
from public.tenant_credit_accounts account;
```

### 3.3 `tenant_credit_orders`

```sql
create table if not exists public.tenant_credit_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  order_no text not null unique,
  package_code text null,
  credits bigint not null,
  amount_fen integer not null,
  bonus_credits bigint not null default 0,
  channel text not null,
  status text not null,
  paid_at timestamptz null,
  created_by uuid null,
  remark text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_credit_orders_amount_check check (
    credits > 0 and amount_fen >= 0 and bonus_credits >= 0
  ),
  constraint tenant_credit_orders_channel_check check (
    channel in ('manual', 'wechat_pay', 'alipay', 'bank_transfer')
  ),
  constraint tenant_credit_orders_status_check check (
    status in ('pending', 'paid', 'closed', 'refunded')
  )
);
```

索引：

```sql
create index if not exists tenant_credit_orders_tenant_created_idx
on public.tenant_credit_orders(tenant_id, created_at desc);

create index if not exists tenant_credit_orders_status_created_idx
on public.tenant_credit_orders(status, created_at desc);
```

### 3.4 `tenant_credit_ledger`

```sql
create table if not exists public.tenant_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  account_id uuid not null references public.tenant_credit_accounts(id),
  direction text not null,
  change_credits bigint not null,
  balance_after bigint not null,
  frozen_after bigint not null,
  event_type text not null,
  correlation_id uuid null,
  source_type text null,
  source_id text null,
  source_no text null,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  remark text null,
  operator_user_id uuid null,
  created_at timestamptz not null default now(),
  constraint tenant_credit_ledger_change_check check (change_credits > 0),
  constraint tenant_credit_ledger_after_check check (
    balance_after >= 0
    and frozen_after >= 0
    and frozen_after <= balance_after
  ),
  constraint tenant_credit_ledger_direction_check check (
    direction in ('in', 'out', 'freeze', 'unfreeze')
  )
);
```

幂等索引：

```sql
create unique index if not exists tenant_credit_ledger_source_event_unique_idx
on public.tenant_credit_ledger(
  tenant_id,
  coalesce(source_type, ''),
  coalesce(source_id, ''),
  event_type
)
where source_type is not null and source_id is not null;
```

查询索引：

```sql
create index if not exists tenant_credit_ledger_tenant_created_idx
on public.tenant_credit_ledger(tenant_id, created_at desc);

create index if not exists tenant_credit_ledger_correlation_idx
on public.tenant_credit_ledger(correlation_id)
where correlation_id is not null;
```

### 3.5 `tenant_billing_events`

```sql
create table if not exists public.tenant_billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  metric_code text not null,
  source_type text not null,
  source_id text not null,
  source_sub_id text null,
  billable_units numeric(18, 6) not null,
  unit_name text not null,
  unit_price_credits numeric(18, 6) not null,
  credits bigint not null,
  status text not null default 'pending',
  provider_request_id text null,
  pricing_rule_id uuid null,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  raw_usage jsonb not null default '{}'::jsonb,
  settled_at timestamptz null,
  failure_code text null,
  failure_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_billing_events_units_check check (
    billable_units >= 0 and unit_price_credits >= 0 and credits >= 0
  ),
  constraint tenant_billing_events_status_check check (
    status in ('pending', 'estimated', 'charged', 'waived', 'refunded', 'failed')
  )
);
```

幂等索引：

```sql
create unique index if not exists tenant_billing_events_source_unique_idx
on public.tenant_billing_events(
  metric_code,
  source_type,
  source_id,
  coalesce(source_sub_id, '')
);
```

查询索引：

```sql
create index if not exists tenant_billing_events_tenant_created_idx
on public.tenant_billing_events(tenant_id, created_at desc);

create index if not exists tenant_billing_events_status_created_idx
on public.tenant_billing_events(status, created_at desc);

create index if not exists tenant_billing_events_metric_created_idx
on public.tenant_billing_events(metric_code, created_at desc);
```

### 3.6 `tenant_pricing_rules`

```sql
create table if not exists public.tenant_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  rule_group_id uuid null,
  version integer not null default 1,
  tenant_id uuid null references public.tenants(id),
  metric_code text not null,
  provider_code text null,
  model_code text null,
  scene_code text null,
  unit_name text not null,
  unit_price_credits numeric(18, 6) not null,
  min_charge_credits bigint not null default 0,
  enabled boolean not null default true,
  effective_at timestamptz not null default now(),
  expires_at timestamptz null,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_pricing_rules_price_check check (
    unit_price_credits >= 0 and min_charge_credits >= 0
  ),
  constraint tenant_pricing_rules_window_check check (
    expires_at is null or expires_at > effective_at
  )
);
```

索引：

```sql
create index if not exists tenant_pricing_rules_lookup_idx
on public.tenant_pricing_rules(
  tenant_id,
  metric_code,
  provider_code,
  model_code,
  scene_code,
  enabled,
  priority,
  effective_at desc
);
```

### 3.7 默认价格规则 seed

阶段 1 必须 seed 平台默认规则：

| metric_code | unit_name | unit_price_credits |
| --- | --- | --- |
| `sms_domestic_success` | `message` | `50` |
| `social_video_transcription_minute` | `minute` | `60` |
| `ai_input_text_token` | `1k_tokens` | `10` |
| `ai_output_text_token` | `1k_tokens` | `50` |
| `ai_cached_input_token` | `1k_tokens` | `1` |

AI 默认价格先按基础档位 seed，标准档位后续通过 admin 配置具体模型价。

## 4. 必须使用 SQL RPC 的原因

积分账户更新不能在 service 中用多次 Supabase 调用拼事务。必须由 SQL RPC 在数据库事务内完成：

- 校验余额
- 更新账户
- 写 ledger
- 更新 billing event

否则高并发下会出现余额超扣、冻结不一致、重复扣费。

## 5. RPC 设计

### 5.1 `billing_ensure_account`

用途：确保租户账户存在。

输入：

```sql
p_tenant_id uuid
```

返回：

```text
tenant_credit_accounts row
```

行为：

- 不存在则创建。
- 已存在则返回。
- 不充值、不写 ledger。

### 5.2 `billing_manual_recharge`

用途：平台人工充值。

输入：

```sql
p_tenant_id uuid
p_amount_fen integer
p_credits bigint
p_bonus_credits bigint
p_operator_user_id uuid
p_remark text
p_metadata jsonb
```

行为：

1. 确保账户存在。
2. 生成 `tenant_credit_orders`：
   - `channel = manual`
   - `status = paid`
   - `paid_at = now()`
3. 增加 `tenant_credit_accounts.balance_credits`。
4. 更新 `total_recharged_credits`。
5. 写 `tenant_credit_ledger`：
   - `direction = in`
   - `event_type = manual_recharge`
   - `source_type = tenant_credit_order`
   - `source_id = order.id`
6. 返回订单、账户、流水。

幂等：

- 第一版由后端生成唯一 `order_no`。
- 后续接支付后，以支付订单号做幂等键。

### 5.3 `billing_freeze_credits`

用途：长任务预冻结，例如视频转文本。

输入：

```sql
p_tenant_id uuid
p_change_credits bigint
p_event_type text
p_source_type text
p_source_id text
p_correlation_id uuid
p_remark text
```

行为：

1. 锁定账户行：`for update`。
2. 校验账户 `status = active`。
3. 校验 `balance_credits - frozen_credits >= p_change_credits`。
4. 增加 `frozen_credits`。
5. 写 ledger：
   - `direction = freeze`
6. 返回账户、流水。

错误码：

- `TENANT_CREDITS_INSUFFICIENT`
- `TENANT_BILLING_DISABLED`

### 5.4 `billing_unfreeze_credits`

用途：释放冻结积分。

输入：

```sql
p_tenant_id uuid
p_change_credits bigint
p_event_type text
p_source_type text
p_source_id text
p_correlation_id uuid
p_remark text
```

行为：

1. 锁定账户。
2. `frozen_credits = greatest(frozen_credits - p_change_credits, 0)`。
3. 写 ledger：
   - `direction = unfreeze`
4. 返回账户、流水。

### 5.5 `billing_charge_credits`

用途：直接实扣，不关联 billing event 时使用。

输入：

```sql
p_tenant_id uuid
p_change_credits bigint
p_event_type text
p_source_type text
p_source_id text
p_correlation_id uuid
p_pricing_snapshot jsonb
p_remark text
```

行为：

1. 锁定账户。
2. 校验可用积分充足。
3. 扣减 `balance_credits`。
4. 增加 `total_consumed_credits`。
5. 写 ledger：
   - `direction = out`
6. 返回账户、流水。

### 5.6 `billing_settle_event`

用途：把 `tenant_billing_events` 结算成扣费流水。

输入：

```sql
p_billing_event_id uuid
p_correlation_id uuid
p_operator_user_id uuid null
```

行为：

1. 锁定 billing event。
2. 如果 `status = charged`，直接返回，不重复扣。
3. 如果 `status in ('waived', 'refunded')`，拒绝结算。
4. 锁定账户。
5. 如果账户 `is_test = true`，将 event 标记为 `estimated`，不扣余额。
6. 如果账户可用余额不足：
   - event 标记为 `failed`
   - 写 `failure_code = TENANT_CREDITS_INSUFFICIENT`
   - 不写 out ledger
7. 否则扣 `credits`。
8. 写 ledger：
   - `direction = out`
   - `event_type = billing_charge`
   - `source_type = tenant_billing_event`
   - `source_id = event.id`
9. event 标记为 `charged`。

## 6. 后端模块拆分

建议新增：

```text
apps/api/src/controllers/billing/index.ts
apps/api/src/schema/billing.ts
apps/api/src/repositories/billing.ts
apps/api/src/services/billing.ts
```

职责：

- controller：HTTP 参数校验、权限、ResponseHandler。
- service：业务编排、价格规则匹配、调用 repository/RPC。
- repository：Supabase 表查询和 RPC 调用。

## 7. API 契约

### 7.1 平台接口

#### `GET /platform/billing/summary`

权限：平台超管。

返回：

```json
{
  "summary": {
    "tenant_count": 12,
    "active_account_count": 10,
    "total_balance_credits": 900000,
    "total_frozen_credits": 3000,
    "total_recharged_credits": 1500000,
    "total_consumed_credits": 600000,
    "low_balance_tenant_count": 2
  }
}
```

#### `GET /platform/billing/tenants`

权限：平台超管。

Query：

```text
page
pageSize
keyword
status
low_balance=true|false
```

返回：

```json
{
  "list": [
    {
      "tenant": {
        "id": "uuid",
        "name": "某装修公司",
        "slug": "demo",
        "status": "active"
      },
      "account": {
        "balance_credits": 100000,
        "frozen_credits": 1000,
        "available_credits": 99000,
        "total_recharged_credits": 100000,
        "total_consumed_credits": 0,
        "status": "active",
        "is_test": false
      },
      "recent_usage": {
        "last_30d_consumed_credits": 12000
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
```

#### `POST /platform/billing/tenants/:tenantId/manual-recharge`

权限：平台超管。

Body：

```json
{
  "amount_fen": 10000,
  "credits": 100000,
  "bonus_credits": 0,
  "remark": "线下收款"
}
```

校验：

- `amount_fen >= 10000`
- `credits > 0`
- `bonus_credits >= 0`

返回：

```json
{
  "order": {
    "id": "uuid",
    "order_no": "TC202605120001",
    "status": "paid",
    "channel": "manual",
    "credits": 100000,
    "amount_fen": 10000
  },
  "account": {
    "balance_credits": 100000,
    "frozen_credits": 0,
    "available_credits": 100000
  },
  "ledger": {
    "id": "uuid",
    "direction": "in",
    "change_credits": 100000,
    "event_type": "manual_recharge"
  }
}
```

#### `GET /platform/billing/pricing-rules`

权限：平台超管。

Query：

```text
metric_code
tenant_id
enabled
page
pageSize
```

返回字段：

- `id`
- `tenant_id`
- `metric_code`
- `provider_code`
- `model_code`
- `scene_code`
- `unit_name`
- `unit_price_credits`
- `min_charge_credits`
- `enabled`
- `effective_at`
- `expires_at`
- `priority`
- `version`

#### `POST /platform/billing/pricing-rules`

权限：平台超管。

Body 同 `tenant_pricing_rules` 可写字段。

约束：

- 不允许覆盖旧规则。
- 修改价格应创建新规则或新 version。

#### `PATCH /platform/billing/pricing-rules/:id`

权限：平台超管。

第一版只允许改：

- `enabled`
- `expires_at`
- `priority`
- `min_charge_credits`

不建议直接改历史规则的价格字段。

#### `GET /platform/billing/ledger`

权限：平台超管。

Query：

```text
tenant_id
direction
event_type
date_from
date_to
page
pageSize
```

返回：分页流水。

#### `GET /platform/billing/anomalies`

权限：平台超管。

第一版返回：

- `tenant_billing_events.status = failed`
- AI token 缺失的 estimated/failed event
- 视频时长缺失 event
- 冻结超时 event

### 7.2 租户 admin 接口

#### `GET /billing/account`

权限：租户登录。

返回：

```json
{
  "account": {
    "tenant_id": "uuid",
    "balance_credits": 100000,
    "frozen_credits": 1000,
    "available_credits": 99000,
    "status": "active",
    "is_test": false,
    "last_recharged_at": "2026-05-12T10:00:00Z",
    "last_activity_at": "2026-05-12T10:00:00Z"
  },
  "thresholds": {
    "low_balance_credits": 5000,
    "critical_balance_credits": 1000
  }
}
```

#### `GET /billing/summary`

权限：租户登录。

Query：

```text
date_from
date_to
```

返回：

```json
{
  "range": {
    "date_from": "2026-05-01",
    "date_to": "2026-05-12"
  },
  "summary": {
    "consumed_credits": 12000,
    "ai_credits": 5000,
    "sms_credits": 2000,
    "social_video_credits": 5000
  }
}
```

#### `GET /billing/ledger`

权限：租户登录。

Query：

```text
direction
event_type
date_from
date_to
page
pageSize
```

返回：只返回当前租户流水。

### 7.3 小程序只读接口

第一期小程序不直接充值，只读余额和价格提示。

#### `GET /billing/account`

复用租户 admin 接口，但小程序端只展示：

- `available_credits`
- `status`

如果用户是客户身份，后端必须通过客户项目或客户绑定关系反查 `tenant_id`，前端不能传租户 ID。

#### `GET /billing/feature-estimates`

用途：小程序发起高成本功能前展示价格提示。

返回：

```json
{
  "features": {
    "decoration_qa": {
      "billing_mode": "actual_usage",
      "description": "按实际 token 消耗计费",
      "min_charge_credits": 0
    },
    "social_video_transcription": {
      "billing_mode": "per_minute",
      "description": "60 积分/分钟，按完成后时长向上取整",
      "unit_price_credits": 60,
      "min_charge_credits": 60
    }
  }
}
```

## 8. 统一错误码

后端必须统一使用 `Errors.business` 抛出：

| code | HTTP | 含义 | 前端处理 |
| --- | --- | --- | --- |
| `TENANT_CREDITS_INSUFFICIENT` | 402 | 积分余额不足 | 提示联系管理员充值 |
| `TENANT_BILLING_DISABLED` | 403 | 租户计费账户被禁用 | 提示联系平台处理 |
| `TENANT_PRICING_RULE_MISSING` | 500 | 缺少价格规则 | 提示稍后重试，平台排查 |
| `TENANT_BILLING_EVENT_DUPLICATED` | 409 | 账单事件重复 | 前端不重试，后端幂等处理 |
| `TENANT_BILLING_EVENT_INVALID_STATUS` | 409 | 账单事件状态不允许结算 | 平台排查 |

## 9. 价格规则匹配实现

Service 层新增：

```text
resolvePricingRule(input)
```

输入：

```ts
{
  tenantId?: string | null;
  metricCode: string;
  providerCode?: string | null;
  modelCode?: string | null;
  sceneCode?: string | null;
}
```

匹配顺序：

1. 租户专属价：`tenant_id + metric_code + provider_code + model_code + scene_code`
2. 租户 metric 价：`tenant_id + metric_code`
3. 平台模型价：`metric_code + provider_code + model_code`
4. 平台场景价：`metric_code + scene_code`
5. 平台默认价：`metric_code`

过滤：

- `enabled = true`
- `effective_at <= now()`
- `expires_at is null or expires_at > now()`

排序：

1. 匹配等级优先。
2. `priority` 小的优先。
3. `effective_at` 晚的优先。

命中后必须写入 `pricing_snapshot`，历史账单不回查当前价格规则。

## 10. billing event 生成规则

### 10.1 AI

来源：`ai_call_logs`

条件：

- `status = success`
- `billable = true`
- `tenant_id is not null`
- `total_tokens is not null`

生成：

- `ai_input_text_token`
- `ai_output_text_token`
- 如果 `cached_input_tokens > 0`，生成 `ai_cached_input_token`

第一期状态：

- `AI_CHARGE_ENABLED=false` 时写 `estimated`
- `AI_CHARGE_ENABLED=true` 时调用 `billing_settle_event`

raw usage：

- `tenant_billing_events.raw_usage = ai_call_logs.raw_usage`

### 10.2 短信

来源：`sms_send_logs`

阶段 1 只预留规则，阶段 2 接入。

生成条件：

- `tenant_id is not null`
- `status = success`
- `sms_count > 0`
- `mock / disabled` 不生成扣费事件

### 10.3 视频转文本

来源：`social_video_transcriptions`

阶段 1 只预留规则，阶段 3 接入。

生成条件：

- `tenant_id is not null`
- `status = completed`
- `billable = true`
- `billing_minutes is not null`
- `billed_at is null`

## 11. admin 对接页面

阶段 1 admin 至少新增：

```text
/platform/billing
/platform/billing/tenants
/platform/billing/pricing
/platform/billing/ledger
```

可以第一版合并成一个平台“计费中心”页面，用 tabs 区分：

- 总览
- 租户账户
- 价格规则
- 积分流水

租户侧新增：

```text
/billing
```

展示：

- 当前余额
- 冻结积分
- 可用积分
- 近 30 天消耗
- 最近流水

## 12. 小程序对接

阶段 1 小程序只需要两类接口：

1. `GET /billing/account`
2. `GET /billing/feature-estimates`

交互口径：

- AI：展示“按实际 token 消耗计费”。
- 视频转文本：展示“60 积分/分钟，按完成后时长向上取整”。
- 余额不足：展示“积分余额不足，请联系装修公司管理员充值”。
- 客户身份不允许传 `tenant_id`，必须由后端根据登录态、客户、项目关系推导。

## 13. 验收标准

阶段 1 完成后，必须满足：

1. 平台超管能给租户人工充值。
2. 充值后账户余额增加，流水可查。
3. 重复提交不会重复入账。
4. 租户 admin 能看到余额。
5. 小程序能读取余额和功能价格提示。
6. 价格规则可配置。
7. `ai_call_logs` 能生成 estimated billing event。
8. 所有余额变更都有 `tenant_credit_ledger`。
9. 没有 `available_credits` 冗余字段。
10. API typecheck 和 admin build 通过。

## 14. 阶段 1 不做事项

以下内容不进入阶段 1：

- 第三方支付。
- 积分批次过期。
- 资源包。
- AI 真扣费。
- 短信真实扣费。
- 视频转文本真实扣费。
- 租户级告警阈值。
- 分布式队列。

这些在阶段 2、3、4 后逐步接入。
