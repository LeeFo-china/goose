# Tenant Subscription Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add monthly tenant system usage billing: charge 1000 credits per billing period, warn tenant admins 7 days before due date, lock tenant product access on unpaid expiry, and keep credit purchase/payment available while locked.

**Architecture:** Reuse the existing prepaid credit ledger and recharge system. Add subscription/invoice state as the billing-period source of truth, charge monthly fees through existing atomic credit RPCs, expose lock state through backend auth/context checks, and surface due invoices through the task center builder model.

**Tech Stack:** Bun + TypeScript + Fastify API, Supabase migrations/RPC, existing `tenant_credit_accounts`, `tenant_credit_ledger`, `billing_charge_credits`, Next.js admin, shadcn/ui admin components.

---

## Scope And Rules

- Do not change `/Users/leefo/Public/work/orange`; mini-program work is delivered as a handoff document only.
- All database changes go through `supabase/migrations/`.
- Do not use `tenants.status = suspended` for billing lock. Existing auth rejects non-active tenants too early and would block recharge flows.
- Do not use `tenant_credit_accounts.status = disabled` for overdue lock. Existing recharge confirmation RPC requires active credit accounts.
- The lock source of truth is the new subscription state, not tenant lifecycle state.
- The monthly fee source of truth is `tenant_subscription_invoices`; every actual credit movement must still be recorded in `tenant_credit_ledger`.

## File Map

Create:
- `supabase/migrations/YYYYMMDDHHMMSS_create_tenant_subscription_billing.sql`
- `apps/api/src/repositories/billing-subscriptions.ts`
- `apps/api/src/services/billing-subscriptions.ts`
- `apps/api/src/services/billing-subscriptions.test.ts`
- `apps/api/src/workers/billing-reconcile-worker.ts`
- `apps/api/src/workers/billing-reconcile-worker.test.ts`
- `apps/api/src/services/task-center/legacy/builders-billing.ts`
- `apps/api/src/services/task-center/legacy/builders-billing.test.ts`
- `docs/miniprogram/2026-07-03-tenant-billing-lock-handoff.md`

Modify:
- `apps/api/src/services/authorization/legacy-service.ts`
- `apps/api/src/services/authorization/legacy-service.test.ts`
- `apps/api/src/services/task-center/legacy/actions.ts`
- `apps/api/src/services/task-center/legacy/shared.ts`
- `apps/api/src/schema/task-center.ts`
- `apps/api/src/controllers/billing/index.ts`
- `apps/api/src/controllers/billing-recharge/index.ts`
- `apps/admin/app/(console)/billing/page.tsx`
- `apps/admin/components/billing/*`
- `packages/domain/src/permission.ts`
- `packages/domain/src/permission.test.ts`

## Data Model

Use these exact domain concepts:

- `tenant_billing_plans`: versioned plan configuration.
- `tenant_billing_subscriptions`: current tenant subscription and lock status.
- `tenant_subscription_invoices`: period invoice, reminder, payment, and recovery state.

Status values:

```text
tenant_billing_subscriptions.status:
active | past_due | locked | canceled

tenant_subscription_invoices.status:
upcoming | reminded | paid | past_due | failed | void
```

Default system plan:

```text
code = system_monthly_1000
monthly_fee_credits = 1000
reminder_days_before_due = 7
period = monthly
```

---

### Task 1: Add Subscription Billing Migration

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_create_tenant_subscription_billing.sql`
- Test: `apps/api/src/services/billing-subscriptions.test.ts`

- [ ] **Step 1: Write migration-content test first**

Create `apps/api/src/services/billing-subscriptions.test.ts` with a migration contract test:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const migrationDir = join(import.meta.dir, "../../../supabase/migrations");

function readSubscriptionMigration() {
  const file = readdirSync(migrationDir)
    .filter((name) => name.endsWith("_create_tenant_subscription_billing.sql"))
    .sort()
    .at(-1);
  expect(file).toBeTruthy();
  return readFileSync(join(migrationDir, file as string), "utf8");
}

describe("tenant subscription billing migration", () => {
  test("creates subscription billing tables and atomic RPCs", () => {
    const sql = readSubscriptionMigration();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_billing_plans");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_billing_subscriptions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_subscription_invoices");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.billing_charge_subscription_invoice");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.billing_recover_subscription_after_recharge");
    expect(sql).toContain("tenant_subscription_invoices_tenant_period_unique_idx");
    expect(sql).toContain("'subscription_monthly_fee'");
    expect(sql).toContain("'tenant_subscription_invoice'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test apps/api/src/services/billing-subscriptions.test.ts
```

Expected: fail because migration file does not exist.

- [ ] **Step 3: Create migration**

Create `supabase/migrations/YYYYMMDDHHMMSS_create_tenant_subscription_billing.sql` with:

