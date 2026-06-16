# 装修公司财务系统数据模型和 Migration 方案

日期：2026-06-16

## 1. 范围

本文档只覆盖装修公司项目经营财务的第一阶段数据模型：

- 人工确认项目收款。
- workflow 收款节点先创建 `confirmed` payment，再完成节点。
- 收款和费用打款进入统一财务台账。
- 为未来微信支付预留租户级商户配置和支付渠道字段。

本文档不覆盖平台 SaaS 计费、租户积分/余额、短信/AI 扣费和完整会计总账。

## 2. 当前数据现状

### 2.1 `payments`

现有基础表来自 `supabase/migrations/20260329073030_init_schema.sql`：

```sql
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  amount numeric,
  type varchar(50),
  status varchar(20),
  created_at timestamp default now()
);
```

后续 `supabase/migrations/20260404152711_modify_payments_table.sql` 已补充：

```sql
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS evidence_images jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS handled_by uuid REFERENCES public.employees(id),
ADD COLUMN IF NOT EXISTS pay_date timestamptz DEFAULT now();
```

`supabase/migrations/20260610190000_add_payment_collection_workflow_index.sql` 已有收款节点查询索引：

```sql
CREATE INDEX IF NOT EXISTS idx_payments_project_type_status
ON public.payments(project_id, type, status);
```

第一阶段不重建 `payments`，继续把它作为项目收款事实表。

### 2.2 `payments` 当前缺口

- API schema 目前没有开放 `evidence_images`、`handled_by`、`pay_date`。
- 外部接口和小程序语义更适合使用 `paid_at`，但数据库当前字段名是 `pay_date`。
- 没有 `workflow_task_id`，无法用流程待办做幂等。
- 没有 `source_type/source_id`，无法统一人工、workflow、微信支付回调等来源。
- 没有 `remark`、`payment_channel`、`provider_transaction_id` 等审计字段。
- `payments` 没有 `tenant_id`，当前需要通过 `project_id -> projects.tenant_id` 推导租户。

第一阶段策略：

- 数据库继续保留 `pay_date` 字段，API 和 workflow output 使用 `paid_at`，service 层映射到 `pay_date`。
- 不给 `payments` 补 `tenant_id`，避免扩大历史数据改造范围；财务台账表持有 `tenant_id`，用于列表和统计。
- 给 `payments` 增加 workflow、来源、渠道和备注字段。

### 2.3 费用打款

费用申请已具备 `expense_request_settlements`：

- `expense_request_id`
- `paid_amount`
- `paid_at`
- `paid_by`
- `evidence_images`
- `tenant_id`

