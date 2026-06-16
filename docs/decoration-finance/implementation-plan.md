# Decoration Finance Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable decoration company finance loop: finance users confirm project payment collection tasks, the backend creates a confirmed payment, writes finance ledger entries, and then completes the workflow task.

**Architecture:** The workflow task complete endpoint remains the main entry point for payment collection. A new payment bridge handles `project + payment_collection` tasks before generic runtime completion, writes `payments` and `finance_ledger_entries` idempotently, then calls the existing workflow runtime RPC. Admin uses the same backend contract; the mini-program receives the same task action metadata and does not call `/payments` directly for workflow payment collection.

**Tech Stack:** Bun, TypeScript, Fastify, Zod, Supabase migrations/RPC, Next.js Admin, shared `@gooes/domain`.

---

## Scope

Phase 1 includes:

- `finance.*` permissions.
- `payments` API/schema support for evidence, handler, paid time, remark and workflow idempotency.
- `finance_ledger_entries`.
- `tenant_payment_configs` shell table for future WeChat Pay.
- `workflow-task-payment-bridge`.
- Finance ledger list endpoint with pagination.
- Admin finance menu and manual confirmation path through workflow task completion.
- Mini-program handoff contract captured in docs, without editing `/Users/leefo/Public/work/orange`.

Phase 1 excludes:

- Receivable plan and overdue management.
- Supplier and invoice modules.
- Real WeChat Pay order creation, callback verification, refund and transfer.
- Full accounting vouchers and legal financial statements.

## File Map

Database:

- Create: `supabase/migrations/20260616170000_decoration_finance_phase1.sql`
- Generate after migration: `apps/api/src/types/database.ts`

Shared domain:

- Modify: `packages/domain/src/permission.ts`

API:

- Modify: `apps/api/src/schema/payment.ts`
- Modify: `apps/api/src/repositories/payments.ts`
- Modify: `apps/api/src/services/payments.ts`
- Create: `apps/api/src/schema/finance.ts`
- Create: `apps/api/src/repositories/finance-ledger.ts`
- Create: `apps/api/src/services/finance-ledger.ts`
- Create: `apps/api/src/services/workflow-task-payment-bridge.ts`
- Modify: `apps/api/src/services/workflow-tasks.ts`
- Modify: `apps/api/src/services/workflow-task-action-metadata.ts`
- Create: `apps/api/src/controllers/finance/index.ts`
- Modify: `apps/api/src/routes/index.ts`

API tests:

- Create: `apps/api/src/services/workflow-task-payment-bridge.test.ts`
- Modify: `apps/api/src/services/workflow-tasks.test.ts`
- Modify: `apps/api/src/services/workflow-task-action-metadata.test.ts`

Admin:

- Modify: `apps/admin/components/layout/menu-config.ts`
- Modify: `apps/admin/components/projects/project-payment-requests.ts`
- Modify: `apps/admin/components/projects/project-workflow-payment-gate.tsx`
- Create: `apps/admin/app/(console)/finance/page.tsx`
- Create: `apps/admin/app/(console)/finance/ledger/page.tsx`
- Create: `apps/admin/components/finance/finance-ledger-table.tsx`
- Create: `apps/admin/components/finance/finance-requests.ts`

Docs:

- Create: `docs/decoration-finance/miniprogram-handoff.md`
- Modify: `docs/decoration-finance/README.md`

## Task 1: Migration and Permissions

**Files:**
- Create: `supabase/migrations/20260616170000_decoration_finance_phase1.sql`
- Modify: `packages/domain/src/permission.ts`
- Generate: `apps/api/src/types/database.ts`

- [ ] **Step 1: Run migration preflight checks**

Run:

```bash
supabase migration list
```

Run:

```bash
supabase db query --linked "select status, count(*) from public.payments group by status order by status;"
```

Run:

```bash
supabase db query --linked "select payments.id, payments.project_id from public.payments left join public.projects on projects.id = payments.project_id where payments.status = 'confirmed' and projects.tenant_id is null limit 50;"
```

Expected:

- Migration list shows local and remote state before the new migration.
- The orphan confirmed payment query returns `0` rows. If rows exist, stop and decide whether to repair those project links before applying the finance ledger backfill.

- [ ] **Step 2: Add database migration**

Create `supabase/migrations/20260616170000_decoration_finance_phase1.sql` with the SQL from [data-model-and-migrations.md](./data-model-and-migrations.md):