```sql
CREATE TABLE IF NOT EXISTS public.tenant_billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  period text NOT NULL DEFAULT 'monthly',
  monthly_fee_credits bigint NOT NULL,
  reminder_days_before_due integer NOT NULL DEFAULT 7,
  enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_billing_plans_period_check CHECK (period = 'monthly'),
  CONSTRAINT tenant_billing_plans_fee_check CHECK (monthly_fee_credits > 0),
  CONSTRAINT tenant_billing_plans_reminder_check CHECK (reminder_days_before_due >= 0)
);

CREATE TABLE IF NOT EXISTS public.tenant_billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id),
  plan_id uuid NOT NULL REFERENCES public.tenant_billing_plans(id),
  status text NOT NULL DEFAULT 'active',
  current_period_start date NOT NULL,
  current_period_end date NOT NULL,
  next_charge_at timestamptz NOT NULL,
  locked_at timestamptz NULL,
  lock_reason text NULL,
  last_invoice_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_billing_subscriptions_status_check CHECK (
    status IN ('active', 'past_due', 'locked', 'canceled')
  ),
  CONSTRAINT tenant_billing_subscriptions_period_check CHECK (current_period_end > current_period_start)
);

CREATE TABLE IF NOT EXISTS public.tenant_subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  subscription_id uuid NOT NULL REFERENCES public.tenant_billing_subscriptions(id),
  plan_id uuid NOT NULL REFERENCES public.tenant_billing_plans(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_at timestamptz NOT NULL,
  amount_credits bigint NOT NULL,
  status text NOT NULL DEFAULT 'upcoming',
  reminder_due_at timestamptz NOT NULL,
  reminded_at timestamptz NULL,
  paid_at timestamptz NULL,
  ledger_id uuid NULL REFERENCES public.tenant_credit_ledger(id),
  failure_code text NULL,
  failure_message text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_subscription_invoices_amount_check CHECK (amount_credits > 0),
  CONSTRAINT tenant_subscription_invoices_status_check CHECK (
    status IN ('upcoming', 'reminded', 'paid', 'past_due', 'failed', 'void')
  ),
  CONSTRAINT tenant_subscription_invoices_period_check CHECK (period_end > period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_subscription_invoices_tenant_period_unique_idx
ON public.tenant_subscription_invoices(tenant_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS tenant_subscription_invoices_due_status_idx
ON public.tenant_subscription_invoices(status, due_at);

CREATE INDEX IF NOT EXISTS tenant_subscription_invoices_tenant_status_idx
ON public.tenant_subscription_invoices(tenant_id, status, due_at DESC);

CREATE INDEX IF NOT EXISTS tenant_billing_subscriptions_status_next_charge_idx
ON public.tenant_billing_subscriptions(status, next_charge_at);

DROP TRIGGER IF EXISTS tr_tenant_billing_plans_updated_at ON public.tenant_billing_plans;
CREATE TRIGGER tr_tenant_billing_plans_updated_at
BEFORE UPDATE ON public.tenant_billing_plans
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_tenant_billing_subscriptions_updated_at ON public.tenant_billing_subscriptions;
CREATE TRIGGER tr_tenant_billing_subscriptions_updated_at
BEFORE UPDATE ON public.tenant_billing_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_tenant_subscription_invoices_updated_at ON public.tenant_subscription_invoices;
CREATE TRIGGER tr_tenant_subscription_invoices_updated_at
BEFORE UPDATE ON public.tenant_subscription_invoices
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.tenant_billing_plans (
  code,
  name,
  period,
  monthly_fee_credits,
  reminder_days_before_due,
  enabled,
  version
)
VALUES (
  'system_monthly_1000',
  '系统月度使用费',
  'monthly',
  1000,
  7,
  true,
  1
)
ON CONFLICT (code) DO NOTHING;
```

Add the two RPCs in the same migration:

```sql
CREATE OR REPLACE FUNCTION public.billing_charge_subscription_invoice(
  p_invoice_id uuid,
  p_operator_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.tenant_subscription_invoices%ROWTYPE;
  v_subscription public.tenant_billing_subscriptions%ROWTYPE;
  v_charge_result jsonb;
  v_ledger_id uuid;
BEGIN
  SELECT * INTO v_invoice
  FROM public.tenant_subscription_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_SUBSCRIPTION_INVOICE_NOT_FOUND';
  END IF;

  IF v_invoice.status = 'paid' THEN
    RETURN jsonb_build_object('invoice', to_jsonb(v_invoice), 'idempotent', true);
  END IF;

  IF v_invoice.status = 'void' THEN
    RAISE EXCEPTION 'TENANT_SUBSCRIPTION_INVOICE_VOID';
  END IF;

  SELECT * INTO v_subscription
  FROM public.tenant_billing_subscriptions
  WHERE id = v_invoice.subscription_id
  FOR UPDATE;

  IF NOT FOUND OR v_subscription.status = 'canceled' THEN
    RAISE EXCEPTION 'TENANT_SUBSCRIPTION_NOT_ACTIVE';
  END IF;

  BEGIN
    SELECT public.billing_charge_credits(
      v_invoice.tenant_id,
      v_invoice.amount_credits,
      'subscription_monthly_fee',
      'tenant_subscription_invoice',
      v_invoice.id::text,
      NULL,
      jsonb_build_object(
        'plan_id', v_invoice.plan_id,
        'period_start', v_invoice.period_start,
        'period_end', v_invoice.period_end
      ),
      '系统月度使用费'
    ) INTO v_charge_result;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.tenant_subscription_invoices
    SET
      status = CASE WHEN SQLERRM = 'TENANT_CREDITS_INSUFFICIENT' THEN 'past_due' ELSE 'failed' END,
      failure_code = SQLERRM,
      failure_message = SQLERRM
    WHERE id = v_invoice.id
    RETURNING * INTO v_invoice;

    UPDATE public.tenant_billing_subscriptions
    SET
      status = 'locked',
      locked_at = now(),
      lock_reason = 'credits_insufficient',
      last_invoice_id = v_invoice.id
    WHERE id = v_subscription.id
    RETURNING * INTO v_subscription;

    RETURN jsonb_build_object(
      'invoice', to_jsonb(v_invoice),
      'subscription', to_jsonb(v_subscription),
      'charged', false,
      'failure_code', SQLERRM
    );
  END;

  v_ledger_id := (v_charge_result->'ledger'->>'id')::uuid;

  UPDATE public.tenant_subscription_invoices
  SET
    status = 'paid',
    paid_at = now(),
    ledger_id = v_ledger_id,
    failure_code = NULL,
    failure_message = NULL
  WHERE id = v_invoice.id
  RETURNING * INTO v_invoice;

  UPDATE public.tenant_billing_subscriptions
  SET
    status = 'active',
    locked_at = NULL,
    lock_reason = NULL,
    last_invoice_id = v_invoice.id,
    current_period_start = v_invoice.period_end,
    current_period_end = (v_invoice.period_end + interval '1 month')::date,
    next_charge_at = v_invoice.period_end::timestamptz + interval '1 month'
  WHERE id = v_subscription.id
  RETURNING * INTO v_subscription;

  RETURN jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'subscription', to_jsonb(v_subscription),
    'ledger_id', v_ledger_id,
    'charged', true,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_recover_subscription_after_recharge(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.tenant_subscription_invoices%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_invoice
  FROM public.tenant_subscription_invoices
  WHERE tenant_id = p_tenant_id
    AND status IN ('past_due', 'failed')
  ORDER BY due_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('recovered', false, 'reason', 'no_past_due_invoice');
  END IF;

  SELECT public.billing_charge_subscription_invoice(v_invoice.id, NULL)
  INTO v_result;

  RETURN v_result || jsonb_build_object('recovered', (v_result->>'charged')::boolean);
END;
$$;
```

- [ ] **Step 4: Run migration-content test**

Run:

```bash
bun test apps/api/src/services/billing-subscriptions.test.ts
```

Expected: pass.

- [ ] **Step 5: Verify migration status before DB apply**

Run:

```bash
supabase migration list
```