`supabase/migrations/20260529143000_harden_expense_request_approval_idempotency.sql` 已建立每个费用申请一条 settlement 的唯一索引：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS expense_request_settlements_request_unique
ON public.expense_request_settlements(expense_request_id);
```

第一阶段不改费用申请主链路，只把已经打款的 settlement 写入财务台账。

### 2.4 权限

`packages/domain/src/permission.ts` 目前没有 `finance.*`。第一阶段需要新增：

- `finance.view`
- `finance.payment.create`
- `finance.payment.confirm`
- `finance.expense.review`
- `finance.expense.pay`
- `finance.ledger.view`
- `finance.dashboard.view`

workflow task 可见性已经支持 `assignee_permission_code`，后续 payment collection 节点应使用 `finance.payment.confirm`。

## 3. 第一阶段 Migration

建议使用一个可审查、可回滚的 migration：

```text
supabase/migrations/20260616170000_decoration_finance_phase1.sql
```

这个 migration 只做向前兼容变更：

- 新增权限初始化数据。
- 给 `payments` 补充 nullable 字段、索引和幂等约束。
- 新建 `finance_ledger_entries`。
- 新建 `tenant_payment_configs` 空壳表，默认禁用。
- 对既有 confirmed 收款和已打款费用做一次幂等台账回填。

## 4. `payments` 增量字段

第一阶段给 `payments` 增加以下字段：

```sql
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS workflow_task_id uuid NULL REFERENCES public.workflow_tasks(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS source_type text NULL,
ADD COLUMN IF NOT EXISTS source_id uuid NULL,
ADD COLUMN IF NOT EXISTS remark text NULL,
ADD COLUMN IF NOT EXISTS payment_channel text NOT NULL DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS provider text NULL,
ADD COLUMN IF NOT EXISTS provider_transaction_id text NULL,
ADD COLUMN IF NOT EXISTS out_trade_no text NULL;
```

字段说明：

| 字段 | 第一阶段用途 |
| --- | --- |
| `workflow_task_id` | payment collection 待办完成的幂等键。 |
| `source_type` | `manual`、`workflow_task`、`wechat_pay_callback` 等来源类型。 |
| `source_id` | 来源业务 ID。workflow 来源使用 task id，微信支付来源使用支付订单或回调事件 ID。 |
| `remark` | 财务备注。 |
| `payment_channel` | 第一阶段为 `manual`；未来可为 `wechat_pay`、`bank_transfer` 等。 |
| `provider` | 第三方支付提供方，微信支付为 `wechat_pay`。 |
| `provider_transaction_id` | 第三方支付交易号。 |
| `out_trade_no` | 平台侧商户订单号。 |

建议索引和约束：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS payments_workflow_task_unique_idx
ON public.payments(workflow_task_id)
WHERE workflow_task_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_transaction_unique_idx
ON public.payments(provider, provider_transaction_id)
WHERE provider IS NOT NULL AND provider_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_out_trade_no_unique_idx
ON public.payments(out_trade_no)
WHERE out_trade_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_source_idx
ON public.payments(source_type, source_id)
WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_pay_date_idx
ON public.payments(pay_date DESC);
```

第一阶段不直接重命名 `pay_date`。service 层提供 `paid_at` 外部语义，写库时落到 `pay_date`。

## 5. `finance_ledger_entries`

财务台账是统一统计事实表，但不是完整会计总账。它记录“已确认发生”的经营资金流。

建表建议：

```sql
CREATE TABLE IF NOT EXISTS public.finance_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL,
  direction text NOT NULL,
  entry_type text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'CNY',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  workflow_task_id uuid NULL REFERENCES public.workflow_tasks(id) ON DELETE SET NULL,
  payment_id uuid NULL REFERENCES public.payments(id) ON DELETE SET NULL,
  expense_request_id uuid NULL REFERENCES public.expense_requests(id) ON DELETE SET NULL,
  expense_settlement_id uuid NULL REFERENCES public.expense_request_settlements(id) ON DELETE SET NULL,
  handled_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  summary text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_ledger_entries_direction_check
    CHECK (direction IN ('in', 'out')),
  CONSTRAINT finance_ledger_entries_entry_type_check
    CHECK (entry_type IN ('project_payment', 'expense_settlement', 'refund', 'adjustment')),
  CONSTRAINT finance_ledger_entries_amount_check
    CHECK (amount > 0),
  CONSTRAINT finance_ledger_entries_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);
```

幂等约束：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS finance_ledger_entries_source_unique_idx
ON public.finance_ledger_entries(tenant_id, source_type, source_id, entry_type);
```

查询索引：

```sql
CREATE INDEX IF NOT EXISTS finance_ledger_entries_tenant_occurred_idx
ON public.finance_ledger_entries(tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS finance_ledger_entries_project_occurred_idx
ON public.finance_ledger_entries(project_id, occurred_at DESC)
WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_ledger_entries_tenant_type_occurred_idx
ON public.finance_ledger_entries(tenant_id, entry_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS finance_ledger_entries_workflow_task_idx
ON public.finance_ledger_entries(workflow_task_id)
WHERE workflow_task_id IS NOT NULL;
```

触发器：

```sql
DROP TRIGGER IF EXISTS tr_finance_ledger_entries_updated_at
ON public.finance_ledger_entries;

CREATE TRIGGER tr_finance_ledger_entries_updated_at
  BEFORE UPDATE ON public.finance_ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

如果目标库没有 `public.update_updated_at_column()`，migration 需要先复用项目里已有定义；不要重复创建同名逻辑。

## 6. `tenant_payment_configs`

这个表第一阶段只建空壳，不启用真实微信支付。目的是把“平台统一支付网关、租户独立商户/子商户配置”的原则落到数据边界。

建表建议：

```sql
CREATE TABLE IF NOT EXISTS public.tenant_payment_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  merchant_mode text NOT NULL,
  merchant_id text NULL,
  sub_merchant_id text NULL,
  app_id text NULL,
  sub_app_id text NULL,
  status text NOT NULL DEFAULT 'disabled',
  enabled_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  settlement_account_summary text NULL,
  encrypted_config_ref text NULL,
  risk_switches jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  enabled_at timestamptz NULL,
  disabled_at timestamptz NULL,
  CONSTRAINT tenant_payment_configs_provider_check
    CHECK (provider IN ('wechat_pay')),
  CONSTRAINT tenant_payment_configs_merchant_mode_check
    CHECK (merchant_mode IN ('service_provider_sub_merchant', 'direct_merchant')),
  CONSTRAINT tenant_payment_configs_status_check
    CHECK (status IN ('disabled', 'pending', 'active', 'suspended')),
  CONSTRAINT tenant_payment_configs_channels_array_check
    CHECK (jsonb_typeof(enabled_channels) = 'array'),
  CONSTRAINT tenant_payment_configs_risk_switches_object_check
    CHECK (jsonb_typeof(risk_switches) = 'object')
);
```

索引：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS tenant_payment_configs_provider_unique_idx
ON public.tenant_payment_configs(tenant_id, provider);

CREATE INDEX IF NOT EXISTS tenant_payment_configs_status_idx
ON public.tenant_payment_configs(status);
```

敏感信息原则：

- 不在明文 JSON 里保存证书、私钥、API v3 key。
- `encrypted_config_ref` 保存密钥管理系统引用或加密后的配置引用。
- `settlement_account_summary` 只保存脱敏摘要。

## 7. 权限初始化

Migration 需要插入 `finance.*` 权限：

```sql
INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  ('finance.view', '查看财务模块', 'finance', 'finance', 'view', '查看装修公司经营财务模块', 'active'),
  ('finance.payment.create', '登记项目收款', 'finance', 'payment', 'create', '登记项目收款记录', 'active'),
  ('finance.payment.confirm', '确认项目收款', 'finance', 'payment', 'confirm', '确认项目收款并推进收款节点', 'active'),
  ('finance.expense.review', '财务审核费用', 'finance', 'expense', 'review', '财务审核费用申请', 'active'),
  ('finance.expense.pay', '登记费用打款', 'finance', 'expense', 'pay', '登记费用打款和凭证', 'active'),
  ('finance.ledger.view', '查看财务台账', 'finance', 'ledger', 'view', '查看收付款台账', 'active'),
  ('finance.dashboard.view', '查看财务看板', 'finance', 'dashboard', 'view', '查看财务经营看板', 'active')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    module = EXCLUDED.module,
    resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    description = EXCLUDED.description,
    status = 'active';
```

角色授权建议：

- 不在 migration 里强行给所有角色授权 `finance.*`。
- 如果库中已有 `finance` 或 `finance_base` 角色，可以把 `finance.payment.confirm`、`finance.ledger.view`、`finance.view` 授给这些角色。
- 没有财务角色时，由 Admin 角色权限页配置，避免把财务权限扩散给默认员工角色。

## 8. 历史数据回填

### 8.1 confirmed 收款回填

对既有 `payments.status = 'confirmed'` 且可关联项目租户的记录，回填 `project_payment` 台账：

```sql
INSERT INTO public.finance_ledger_entries (
  tenant_id,
  project_id,
  direction,
  entry_type,
  amount,
  occurred_at,
  source_type,
  source_id,
  workflow_task_id,
  payment_id,
  handled_by,
  summary,
  metadata
)
SELECT
  projects.tenant_id,
  payments.project_id,
  'in',
  'project_payment',
  payments.amount,
  COALESCE(payments.pay_date, payments.created_at, now()),
  'payment',
  payments.id,
  payments.workflow_task_id,
  payments.id,
  payments.handled_by,
  '项目收款入账',
  jsonb_build_object(
    'payment_type', payments.type,
    'payment_status', payments.status,
    'backfilled', true
  )
FROM public.payments
JOIN public.projects ON projects.id = payments.project_id
WHERE payments.status = 'confirmed'
  AND payments.amount IS NOT NULL
  AND payments.amount > 0
  AND projects.tenant_id IS NOT NULL
ON CONFLICT (tenant_id, source_type, source_id, entry_type) DO NOTHING;
```

### 8.2 费用打款回填

对已存在的费用打款 settlement，回填 `expense_settlement` 台账：

```sql
INSERT INTO public.finance_ledger_entries (
  tenant_id,
  project_id,
  direction,
  entry_type,
  amount,
  occurred_at,
  source_type,
  source_id,
  expense_request_id,
  expense_settlement_id,
  handled_by,
  summary,
  metadata
)
SELECT
  settlements.tenant_id,
  requests.project_id,
  'out',
  'expense_settlement',
  settlements.paid_amount,
  COALESCE(settlements.paid_at, settlements.created_at, now()),
  'expense_settlement',
  settlements.id,
  settlements.expense_request_id,
  settlements.id,
  settlements.paid_by,
  '费用打款',
  jsonb_build_object(
    'expense_request_id', settlements.expense_request_id,
    'backfilled', true
  )
FROM public.expense_request_settlements settlements
JOIN public.expense_requests requests ON requests.id = settlements.expense_request_id
WHERE settlements.tenant_id IS NOT NULL
  AND settlements.paid_amount IS NOT NULL
  AND settlements.paid_amount > 0
ON CONFLICT (tenant_id, source_type, source_id, entry_type) DO NOTHING;
```

## 9. 应用层字段约定

### 9.1 workflow 收款完成 output

`POST /workflow-tasks/:taskId/complete` 的收款节点 output 使用：

```json
{
  "payment_status": "success",
  "amount": 10000,
  "paid_at": "2026-06-16T10:00:00.000Z",
  "evidence_images": [
    {
      "url": "https://example.com/payment.jpg",
      "name": "payment.jpg"
    }
  ],
  "remark": "中期款已入账"
}
```

后端字段映射：

| output 字段 | `payments` 字段 |
| --- | --- |
| `amount` | `amount` |
| `paid_at` | `pay_date` |
| `evidence_images` | `evidence_images` |
| `remark` | `remark` |
| 当前员工 ID | `handled_by` |
| task id | `workflow_task_id`、`source_id` |
| 固定值 `workflow_task` | `source_type` |
| 固定值 `manual` | `payment_channel` |

### 9.2 台账写入来源

| 业务动作 | `direction` | `entry_type` | `source_type` | `source_id` |
| --- | --- | --- | --- | --- |
| 项目收款确认 | `in` | `project_payment` | `payment` 或 `workflow_task` | `payments.id` 或 task id |
| 费用打款 | `out` | `expense_settlement` | `expense_settlement` | settlement id |
| 退款 | `out` | `refund` | `payment_refund` | refund id |
| 财务调整 | `in/out` | `adjustment` | `manual_adjustment` | adjustment id |

第一阶段只实现 `project_payment` 和 `expense_settlement`。

## 10. 性能边界

- 台账列表必须分页，默认 `page=1&pageSize=20`，最大 `pageSize=100`。
- `finance_ledger_entries` 列表按 `tenant_id + occurred_at desc` 查询，不允许无范围全表扫描。
- 项目财务汇总优先从 `finance_ledger_entries` 按 `project_id` 聚合，避免每次分别扫 `payments` 和 `expense_request_settlements`。
- `payments` 继续使用 `idx_payments_project_type_status` 支撑 payment collection gate。
- 统计接口第一阶段只做当前租户和指定项目范围，不做跨租户统计。

## 11. 回滚方案

第一阶段 migration 全部是向前兼容变更。回滚策略：

1. 代码回滚后，新增字段和表可保留，不影响旧逻辑。
2. 如果必须回滚数据库，先停用新入口，再执行反向 migration：
   - 删除 `finance_ledger_entries`。
   - 删除 `tenant_payment_configs`。
   - 删除 `payments` 新增索引。
   - 删除 `payments` 新增 nullable 字段。
   - 将 `finance.*` 权限状态改为 `inactive`。
3. 不删除既有 `payments`、`expense_requests`、`expense_request_settlements` 数据。

## 12. 验证清单

应用 migration 前：

```bash
supabase migration list
```

检查历史 `payments` 是否存在异常状态：

```sql
SELECT status, count(*)
FROM public.payments
GROUP BY status
ORDER BY status;
```

检查历史 `payments` 是否存在无法关联租户的 confirmed 收款：

```sql
SELECT payments.id, payments.project_id
FROM public.payments
LEFT JOIN public.projects ON projects.id = payments.project_id
WHERE payments.status = 'confirmed'
  AND projects.tenant_id IS NULL
LIMIT 50;
```

应用后验证：

```bash
supabase migration list
```

```sql
SELECT code
FROM public.permissions
WHERE code LIKE 'finance.%'
ORDER BY code;
```

```sql
SELECT entry_type, direction, count(*), sum(amount)
FROM public.finance_ledger_entries
GROUP BY entry_type, direction
ORDER BY entry_type, direction;
```

```sql
SELECT count(*)
FROM public.tenant_payment_configs;
```