```sql
-- Decoration finance phase 1: permissions, payment idempotency fields, ledger, tenant payment config shell.

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

ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS workflow_task_id uuid NULL REFERENCES public.workflow_tasks(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS source_type text NULL,
ADD COLUMN IF NOT EXISTS source_id uuid NULL,
ADD COLUMN IF NOT EXISTS remark text NULL,
ADD COLUMN IF NOT EXISTS payment_channel text NOT NULL DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS provider text NULL,
ADD COLUMN IF NOT EXISTS provider_transaction_id text NULL,
ADD COLUMN IF NOT EXISTS out_trade_no text NULL;

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
  CONSTRAINT finance_ledger_entries_direction_check CHECK (direction IN ('in', 'out')),
  CONSTRAINT finance_ledger_entries_entry_type_check CHECK (entry_type IN ('project_payment', 'expense_settlement', 'refund', 'adjustment')),
  CONSTRAINT finance_ledger_entries_amount_check CHECK (amount > 0),
  CONSTRAINT finance_ledger_entries_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_ledger_entries_source_unique_idx
ON public.finance_ledger_entries(tenant_id, source_type, source_id, entry_type);

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

DROP TRIGGER IF EXISTS tr_finance_ledger_entries_updated_at ON public.finance_ledger_entries;
CREATE TRIGGER tr_finance_ledger_entries_updated_at
  BEFORE UPDATE ON public.finance_ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

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
  CONSTRAINT tenant_payment_configs_provider_check CHECK (provider IN ('wechat_pay')),
  CONSTRAINT tenant_payment_configs_merchant_mode_check CHECK (merchant_mode IN ('service_provider_sub_merchant', 'direct_merchant')),
  CONSTRAINT tenant_payment_configs_status_check CHECK (status IN ('disabled', 'pending', 'active', 'suspended')),
  CONSTRAINT tenant_payment_configs_channels_array_check CHECK (jsonb_typeof(enabled_channels) = 'array'),
  CONSTRAINT tenant_payment_configs_risk_switches_object_check CHECK (jsonb_typeof(risk_switches) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_payment_configs_provider_unique_idx
ON public.tenant_payment_configs(tenant_id, provider);

CREATE INDEX IF NOT EXISTS tenant_payment_configs_status_idx
ON public.tenant_payment_configs(status);

DROP TRIGGER IF EXISTS tr_tenant_payment_configs_updated_at ON public.tenant_payment_configs;
CREATE TRIGGER tr_tenant_payment_configs_updated_at
  BEFORE UPDATE ON public.tenant_payment_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.finance_ledger_entries (
  tenant_id, project_id, direction, entry_type, amount, occurred_at,
  source_type, source_id, workflow_task_id, payment_id, handled_by, summary, metadata
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
  jsonb_build_object('payment_type', payments.type, 'payment_status', payments.status, 'backfilled', true)
FROM public.payments
JOIN public.projects ON projects.id = payments.project_id
WHERE payments.status = 'confirmed'
  AND payments.amount IS NOT NULL
  AND payments.amount > 0
  AND projects.tenant_id IS NOT NULL
ON CONFLICT (tenant_id, source_type, source_id, entry_type) DO NOTHING;

INSERT INTO public.finance_ledger_entries (
  tenant_id, project_id, direction, entry_type, amount, occurred_at,
  source_type, source_id, expense_request_id, expense_settlement_id, handled_by, summary, metadata
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
  jsonb_build_object('expense_request_id', settlements.expense_request_id, 'backfilled', true)
FROM public.expense_request_settlements settlements
JOIN public.expense_requests requests ON requests.id = settlements.expense_request_id
WHERE settlements.tenant_id IS NOT NULL
  AND settlements.paid_amount IS NOT NULL
  AND settlements.paid_amount > 0
ON CONFLICT (tenant_id, source_type, source_id, entry_type) DO NOTHING;
```

- [ ] **Step 3: Update shared permission constants**

Modify `packages/domain/src/permission.ts`.

Add these entries to `PERMISSION_CODE_VALUES` after `expense_request.pay`:

```typescript
  'finance.view',
  'finance.payment.create',
  'finance.payment.confirm',
  'finance.expense.review',
  'finance.expense.pay',
  'finance.ledger.view',
  'finance.dashboard.view',
```

Add these entries to `PermissionCodeConfig`:

```typescript
  'finance.view': { label: '查看财务模块', module: 'finance' },
  'finance.payment.create': { label: '登记项目收款', module: 'finance' },
  'finance.payment.confirm': { label: '确认项目收款', module: 'finance' },
  'finance.expense.review': { label: '财务审核费用', module: 'finance' },
  'finance.expense.pay': { label: '登记费用打款', module: 'finance' },
  'finance.ledger.view': { label: '查看财务台账', module: 'finance' },
  'finance.dashboard.view': { label: '查看财务看板', module: 'finance' },
```

- [ ] **Step 4: Apply migration and regenerate Supabase types**

Run:

```bash
supabase db push
```