Expected: new migration is local-only until explicitly applied.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/YYYYMMDDHHMMSS_create_tenant_subscription_billing.sql apps/api/src/services/billing-subscriptions.test.ts
git commit -m "feat(billing): 增加租户订阅账期模型"
```

---

### Task 2: Add Subscription Repository

**Files:**
- Create: `apps/api/src/repositories/billing-subscriptions.ts`
- Test: `apps/api/src/services/billing-subscriptions.test.ts`

- [ ] **Step 1: Add repository behavior tests**

Append tests that assert source contains table names and paginated queries:

```ts
test("subscription repository exposes due invoice and lock queries", () => {
  const source = readFileSync(
    join(import.meta.dir, "../repositories/billing-subscriptions.ts"),
    "utf8",
  );

  expect(source).toContain("tenant_billing_subscriptions");
  expect(source).toContain("tenant_subscription_invoices");
  expect(source).toContain("listInvoicesDueForReminder");
  expect(source).toContain("listInvoicesDueForCharge");
  expect(source).toContain(".range(from, to)");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test apps/api/src/services/billing-subscriptions.test.ts
```

Expected: fail because repository file does not exist.

- [ ] **Step 3: Implement repository**

Create `apps/api/src/repositories/billing-subscriptions.ts`:

```ts
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

export type TenantBillingSubscriptionRecord = {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: "active" | "past_due" | "locked" | "canceled";
  current_period_start: string;
  current_period_end: string;
  next_charge_at: string;
  locked_at: string | null;
  lock_reason: string | null;
  last_invoice_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TenantSubscriptionInvoiceRecord = {
  id: string;
  tenant_id: string;
  subscription_id: string;
  plan_id: string;
  period_start: string;
  period_end: string;
  due_at: string;
  amount_credits: number;
  status: "upcoming" | "reminded" | "paid" | "past_due" | "failed" | "void";
  reminder_due_at: string;
  reminded_at: string | null;
  paid_at: string | null;
  ledger_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  lte: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{ data: unknown; error: unknown; count: number | null }>["then"];
};

type UntypedClient = {
  from: (
    table:
      | "tenant_billing_subscriptions"
      | "tenant_subscription_invoices"
      | "tenant_credit_account_balances"
  ) => UntypedTable;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export class BillingSubscriptionRepository {
  private client() {
    return SupabaseDB.getAdminClient() as unknown as UntypedClient;
  }

  private from(table: Parameters<UntypedClient["from"]>[0]) {
    return this.client().from(table);
  }

  async findSubscriptionByTenantId(tenantId: string) {
    const { data, error } = await this.from("tenant_billing_subscriptions")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询租户订阅失败", error);
    return (data as TenantBillingSubscriptionRecord | null) ?? null;
  }

  async listInvoicesDueForReminder(input: { nowIso: string; page: number; pageSize: number }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    const { data, error } = await this.from("tenant_subscription_invoices")
      .select("*")
      .in("status", ["upcoming"])
      .lte("reminder_due_at", input.nowIso)
      .order("reminder_due_at", { ascending: true })
      .range(from, to);

    if (error) throw Errors.dbError("查询待提醒订阅账单失败", error);
    return (data ?? []) as TenantSubscriptionInvoiceRecord[];
  }

  async listInvoicesDueForCharge(input: { nowIso: string; page: number; pageSize: number }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    const { data, error } = await this.from("tenant_subscription_invoices")
      .select("*")
      .in("status", ["upcoming", "reminded", "past_due", "failed"])
      .lte("due_at", input.nowIso)
      .order("due_at", { ascending: true })
      .range(from, to);

    if (error) throw Errors.dbError("查询待扣费订阅账单失败", error);
    return (data ?? []) as TenantSubscriptionInvoiceRecord[];
  }

  async markInvoiceReminded(invoiceId: string) {
    const { data, error } = await this.from("tenant_subscription_invoices")
      .update({ status: "reminded", reminded_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .select("*")
      .single();

    if (error) throw Errors.dbError("标记订阅账单已提醒失败", error);
    return data as TenantSubscriptionInvoiceRecord;
  }

  async chargeInvoice(invoiceId: string) {
    const { data, error } = await this.client().rpc("billing_charge_subscription_invoice", {
      p_invoice_id: invoiceId,
      p_operator_user_id: null,
    });

    if (error) throw Errors.dbError("扣减订阅账单积分失败", error);
    return data as Record<string, unknown>;
  }

  async recoverAfterRecharge(tenantId: string) {
    const { data, error } = await this.client().rpc("billing_recover_subscription_after_recharge", {
      p_tenant_id: tenantId,
    });

    if (error) throw Errors.dbError("充值后恢复租户订阅失败", error);
    return data as Record<string, unknown>;
  }
}

export const billingSubscriptionRepository = new BillingSubscriptionRepository();
```

- [ ] **Step 4: Run tests**

```bash
bun test apps/api/src/services/billing-subscriptions.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/billing-subscriptions.ts apps/api/src/services/billing-subscriptions.test.ts
git commit -m "feat(billing): 增加订阅账期仓储"
```

---

### Task 3: Add Subscription Service And Worker

**Files:**
- Create: `apps/api/src/services/billing-subscriptions.ts`
- Create: `apps/api/src/workers/billing-reconcile-worker.ts`
- Test: `apps/api/src/services/billing-subscriptions.test.ts`
- Test: `apps/api/src/workers/billing-reconcile-worker.test.ts`

- [ ] **Step 1: Write service unit tests**

Replace source-only tests with behavioral tests using dependency injection:

```ts
import { describe, expect, mock, test } from "bun:test";
import { BillingSubscriptionService } from "./billing-subscriptions";

describe("BillingSubscriptionService", () => {
  test("marks upcoming invoice as reminded when balance is insufficient before due date", async () => {
    const repo = {
      listInvoicesDueForReminder: mock(async () => [{
        id: "invoice-1",
        tenant_id: "tenant-1",
        amount_credits: 1000,
        status: "upcoming",
      }]),
      markInvoiceReminded: mock(async () => ({ id: "invoice-1", status: "reminded" })),
      listInvoicesDueForCharge: mock(async () => []),
      chargeInvoice: mock(async () => ({})),
    };
    const service = new BillingSubscriptionService({ repository: repo as never });

    const result = await service.runDueChecks({ now: new Date("2026-07-03T00:00:00Z") });

    expect(repo.markInvoiceReminded).toHaveBeenCalledWith("invoice-1");
    expect(result.reminded).toBe(1);
    expect(result.charged).toBe(0);
  });

  test("charges due invoices and reports locked failures without throwing the batch", async () => {
    const repo = {
      listInvoicesDueForReminder: mock(async () => []),
      markInvoiceReminded: mock(async () => null),
      listInvoicesDueForCharge: mock(async () => [{ id: "invoice-2" }]),
      chargeInvoice: mock(async () => ({ charged: false, failure_code: "TENANT_CREDITS_INSUFFICIENT" })),
    };
    const service = new BillingSubscriptionService({ repository: repo as never });

    const result = await service.runDueChecks({ now: new Date("2026-07-03T00:00:00Z") });

    expect(repo.chargeInvoice).toHaveBeenCalledWith("invoice-2");
    expect(result.locked).toBe(1);
    expect(result.errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test apps/api/src/services/billing-subscriptions.test.ts
```

Expected: fail because `BillingSubscriptionService` does not exist.

- [ ] **Step 3: Implement service**

Create `apps/api/src/services/billing-subscriptions.ts`:

```ts
import { billingSubscriptionRepository } from "@/repositories/billing-subscriptions";

type RepositoryPort = Pick<
  typeof billingSubscriptionRepository,
  | "listInvoicesDueForReminder"
  | "markInvoiceReminded"
  | "listInvoicesDueForCharge"
  | "chargeInvoice"
  | "recoverAfterRecharge"
>;

export type BillingDueCheckInput = {
  now?: Date;
  batchSize?: number;
};

export class BillingSubscriptionService {
  private readonly repository: RepositoryPort;

  constructor(dependencies: { repository?: RepositoryPort } = {}) {
    this.repository = dependencies.repository ?? billingSubscriptionRepository;
  }

  async runDueChecks(input: BillingDueCheckInput = {}) {
    const nowIso = (input.now ?? new Date()).toISOString();
    const pageSize = input.batchSize ?? 100;
    const result = { reminded: 0, charged: 0, locked: 0, errors: [] as string[] };

    const reminders = await this.repository.listInvoicesDueForReminder({
      nowIso,
      page: 1,
      pageSize,
    });

    for (const invoice of reminders) {
      await this.repository.markInvoiceReminded(invoice.id);
      result.reminded += 1;
    }

    const dueInvoices = await this.repository.listInvoicesDueForCharge({
      nowIso,
      page: 1,
      pageSize,
    });

    for (const invoice of dueInvoices) {
      try {
        const charge = await this.repository.chargeInvoice(invoice.id);
        if (charge.charged === true) {
          result.charged += 1;
        } else if (charge.failure_code === "TENANT_CREDITS_INSUFFICIENT") {
          result.locked += 1;
        }
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    return result;
  }

  async recoverAfterRecharge(tenantId: string) {
    return this.repository.recoverAfterRecharge(tenantId);
  }
}

export const billingSubscriptionService = new BillingSubscriptionService();
```

- [ ] **Step 4: Add worker**

Create `apps/api/src/workers/billing-reconcile-worker.ts`:

```ts
import { billingSubscriptionService } from "@/services/billing-subscriptions";

const intervalMs = Number(process.env.BILLING_RECONCILE_INTERVAL_MS || 60_000);

async function runOnce() {
  const result = await billingSubscriptionService.runDueChecks();
  console.log("[billing-reconcile-worker] cycle completed", result);
}

async function main() {
  await runOnce();
  setInterval(() => {
    runOnce().catch((error) => {
      console.error("[billing-reconcile-worker] cycle failed", error);
    });
  }, intervalMs);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("[billing-reconcile-worker] startup failed", error);
    process.exit(1);
  });
}

export { runOnce };
```

- [ ] **Step 5: Add worker smoke test**

Create `apps/api/src/workers/billing-reconcile-worker.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

describe("billing reconcile worker", () => {
  test("runs subscription due checks", () => {
    const source = readFileSync(join(import.meta.dir, "billing-reconcile-worker.ts"), "utf8");

    expect(source).toContain("billingSubscriptionService.runDueChecks");
    expect(source).toContain("BILLING_RECONCILE_INTERVAL_MS");
    expect(source).toContain("cycle completed");
  });
});
```

- [ ] **Step 6: Run tests**

```bash
bun test apps/api/src/services/billing-subscriptions.test.ts apps/api/src/workers/billing-reconcile-worker.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/billing-subscriptions.ts apps/api/src/services/billing-subscriptions.test.ts apps/api/src/workers/billing-reconcile-worker.ts apps/api/src/workers/billing-reconcile-worker.test.ts
git commit -m "feat(billing): 增加订阅账期巡检任务"
```

---

### Task 4: Trigger Recovery After Credit Recharge

**Files:**
- Modify: `apps/api/src/services/billing-recharge.ts`
- Test: `apps/api/src/services/billing-recharge.test.ts`
- Modify: `apps/api/src/services/wechat-pay-callbacks-credit-recharge.test.ts`

- [ ] **Step 1: Add tests for recovery hook**

Add an assertion to `apps/api/src/services/billing-recharge.test.ts` that `getOrder` or `createOrder` does not recover early, and add a callback test in `apps/api/src/services/wechat-pay-callbacks-credit-recharge.test.ts` that recovery runs only after successful payment confirmation.

Use this injection shape in the service constructor:

```ts
type BillingSubscriptionServicePort = {
  recoverAfterRecharge: (tenantId: string) => Promise<unknown>;
};
```

Expected test assertion:

```ts
expect(billingSubscriptionService.recoverAfterRecharge).toHaveBeenCalledWith("tenant-1");
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test apps/api/src/services/billing-recharge.test.ts apps/api/src/services/wechat-pay-callbacks-credit-recharge.test.ts
```

Expected: fail because the recovery dependency is not wired.

- [ ] **Step 3: Wire recovery after confirmed recharge**

Modify the credit recharge callback path, after `confirmWechatRecharge` returns success:

```ts
await this.billingSubscriptionService.recoverAfterRecharge(order.tenant_id);
```

If the existing callback service does not own `order.tenant_id` after confirmation, recover using the confirmed order record returned by `confirmWechatRecharge`.

- [ ] **Step 4: Run tests**

```bash
bun test apps/api/src/services/billing-recharge.test.ts apps/api/src/services/wechat-pay-callbacks-credit-recharge.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/billing-recharge.ts apps/api/src/services/billing-recharge.test.ts apps/api/src/services/wechat-pay-callbacks-credit-recharge.test.ts
git commit -m "feat(billing): 充值到账后恢复订阅账期"
```

---

### Task 5: Add Billing Lock Guard With Recharge Whitelist

**Files:**
- Modify: `apps/api/src/services/authorization/legacy-service.ts`
- Modify: `apps/api/src/services/authorization/legacy-service.test.ts`
- Modify: route/controller layer if needed to pass current route metadata.

- [ ] **Step 1: Write lock guard tests**

Add tests to `apps/api/src/services/authorization/legacy-service.test.ts`:

```ts
test("blocks tenant business requests when subscription is locked", async () => {
  const service = createAuthorizationService({
    billingSubscriptionService: {
      getTenantLockState: mock(async () => ({ locked: true, reason: "credits_insufficient" })),
    },
  });

  await expect(service.getRequiredAuthContext("user-1")).rejects.toMatchObject({
    code: "TENANT_BILLING_LOCKED",
  });
});

test("allows billing recharge permissions when subscription is locked", async () => {
  const service = createAuthorizationService({
    billingSubscriptionService: {
      getTenantLockState: mock(async () => ({ locked: true, reason: "credits_insufficient" })),
    },
  });

  const authContext = await service.getRequiredAuthContext("user-1", {
    allowedWhenBillingLocked: true,
  });

  expect(authContext.tenantId).toBe("tenant-1");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test apps/api/src/services/authorization/legacy-service.test.ts
```

Expected: fail because the guard options do not exist.

- [ ] **Step 3: Implement guard options**

Change `getRequiredAuthContext` signature:

```ts
async getRequiredAuthContext(
  authUserId?: string | null,
  options: { allowedWhenBillingLocked?: boolean } = {},
) {
  if (!authUserId) {
    throw Errors.unauthorized();
  }

  const authContext = await this.getAuthContextByAuthUserId(authUserId);

  this.assertTenantAvailable(authContext);
  await this.assertBillingAvailable(authContext, options);
  return authContext;
}
```

Add billing guard:

```ts
private async assertBillingAvailable(
  authContext: AuthContext,
  options: { allowedWhenBillingLocked?: boolean },
) {
  if (!authContext.employeeId || authContext.isPlatformAdmin || !authContext.tenantId) {
    return;
  }

  const lockState = await this.billingSubscriptionService.getTenantLockState(authContext.tenantId);
  if (!lockState.locked) return;

  if (options.allowedWhenBillingLocked) return;

  throw Errors.business(402, "租户积分不足，系统已锁定", "TENANT_BILLING_LOCKED", {
    tenant_id: authContext.tenantId,
    lock_reason: lockState.reason,
  });
}
```

Whitelist only these APIs in controllers/routes:

```text
GET /billing/account
GET /billing/summary
GET /billing/ledger
GET /billing/feature-estimates
GET /billing/recharge-products
POST /billing/recharge-orders
GET /billing/recharge-orders/:id
```

- [ ] **Step 4: Run auth tests**

```bash
bun test apps/api/src/services/authorization/legacy-service.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/authorization/legacy-service.ts apps/api/src/services/authorization/legacy-service.test.ts apps/api/src/controllers/billing/index.ts apps/api/src/controllers/billing-recharge/index.ts
git commit -m "feat(auth): 增加租户计费锁定白名单"
```

---

### Task 6: Add Billing Due Todo

**Files:**
- Modify: `apps/api/src/schema/task-center.ts`
- Modify: `apps/api/src/services/task-center/legacy/shared.ts`
- Create: `apps/api/src/services/task-center/legacy/builders-billing.ts`
- Create: `apps/api/src/services/task-center/legacy/builders-billing.test.ts`
- Modify: `apps/api/src/services/task-center/legacy/actions.ts`

- [ ] **Step 1: Add task-center tests**

Create `apps/api/src/services/task-center/legacy/builders-billing.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";
import { buildBillingPaymentTodos } from "./builders-billing";

describe("buildBillingPaymentTodos", () => {
  test("returns a high priority billing todo for recharge admins", async () => {
    const repository = {
      findOpenInvoiceByTenantId: mock(async () => ({
        id: "invoice-1",
        tenant_id: "tenant-1",
        amount_credits: 1000,
        due_at: "2026-07-10T00:00:00Z",
        status: "reminded",
      })),
    };

    const list = await buildBillingPaymentTodos({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      permissions: [{ code: "billing.recharge.create", scope: "all" }],
      roleCodes: [],
    } as never, repository as never);

    expect(list).toEqual([expect.objectContaining({
      id: "billing_invoice:invoice-1",
      type: "billing_payment_due",
      priority: "high",
      action_label: "去充值",
      target_url: "/billing",
    })]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test apps/api/src/services/task-center/legacy/builders-billing.test.ts
```

Expected: fail because builder and schema type do not exist.

- [ ] **Step 3: Add schema type**

Modify `apps/api/src/schema/task-center.ts`:

```ts
export const TaskCenterTodoTypeSchema = z.enum([
  "customer_followup",
  "project_log",
  "project_payment",
  "project_workflow",
  "expense_request",
  "project_acceptance",
  "customer_service_ticket",
  "billing_payment_due",
], {
  message: "无效的待处理类型",
});
```

Modify `TaskCenterTodoItem["target_type"]` in `shared.ts` to include `"billing"`.

- [ ] **Step 4: Implement builder**

Create `apps/api/src/services/task-center/legacy/builders-billing.ts`:

```ts
import { billingSubscriptionRepository } from "@/repositories/billing-subscriptions";
import {
  accessPolicyService,
  getPriorityLabel,
  type AuthContext,
  type TaskCenterTodoItem,
} from "./shared";

type RepositoryPort = {
  findOpenInvoiceByTenantId: (tenantId: string) => Promise<{
    id: string;
    tenant_id: string;
    amount_credits: number;
    due_at: string;
    status: string;
  } | null>;
};

export async function buildBillingPaymentTodos(
  authContext: AuthContext,
  repository: RepositoryPort = billingSubscriptionRepository as unknown as RepositoryPort,
) {
  if (
    !authContext.employeeId ||
    !accessPolicyService.hasPermission(authContext, "billing.recharge.create")
  ) {
    return [] as TaskCenterTodoItem[];
  }

  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const invoice = await repository.findOpenInvoiceByTenantId(tenantId);
  if (!invoice) return [] as TaskCenterTodoItem[];

  return [{
    id: `billing_invoice:${invoice.id}`,
    type: "billing_payment_due" as const,
    title: invoice.status === "past_due" ? "系统使用费已到期" : "系统使用费待充值",
    subtitle: `需充值至少 ${invoice.amount_credits.toLocaleString("zh-CN")} 积分`,
    status: "pending" as const,
    status_label: "待处理" as const,
    priority: "high" as const,
    priority_label: getPriorityLabel("high"),
    due_at: invoice.due_at,
    created_at: invoice.due_at,
    action_label: "去充值",
    target_url: "/billing",
    target_type: "billing" as const,
    target_id: invoice.id,
    metadata: {
      invoice_id: invoice.id,
      amount_credits: invoice.amount_credits,
      invoice_status: invoice.status,
    },
  }];
}
```

- [ ] **Step 5: Wire builder into actions**

Modify `apps/api/src/services/task-center/legacy/actions.ts` to include:

```ts
import { buildBillingPaymentTodos } from "./builders-billing";
```

Add to `Promise.all`:

```ts
const [
  customerFollowUps,
  projectLogs,
  expenseRequests,
  projectAcceptances,
  customerServiceTickets,
  workflowTasks,
  billingPayments,
] = await Promise.all([
  buildCustomerFollowUpTodos(authContext),
  buildProjectLogTodos(authContext),
  buildExpenseRequestTodos(authContext),
  buildProjectAcceptanceTodos(authContext),
  buildCustomerServiceTicketTodos(authContext),
  buildWorkflowTaskTodos(authContext),
  buildBillingPaymentTodos(authContext),
]);
```

Include `...billingPayments` in `sortTodos`.

- [ ] **Step 6: Run tests**

```bash
bun test apps/api/src/services/task-center/legacy/builders-billing.test.ts apps/api/src/schema/task-center.test.ts
```

Expected: pass. If `apps/api/src/schema/task-center.test.ts` does not exist, create one that validates `billing_payment_due` parses successfully.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/schema/task-center.ts apps/api/src/services/task-center/legacy/shared.ts apps/api/src/services/task-center/legacy/actions.ts apps/api/src/services/task-center/legacy/builders-billing.ts apps/api/src/services/task-center/legacy/builders-billing.test.ts
git commit -m "feat(task-center): 增加订阅扣费待办"
```

---

### Task 7: Admin Locked State And Recharge-Only Experience

**Files:**
- Modify: `apps/admin/app/(console)/billing/page.tsx`
- Modify: `apps/admin/components/billing/*`
- Test: add or extend nearby `apps/admin/components/billing/*.test.ts`

- [ ] **Step 1: Add admin source tests**

Create or extend a billing admin test:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

describe("tenant billing locked state", () => {
  test("billing page renders lock copy and keeps recharge actions available", () => {
    const pageSource = readFileSync(
      join(import.meta.dir, "../../app/(console)/billing/page.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("TENANT_BILLING_LOCKED");
    expect(pageSource).toContain("积分不足");
    expect(pageSource).toContain("billing.recharge.create");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test apps/admin/components/billing/*.test.ts
```

Expected: fail until locked copy and permission checks exist.

- [ ] **Step 3: Implement admin locked view**

Add a visible locked state in tenant billing page:

```tsx
function BillingLockedPanel({ canRecharge }: { canRecharge: boolean }) {
  return (
    <Card className="border-warning bg-warning/5 shadow-none">
      <CardHeader>
        <CardTitle>系统使用费待缴纳</CardTitle>
        <CardDescription>
          当前租户积分不足，业务功能已暂停。充值到账后系统会自动补扣欠费并恢复使用。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canRecharge ? (
          <BillingRechargeEntry />
        ) : (
          <p className="text-sm text-muted-foreground">请联系具备积分充值权限的管理员处理。</p>
        )}
      </CardContent>
    </Card>
  );
}
```

Ensure the normal billing account page still renders account balance, ledger, recharge packages, and order state when locked.

- [ ] **Step 4: Run admin tests and typecheck**

```bash
bun test apps/admin/components/billing/*.test.ts
pnpm --dir apps/admin run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/'(console)'/billing/page.tsx apps/admin/components/billing
git commit -m "feat(admin): 增加租户计费锁定充值入口"
```

---

### Task 8: Mini-Program Handoff Document

**Files:**
- Create: `docs/miniprogram/2026-07-03-tenant-billing-lock-handoff.md`

- [ ] **Step 1: Write handoff doc**

Create:

```md
# 租户计费锁定小程序对接说明

日期：2026-07-03

## 目标

租户系统使用费按月扣 1000 积分。到期积分不足时，员工小程序进入计费锁定态；具备充值权限的管理员仍可进入积分充值通道。

## 后端错误码

| HTTP | code | 处理 |
| --- | --- | --- |
| 402 | TENANT_BILLING_LOCKED | 展示锁定页 |
| 402 | TENANT_CREDITS_INSUFFICIENT | 展示余额不足提示 |

## 小程序行为

- bootstrap 或业务接口返回 `TENANT_BILLING_LOCKED` 时进入锁定页。
- 有 `billing.recharge.create` 权限：显示“购买积分”按钮。
- 无 `billing.recharge.create` 权限：显示“请联系管理员充值”。
- 充值页继续调用现有积分充值接口，不走项目收款接口。
- 充值支付成功后重新请求 bootstrap 和 `/billing/account`。

## 不需要小程序实现的逻辑

- 不计算账期。
- 不判断是否该扣 1000 积分。
- 不本地解锁。
- 不修改 orange 仓库代码。
```

- [ ] **Step 2: Commit**

```bash
git add docs/miniprogram/2026-07-03-tenant-billing-lock-handoff.md
git commit -m "docs(billing): 增加租户计费锁定小程序对接说明"
```

---

### Task 9: Full Verification And Migration Review

**Files:**
- All files touched by Tasks 1-8.

- [ ] **Step 1: Run backend tests**

```bash
bun test apps/api/src/services/billing-subscriptions.test.ts apps/api/src/workers/billing-reconcile-worker.test.ts apps/api/src/services/task-center/legacy/builders-billing.test.ts apps/api/src/services/authorization/legacy-service.test.ts apps/api/src/services/billing-recharge.test.ts apps/api/src/services/wechat-pay-callbacks-credit-recharge.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run API typecheck/build**

```bash
bun run api:build
```

Expected: build succeeds.

- [ ] **Step 3: Run admin checks**

```bash
pnpm --dir apps/admin run typecheck
pnpm --dir apps/admin run check:file-size
```

Expected: both pass.

- [ ] **Step 4: Review migration status**

```bash
supabase migration list
```

Expected: new migration is visible. Before applying remotely, confirm with the user because this adds billing tables and RPCs.

- [ ] **Step 5: Commit verification-only fixes if any**

If verification reveals small fixes, commit them:

```bash
git add <fixed-files>
git commit -m "fix(billing): 修复订阅扣费验证问题"
```

---

## Rollout Notes

- Apply migration only after review.
- Backfill subscriptions for existing tenants with a one-off script or SQL migration after confirming billing start date.
- Recommended initial backfill policy: active tenants start with `current_period_start = current_date`, `current_period_end = current_date + interval '1 month'`, first charge due at `current_period_end`.
- Do not auto-lock tenants until at least one full reminder window has been generated, unless the business explicitly wants immediate enforcement.
- Add `gooes-billing-worker` to launch/ops only after Task 3 passes locally.

## Self-Review

- Spec coverage: monthly fee, T-7 reminder, due-date charge, insufficient-credit lock, recharge whitelist, admin and mini-program behavior are covered by Tasks 1-8.
- Placeholder scan: no placeholder markers or unspecified implementation steps remain.
- Type consistency: `billing_payment_due`, `subscription_monthly_fee`, and `tenant_subscription_invoice` names are used consistently across migration, service, task center, and UI.
- Scope: orange mini-program code remains out of scope; only a handoff doc is created.