Run:

```bash
bun run gen
```

Expected:

- New migration appears as applied.
- `apps/api/src/types/database.ts` includes `finance_ledger_entries`, `tenant_payment_configs`, and new `payments` columns.

- [ ] **Step 5: Verify migration status**

Run:

```bash
supabase migration list
```

Run:

```bash
supabase db query --linked "select code from public.permissions where code like 'finance.%' order by code;"
```

Run:

```bash
supabase db query --linked "select entry_type, direction, count(*), sum(amount) from public.finance_ledger_entries group by entry_type, direction order by entry_type, direction;"
```

Expected:

- Local/remote migrations align.
- Seven `finance.*` permission rows are active.
- Ledger query returns zero or more grouped rows without error.

Commit:

```bash
git add supabase/migrations/20260616170000_decoration_finance_phase1.sql packages/domain/src/permission.ts apps/api/src/types/database.ts
git commit -m "feat: add decoration finance data model"
```

## Task 2: Payment Schema and Ledger API

**Files:**
- Modify: `apps/api/src/schema/payment.ts`
- Modify: `apps/api/src/repositories/payments.ts`
- Modify: `apps/api/src/services/payments.ts`
- Create: `apps/api/src/schema/finance.ts`
- Create: `apps/api/src/repositories/finance-ledger.ts`
- Create: `apps/api/src/services/finance-ledger.ts`
- Create: `apps/api/src/controllers/finance/index.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Extend payment schema**

In `apps/api/src/schema/payment.ts`, extend `PaymentBaseSchema` with:

```typescript
  evidence_images: z.array(z.unknown()).default([]).optional(),
  handled_by: z.uuid('请选择有效的经办人').nullable().optional(),
  pay_date: z.string().datetime('无效的入账时间').nullable().optional(),
  paid_at: z.string().datetime('无效的入账时间').nullable().optional(),
  workflow_task_id: z.uuid('无效的流程待办 ID').nullable().optional(),
  source_type: z.string().trim().max(100, '来源类型过长').nullable().optional(),
  source_id: z.uuid('无效的来源 ID').nullable().optional(),
  remark: z.string().trim().max(500, '备注不能超过 500 个字符').nullable().optional(),
  payment_channel: z.string().trim().max(50, '收款渠道过长').default('manual'),
  provider: z.string().trim().max(50, '支付提供方过长').nullable().optional(),
  provider_transaction_id: z.string().trim().max(100, '支付交易号过长').nullable().optional(),
  out_trade_no: z.string().trim().max(100, '商户订单号过长').nullable().optional(),
```

Keep `CreatePaymentSchema` as an omit of `id` and `created_at`, but service must normalize `paid_at` into `pay_date` before repository writes.

- [ ] **Step 2: Update payment repository types and select**

In `apps/api/src/repositories/payments.ts`, extend `PaymentRecord` with:

```typescript
  workflow_task_id?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  remark?: string | null;
  payment_channel?: string | null;
  provider?: string | null;
  provider_transaction_id?: string | null;
  out_trade_no?: string | null;
```

Add:

```typescript
  async findByWorkflowTaskId(workflowTaskId: string): Promise<PaymentRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("payments")
      .select(this.paymentSelect)
      .eq("workflow_task_id", workflowTaskId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询流程收款记录失败", error);
    }

    return (data as unknown as PaymentRecord | null) ?? null;
  }
```

- [ ] **Step 3: Normalize `paid_at` in payment service**

In `apps/api/src/services/payments.ts`, add a private normalizer:

```typescript
  private normalizePaymentInput<T extends CreatePaymentInput | UpdatePaymentInput>(
    input: T,
  ): T {
    const normalized = { ...input } as T & { paid_at?: string | null; pay_date?: string | null };
    if (normalized.paid_at && !normalized.pay_date) {
      normalized.pay_date = normalized.paid_at;
    }
    delete normalized.paid_at;
    return normalized as T;
  }
```

Use it in `createPayment` and `updatePayment` before calling the repository.

- [ ] **Step 4: Add finance query schema**

Create `apps/api/src/schema/finance.ts`:

```typescript
import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";

export const FinanceLedgerListQuerySchema = PaginationQuerySchema.extend({
  project_id: z.uuid("请选择有效的项目").optional(),
  direction: z.enum(["in", "out"], { message: "无效的流水方向" }).optional(),
  entry_type: z.enum(["project_payment", "expense_settlement", "refund", "adjustment"], {
    message: "无效的流水类型",
  }).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "开始日期格式必须为 YYYY-MM-DD").optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "结束日期格式必须为 YYYY-MM-DD").optional(),
});

export type FinanceLedgerListQuery = z.infer<typeof FinanceLedgerListQuerySchema>;
```

- [ ] **Step 5: Add finance ledger repository**

Create `apps/api/src/repositories/finance-ledger.ts` with paginated list and idempotent insert:

```typescript
import { Errors } from "@/errors/error-factory";
import type { FinanceLedgerListQuery } from "@/schema/finance";
import { SupabaseDB } from "@/utils/supabase/index";

export type FinanceLedgerEntryInput = {
  tenant_id: string;
  project_id?: string | null;
  direction: "in" | "out";
  entry_type: "project_payment" | "expense_settlement" | "refund" | "adjustment";
  amount: number;
  occurred_at: string;
  source_type: string;
  source_id: string;
  workflow_task_id?: string | null;
  payment_id?: string | null;
  expense_request_id?: string | null;
  expense_settlement_id?: string | null;
  handled_by?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
};

class FinanceLedgerRepository {
  private select = `
    *,
    project:projects(id, name, status),
    handler:employees!finance_ledger_entries_handled_by_fkey(id, name, phone)
  `;

  async list(tenantId: string, query: FinanceLedgerListQuery) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let request = SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .select(this.select, { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("occurred_at", { ascending: false });

    if (query.project_id) request = request.eq("project_id", query.project_id);
    if (query.direction) request = request.eq("direction", query.direction);
    if (query.entry_type) request = request.eq("entry_type", query.entry_type);
    if (query.date_from) request = request.gte("occurred_at", `${query.date_from}T00:00:00.000Z`);
    if (query.date_to) request = request.lte("occurred_at", `${query.date_to}T23:59:59.999Z`);

    const { data, error, count } = await request.range(from, to);
    if (error) throw Errors.dbError("查询财务台账失败", error);

    return {
      list: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async createIdempotent(input: FinanceLedgerEntryInput) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .upsert(input, {
        onConflict: "tenant_id,source_type,source_id,entry_type",
        ignoreDuplicates: false,
      })
      .select(this.select)
      .single();

    if (error) throw Errors.dbError("写入财务台账失败", error);
    return data;
  }
}

export const financeLedgerRepository = new FinanceLedgerRepository();
```

- [ ] **Step 6: Add finance ledger service**

Create `apps/api/src/services/finance-ledger.ts`:

```typescript
import { Errors } from "@/errors/error-factory";
import { financeLedgerRepository, type FinanceLedgerEntryInput } from "@/repositories/finance-ledger";
import type { FinanceLedgerListQuery } from "@/schema/finance";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

class FinanceLedgerService {
  async listLedger(authContext: AuthContext, query: FinanceLedgerListQuery) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const allowed = authContext.permissions.some((permission) =>
      permission.code === "finance.ledger.view" || permission.code === "finance.view"
    );
    if (!allowed) throw Errors.forbidden();
    return financeLedgerRepository.list(tenantId, query);
  }

  async createProjectPaymentLedger(input: FinanceLedgerEntryInput) {
    return financeLedgerRepository.createIdempotent(input);
  }
}

export const financeLedgerService = new FinanceLedgerService();
```

- [ ] **Step 7: Add finance controller and routes**

Create `apps/api/src/controllers/finance/index.ts`:

```typescript
import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import { FinanceLedgerListQuerySchema } from "@/schema/finance";
import { financeLedgerService } from "@/services/finance-ledger";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class FinanceController extends TenantBaseController {
  constructor() {
    super("finance");
  }

  @Get("/finance/ledger")
  async listLedger(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = FinanceLedgerListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const data = await financeLedgerService.listLedger(authContext, queryResult.data);
    return ResponseHandler.success(data);
  }
}

export default new FinanceController();
```

In `apps/api/src/routes/index.ts`, import and register:

```typescript
import FinanceController from "@/controllers/finance";
```

```typescript
  FinanceController.registerExtraRoutes(app);
```

- [ ] **Step 8: Verify API type safety**

Run:

```bash
bun run api:typecheck
```

Expected: exit code `0`.

Commit:

```bash
git add apps/api/src/schema/payment.ts apps/api/src/repositories/payments.ts apps/api/src/services/payments.ts apps/api/src/schema/finance.ts apps/api/src/repositories/finance-ledger.ts apps/api/src/services/finance-ledger.ts apps/api/src/controllers/finance/index.ts apps/api/src/routes/index.ts
git commit -m "feat: expose decoration finance ledger api"
```

## Task 3: Workflow Payment Bridge

**Files:**
- Create: `apps/api/src/services/workflow-task-payment-bridge.ts`
- Modify: `apps/api/src/services/workflow-tasks.ts`
- Modify: `apps/api/src/services/workflow-task-action-metadata.ts`
- Create: `apps/api/src/services/workflow-task-payment-bridge.test.ts`
- Modify: `apps/api/src/services/workflow-tasks.test.ts`
- Modify: `apps/api/src/services/workflow-task-action-metadata.test.ts`

- [ ] **Step 1: Add payment collection output fields**

In `apps/api/src/services/workflow-task-action-metadata.ts`, update `buildPaymentCollectionActions` so `output_fields` includes:

```typescript
        {
          name: "amount",
          label: "入账金额",
          type: "number",
          required: true,
          payment_type: paymentType,
          payment_label: paymentLabel,
          requirement_mode: requirementMode,
          ...(requiredPercentage !== null ? { required_percentage: requiredPercentage } : {}),
          ...(minAmount !== null ? { min_amount: minAmount } : {}),
        },
        {
          name: "paid_at",
          label: "入账时间",
          type: "datetime",
          required: false,
        },
        {
          name: "evidence_images",
          label: "收款凭证",
          type: "image_list",
          required: true,
          min_image_count: 1,
        },
        {
          name: "remark",
          label: "收款备注",
          type: "string",
          required: false,
        },
```

Keep the existing `payment_status` field for compatibility with current mini-program action renderers.

- [ ] **Step 2: Test payment action metadata**

Modify `apps/api/src/services/workflow-task-action-metadata.test.ts` to assert:

```typescript
expect(action.output_fields).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ name: "amount", required: true, type: "number" }),
    expect.objectContaining({ name: "paid_at", required: false, type: "datetime" }),
    expect.objectContaining({ name: "evidence_images", required: true, type: "image_list", min_image_count: 1 }),
    expect.objectContaining({ name: "remark", required: false, type: "string" }),
  ]),
);
```

Run:

```bash
cd apps/api && bun test src/services/workflow-task-action-metadata.test.ts
```

Expected: payment metadata test passes.

- [ ] **Step 3: Add workflow payment bridge**

Create `apps/api/src/services/workflow-task-payment-bridge.ts`:

```typescript
import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import { paymentRepository } from "@/repositories/payments";
import { workflowRepository } from "@/repositories/workflows";
import type { JsonObject, WorkflowRuntimeCompleteNodeResult } from "@/repositories/workflows";
import { financeLedgerService } from "@/services/finance-ledger";
import type { AuthContext } from "@/services/authorization";
import { workflowSubjectStateService } from "@/services/workflow-subject-state";

const PaymentCollectionOutputSchema = z.object({
  payment_status: z.string().trim().optional(),
  amount: z.coerce.number("入账金额必须是数字").positive("入账金额必须大于 0"),
  paid_at: z.string().datetime("无效的入账时间").optional(),
  evidence_images: z.array(z.unknown()).min(1, "请上传收款凭证"),
  remark: z.string().trim().max(500, "收款备注不能超过 500 个字符").optional(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getPaymentType(snapshot: unknown) {
  const config = isRecord(snapshot) && isRecord(snapshot.config) ? snapshot.config : {};
  const type = typeof config.payment_type === "string" ? config.payment_type : "";
  return ["deposit", "stage_1", "stage_2", "stage_3", "add_on"].includes(type)
    ? type
    : "deposit";
}

export type PaymentWorkflowTaskBridgeInput = {
  authContext: AuthContext;
  task: {
    id: string;
    tenant_id: string;
    definition_id: string;
    instance_id: string;
    node_key: string;
    instance: {
      subject_id: string;
      current_node_snapshot: unknown;
    };
  };
  action: string;
  output: Record<string, unknown>;
};

class WorkflowTaskPaymentBridge {
  async complete(input: PaymentWorkflowTaskBridgeInput) {
    if (input.action.trim() !== "complete") return null;
    const snapshot = input.task.instance.current_node_snapshot;
    if (!isRecord(snapshot) || snapshot.business_kind !== "payment_collection") return null;

    const parsed = PaymentCollectionOutputSchema.safeParse(input.output);
    if (!parsed.success) throw Errors.fromZod(parsed.error);

    const existing = await paymentRepository.findByWorkflowTaskId(input.task.id);
    const payment = existing ?? await paymentRepository.create({
      project_id: input.task.instance.subject_id,
      amount: parsed.data.amount,
      type: getPaymentType(snapshot),
      status: "confirmed",
      evidence_images: parsed.data.evidence_images,
      handled_by: input.authContext.employeeId,
      pay_date: parsed.data.paid_at ?? new Date().toISOString(),
      workflow_task_id: input.task.id,
      source_type: "workflow_task",
      source_id: input.task.id,
      remark: parsed.data.remark ?? null,
      payment_channel: "manual",
    });

    await financeLedgerService.createProjectPaymentLedger({
      tenant_id: input.task.tenant_id,
      project_id: input.task.instance.subject_id,
      direction: "in",
      entry_type: "project_payment",
      amount: Number(payment.amount),
      occurred_at: payment.pay_date ?? new Date().toISOString(),
      source_type: "workflow_task",
      source_id: input.task.id,
      workflow_task_id: input.task.id,
      payment_id: payment.id,
      handled_by: input.authContext.employeeId,
      summary: "项目收款入账",
      metadata: {
        payment_type: payment.type,
        payment_channel: payment.payment_channel ?? "manual",
      },
    });

    const result = await workflowRepository.completeRuntimeNode({
      tenantId: input.task.tenant_id,
      definitionId: input.task.definition_id,
      instanceId: input.task.instance_id,
      nodeKey: input.task.node_key,
      action: input.action.trim(),
      output: input.output as JsonObject,
      actorEmployeeId: input.authContext.employeeId,
    });
    this.throwRuntimeCompleteError(result);

    const workflowState = await workflowSubjectStateService.syncFromRuntimeInstance({
      tenantId: input.task.tenant_id,
      subjectType: "project",
      subjectId: input.task.instance.subject_id,
      definitionId: input.task.definition_id,
      instanceId: input.task.instance_id,
    });

    return {
      result: { ok: true, bridged: true, operation: "confirm_payment" },
      payment,
      workflow_state: workflowState,
    };
  }

  private throwRuntimeCompleteError(result: WorkflowRuntimeCompleteNodeResult) {
    if (result.ok) return;
    switch (result.reason) {
      case "instance_not_found":
        throw Errors.notFound("流程实例不存在");
      case "instance_not_running":
        throw Errors.badRequest("流程实例不在运行中");
      case "node_not_current":
        throw Errors.business(409, "节点不是当前待处理节点", "WORKFLOW_NODE_NOT_CURRENT", {
          current_node_key: result.currentNodeKey ?? null,
        });
      case "node_run_not_found":
        throw Errors.badRequest("当前节点运行记录不存在");
      case "graph_invalid":
        throw Errors.badRequest("流程发布版本图结构无效");
      case "invalid_output":
        throw Errors.badRequest("节点输出必须是对象");
      case "no_matching_edge":
        throw Errors.badRequest("当前节点没有匹配的分支条件");
    }
  }
}

export const workflowTaskPaymentBridge = new WorkflowTaskPaymentBridge();
```

- [ ] **Step 4: Wire bridge into workflow task completion**

In `apps/api/src/services/workflow-tasks.ts`, import:

```typescript
import { workflowTaskPaymentBridge } from "@/services/workflow-task-payment-bridge";
```

Inside the `subject_type === "project"` block, call payment bridge before project bridge:

```typescript
    if (task.instance.subject_type === "project") {
      const paymentBridged = await workflowTaskPaymentBridge.complete({
        authContext,
        task: {
          id: task.id,
          tenant_id: task.tenant_id,
          definition_id: task.definition_id,
          instance_id: task.instance_id,
          node_key: task.node_key,
          instance: {
            subject_id: task.instance.subject_id,
            current_node_snapshot: task.instance.current_node_snapshot,
          },
        },
        action: input.action,
        output,
      });
      if (paymentBridged) return paymentBridged;

      const bridged = await workflowTaskProjectBridge.complete({
```

- [ ] **Step 5: Add bridge tests**

Create `apps/api/src/services/workflow-task-payment-bridge.test.ts` with tests for:

```typescript
test("creates confirmed payment, writes ledger, then completes runtime node", async () => {
  // Mock paymentRepository.findByWorkflowTaskId to return null.
  // Mock paymentRepository.create to return a confirmed payment.
  // Mock financeLedgerService.createProjectPaymentLedger.
  // Mock workflowRepository.completeRuntimeNode to return { ok: true }.
  // Assert create is called before completeRuntimeNode by recording call order.
});

test("requires amount and evidence images", async () => {
  // Call bridge with amount 100 and evidence_images [].
  // Expect Zod error from Errors.fromZod.
});

test("reuses existing workflow payment for idempotent retry", async () => {
  // Mock findByWorkflowTaskId to return a payment.
  // Assert paymentRepository.create is not called.
  // Assert ledger and runtime completion are still attempted idempotently.
});
```

- [ ] **Step 6: Update workflow task tests**

Modify `apps/api/src/services/workflow-tasks.test.ts`:

- Replace the old project payment confirmation permission with `finance.payment.confirm`.
- Mock `@/services/workflow-task-payment-bridge`.
- Add a test that a project payment collection task calls `workflowTaskPaymentBridge.complete`.

- [ ] **Step 7: Run workflow tests**

Run:

```bash
cd apps/api && bun test src/services/workflow-task-action-metadata.test.ts src/services/workflow-task-payment-bridge.test.ts src/services/workflow-tasks.test.ts
```

Expected: all selected tests pass.

Commit:

```bash
git add apps/api/src/services/workflow-task-action-metadata.ts apps/api/src/services/workflow-task-action-metadata.test.ts apps/api/src/services/workflow-task-payment-bridge.ts apps/api/src/services/workflow-task-payment-bridge.test.ts apps/api/src/services/workflow-tasks.ts apps/api/src/services/workflow-tasks.test.ts
git commit -m "feat: bridge payment collection workflow tasks"
```

## Task 4: Admin Finance Entry Points

**Files:**
- Modify: `apps/admin/components/layout/menu-config.ts`
- Modify: `apps/admin/components/projects/project-payment-requests.ts`
- Modify: `apps/admin/components/projects/project-workflow-payment-gate.tsx`
- Create: `apps/admin/app/(console)/finance/page.tsx`
- Create: `apps/admin/app/(console)/finance/ledger/page.tsx`
- Create: `apps/admin/components/finance/finance-ledger-table.tsx`
- Create: `apps/admin/components/finance/finance-requests.ts`

- [ ] **Step 1: Add finance menu group**

In `apps/admin/components/layout/menu-config.ts`, create a tenant nav group:

```typescript
  {
    label: "财务",
    items: [
      {
        href: "/finance",
        label: "财务总览",
        icon: CircleDollarSign,
        permission: "finance.dashboard.view",
      },
      {
        href: "/finance/ledger",
        label: "财务台账",
        icon: ScrollText,
        permission: "finance.ledger.view",
      },
      {
        href: "/expenses",
        label: "费用审批",
        icon: CircleDollarSign,
        permission: "finance.expense.review",
      },
    ],
  },
```

Remove the old `/expenses` entry from the `"业务"` group after adding it to `"财务"`.

- [ ] **Step 2: Add finance request client**

Create `apps/admin/components/finance/finance-requests.ts`:

```typescript
import { requestBackendJson } from "@/lib/backend-client";

export type FinanceLedgerRecord = {
  id: string;
  tenant_id: string;
  project_id: string | null;
  direction: "in" | "out";
  entry_type: string;
  amount: number;
  occurred_at: string;
  summary: string | null;
  project?: { id: string; name: string | null; status: string | null } | null;
  handler?: { id: string; name: string | null; phone: string | null } | null;
};

export type FinanceLedgerListData = {
  list: FinanceLedgerRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export async function fetchFinanceLedger(query: { page?: number; pageSize?: number }) {
  const params = new URLSearchParams({
    page: String(query.page ?? 1),
    pageSize: String(query.pageSize ?? 20),
  });
  return requestBackendJson<FinanceLedgerListData>(`/finance/ledger?${params}`, {
    cache: "no-store",
    fallbackMessage: "财务台账加载失败",
  });
}
```

- [ ] **Step 3: Add finance ledger table**

Create `apps/admin/components/finance/finance-ledger-table.tsx` with a compact table using existing UI primitives:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FinanceLedgerRecord } from "@/components/finance/finance-requests";

export function FinanceLedgerTable({ rows }: { rows: FinanceLedgerRecord[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>时间</TableHead>
          <TableHead>项目</TableHead>
          <TableHead>类型</TableHead>
          <TableHead>方向</TableHead>
          <TableHead className="text-right">金额</TableHead>
          <TableHead>经办人</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{new Date(row.occurred_at).toLocaleString("zh-CN")}</TableCell>
            <TableCell>{row.project?.name || "-"}</TableCell>
            <TableCell>{row.summary || row.entry_type}</TableCell>
            <TableCell>
              <Badge variant={row.direction === "in" ? "success" : "secondary"}>
                {row.direction === "in" ? "收入" : "支出"}
              </Badge>
            </TableCell>
            <TableCell className="text-right">¥{Number(row.amount || 0).toFixed(2)}</TableCell>
            <TableCell>{row.handler?.name || "-"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 4: Add finance pages**

Create `apps/admin/app/(console)/finance/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function FinancePage() {
  redirect("/finance/ledger");
}
```

Create `apps/admin/app/(console)/finance/ledger/page.tsx`:

```tsx
import { FinanceLedgerTable } from "@/components/finance/finance-ledger-table";
import { fetchFinanceLedger } from "@/components/finance/finance-requests";

export default async function FinanceLedgerPage() {
  const data = await fetchFinanceLedger({ page: 1, pageSize: 20 });
  return (
    <main className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">财务台账</h1>
        <p className="text-sm text-muted-foreground">项目收款和费用打款流水。</p>
      </div>
      <FinanceLedgerTable rows={data.list} />
    </main>
  );
}
```

- [ ] **Step 5: Adjust project payment gate behavior**

In `apps/admin/components/projects/project-workflow-payment-gate.tsx`:

- Keep summary display using `/payments`.
- Remove or hide the direct `createProjectPayment` button for new payment collection workflow tasks.
- Show a concise hint: `请在待办中心确认收款，确认后流程会自动推进。`

Do not create a second Admin write path that calls `/payments` for workflow collection tasks.

- [ ] **Step 6: Run Admin static checks**

Run:

```bash
bun run admin:check
```

Expected: file size and typecheck pass.

Commit:

```bash
git add apps/admin/components/layout/menu-config.ts apps/admin/components/projects/project-payment-requests.ts apps/admin/components/projects/project-workflow-payment-gate.tsx apps/admin/app/(console)/finance/page.tsx apps/admin/app/(console)/finance/ledger/page.tsx apps/admin/components/finance/finance-ledger-table.tsx apps/admin/components/finance/finance-requests.ts
git commit -m "feat: add decoration finance admin entry"
```

## Task 5: Mini-Program Handoff Document

**Files:**
- Create: `docs/decoration-finance/miniprogram-handoff.md`
- Modify: `docs/decoration-finance/README.md`

- [ ] **Step 1: Create handoff document**

Create `docs/decoration-finance/miniprogram-handoff.md`:

````markdown
# 装修财务小程序对接说明

日期：2026-06-16

## 范围

小程序只对接 workflow task 的收款确认，不直接调用 `/payments` 创建流程收款。

## 收款节点

入口：任务中心返回的 `payment_collection` action。

提交：

```http
POST /workflow-tasks/:taskId/complete
```

请求体：

```json
{
  "action": "complete",
  "output": {
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
}
```

字段要求：

- `amount` 必填，必须大于 0。
- `evidence_images` 必填，至少 1 张。
- `paid_at` 可选，默认后端当前时间。
- `remark` 可选，最多 500 字。

后端行为：

1. 创建或复用 `workflow_task_id` 对应的 confirmed payment。
2. 写入 `finance_ledger_entries`。
3. 完成 workflow task。

## 权限

财务确认收款使用 `finance.payment.confirm`。小程序应以任务中心返回的任务可见性为准，不在前端硬编码旧项目收款确认权限。

## orange 仓库约束

本仓库只提供对接说明，不修改 `/Users/leefo/Public/work/orange`。
````

- [ ] **Step 2: Update README index**

In `docs/decoration-finance/README.md`, replace the `miniprogram-handoff.md` line with a markdown link:

```markdown
- [miniprogram-handoff.md](./miniprogram-handoff.md)：小程序任务中心和财务确认收款对接。
```

- [ ] **Step 3: Verify docs**

Run:

```bash
rg -n 'TO''DO|TB''D|待''写' docs/decoration-finance
```

Expected:

- No placeholder words are reported.
- No retained reference to the old project payment confirmation permission in prose or API examples.

Commit:

```bash
git add docs/decoration-finance/miniprogram-handoff.md docs/decoration-finance/README.md
git commit -m "docs: add decoration finance miniprogram handoff"
```

## Task 6: End-to-End Verification

**Files:**
- Verify all files touched by Tasks 1-5.

- [ ] **Step 1: Run focused API tests**

Run:

```bash
cd apps/api && bun test src/services/workflow-task-action-metadata.test.ts src/services/workflow-task-payment-bridge.test.ts src/services/workflow-tasks.test.ts
```

Expected: selected tests pass.

- [ ] **Step 2: Run API checks**

Run:

```bash
bun run api:check
```

Expected: typecheck, build and API file size check pass.

- [ ] **Step 3: Run Admin checks**

Run:

```bash
bun run admin:check
```

Expected: Admin file size and typecheck pass.

- [ ] **Step 4: Verify migration state**

Run:

```bash
supabase migration list
```

Expected: local and remote migrations align after `20260616170000_decoration_finance_phase1.sql`.

- [ ] **Step 5: Manual smoke**

Use a tenant user with `finance.payment.confirm`:

1. Open a pending project payment collection task.
2. Submit amount, at least one evidence image, and optional remark.
3. Confirm the API response contains `payment.status = confirmed`.
4. Confirm `/finance/ledger?page=1&pageSize=20` includes one `project_payment` `in` row.
5. Confirm the workflow task status is completed and the project workflow moved to the next node.
6. Submit the same task completion request again and confirm no duplicate payment or ledger entry is created.

Commit if verification caused doc-only updates:

```bash
git add docs/decoration-finance
git commit -m "docs: record decoration finance verification"
```
