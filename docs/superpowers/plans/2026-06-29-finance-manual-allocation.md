# Finance Manual Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a controlled Admin workflow for manually allocating confirmed project payments to receivable plans so `payment_unallocated`, `allocation_amount_mismatch`, and `receivable_paid_amount_mismatch` exceptions can be resolved by source-data correction instead of by automatic repair.

**Architecture:** Keep reconciliation read-only. Add allocation correction into the receivables domain: repository methods read/write `project_receivable_allocations`, a service validates payment/plan/project/tenant and recalculates receivable `paid_amount`, FinanceController exposes receivable allocation routes, and Admin renders a compact allocation dialog from the existing receivables table. Reversed allocations remain auditable and are excluded from all future sums.

**Tech Stack:** Bun + TypeScript + Fastify + Supabase migrations/RPC, Next.js 15 Admin, shadcn/Radix/Tailwind, Bun tests.

---

## Files And Responsibilities

- Create `supabase/migrations/20260629193000_receivable_manual_allocation_reversal.sql`
  - Adds reversible allocation audit fields.
  - Extends receivable event type constraint for allocation events.
  - Adds active-allocation indexes.
  - Replaces `get_project_receivable_summary` so reversed allocations are excluded.
- Modify `apps/api/src/schema/finance-receivables.ts`
  - Adds allocation action schemas.
  - Adds event types `allocate_payment`, `adjust_allocation`, `reverse_allocation`.
- Modify `apps/api/src/repositories/project-receivable-allocations.ts`
  - Adds context queries for plan allocations and confirmed project payments.
  - Adds create, update amount, reverse, and active allocation sum helpers.
- Modify `apps/api/src/repositories/project-receivable-plans.ts`
  - Ensures paid amount recalculation can update plan status from active allocation totals.
- Create `apps/api/src/services/project-receivable-allocations.ts`
  - Owns manual allocation validation and audit events.
- Create `apps/api/src/services/project-receivable-allocations.test.ts`
  - Covers create, adjust, reverse, over-allocation, tenant/project mismatch, canceled receivable, and unconfirmed payment.
- Modify `apps/api/src/repositories/finance-reconciliation.ts`
  - Excludes reversed allocation rows from reconciliation sums.
- Modify `apps/api/src/controllers/finance/index.ts`
  - Adds allocation context/create/adjust/reverse routes under `/finance/receivables/:id`.
- Modify `apps/admin/components/finance/finance-requests.ts`
  - Adds allocation context/result types and request helpers.
- Create `apps/admin/components/finance/finance-receivable-allocation-dialog.tsx`
  - Renders a dense Admin dialog for selecting confirmed payments and allocating/adjusting/reversing amounts.
- Modify `apps/admin/components/finance/finance-receivable-actions.tsx`
  - Adds “核销” action for receivables that are not paid/canceled.
- Modify `apps/admin/components/finance/finance-receivables-table.tsx`
  - Keeps row action layout compact after adding allocation action.
- Add/modify Admin focused tests:
  - `apps/admin/components/finance/finance-receivable-allocation-utils.ts`
  - `apps/admin/components/finance/finance-receivable-allocation-utils.test.ts`
- Add docs:
  - `docs/decoration-finance/2026-06-29-phase7-4-manual-allocation-smoke.md`
  - Update `docs/decoration-finance/README.md`.

## Task 1: Migration For Reversible Manual Allocation

**Files:**
- Create: `supabase/migrations/20260629193000_receivable_manual_allocation_reversal.sql`

- [ ] **Step 1: Write migration**

Create this migration:

```sql
ALTER TABLE public.project_receivable_allocations
ADD COLUMN IF NOT EXISTS reversed_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS reversed_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reverse_reason text NULL;

CREATE INDEX IF NOT EXISTS project_receivable_allocations_active_plan_idx
ON public.project_receivable_allocations(receivable_plan_id, allocated_at DESC)
WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS project_receivable_allocations_active_payment_idx
ON public.project_receivable_allocations(payment_id, allocated_at DESC)
WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS project_receivable_allocations_project_active_idx
ON public.project_receivable_allocations(tenant_id, project_id, allocated_at DESC)
WHERE reversed_at IS NULL;

ALTER TABLE public.project_receivable_events
DROP CONSTRAINT IF EXISTS project_receivable_events_event_type_check;

ALTER TABLE public.project_receivable_events
ADD CONSTRAINT project_receivable_events_event_type_check
CHECK (
  event_type IN (
    'manual_created',
    'adjusted',
    'canceled',
    'follow_up',
    'allocate_payment',
    'adjust_allocation',
    'reverse_allocation'
  )
);
```

Also replace `get_project_receivable_summary` with the current function body from `20260623173000_project_receivable_summary_rpc.sql`, changing allocation aggregation to include:

```sql
WHERE allocations.reversed_at IS NULL
```

- [ ] **Step 2: Verify migration syntax locally**

Run:

```bash
supabase db diff --local --schema public
```

Expected: command exits successfully. If the local Supabase stack is not running, record that this migration syntax is verified later by `supabase migration list` in the smoke doc.

- [ ] **Step 3: Commit migration**

```bash
git add supabase/migrations/20260629193000_receivable_manual_allocation_reversal.sql
git commit -m "feat(finance): 支持应收核销撤销审计"
```

## Task 2: Backend Manual Allocation Service

**Files:**
- Modify: `apps/api/src/schema/finance-receivables.ts`
- Modify: `apps/api/src/repositories/project-receivable-allocations.ts`
- Create: `apps/api/src/services/project-receivable-allocations.ts`
- Create: `apps/api/src/services/project-receivable-allocations.test.ts`
- Modify: `apps/api/src/controllers/finance/index.ts`
- Modify: `apps/api/src/repositories/finance-reconciliation.ts`

- [ ] **Step 1: Write failing service tests**

Create `apps/api/src/services/project-receivable-allocations.test.ts` with tests for:

```typescript
test("creates manual allocation and recalculates receivable paid amount", async () => {
  const result = await service.createManualAllocation(authContext, "plan-1", {
    payment_id: "payment-1",
    amount: 3000,
    reason: "核销未分配收款",
    idempotency_key: "00000000-0000-4000-8000-000000000001",
  });

  expect(result.receivable_plan).toMatchObject({
    id: "plan-1",
    paid_amount: 3000,
    status: "partially_paid",
  });
  expect(createAllocation).toHaveBeenCalledWith(expect.objectContaining({
    tenant_id: "tenant-1",
    project_id: "project-1",
    receivable_plan_id: "plan-1",
    payment_id: "payment-1",
    amount: 3000,
    source_type: "manual",
    source_id: "00000000-0000-4000-8000-000000000001",
  }));
  expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
    event_type: "allocate_payment",
    title: "人工核销收款",
    note: "核销未分配收款",
  }));
});

test("rejects allocation that exceeds payment remaining amount", async () => {
  getPaymentAllocatedAmount.mockResolvedValueOnce(9000);
  await expect(service.createManualAllocation(authContext, "plan-1", {
    payment_id: "payment-1",
    amount: 2000,
    reason: "超额核销",
    idempotency_key: "00000000-0000-4000-8000-000000000002",
  })).rejects.toMatchObject({
    statusCode: 409,
    code: "PAYMENT_ALLOCATION_EXCEEDS_REMAINING",
  });
});

test("adjusts allocation amount and writes audit event", async () => {
  const result = await service.adjustManualAllocation(authContext, "plan-1", "allocation-1", {
    amount: 5000,
    reason: "调整核销金额",
  });

  expect(result.receivable_plan.paid_amount).toBe(5000);
  expect(updateAllocationAmount).toHaveBeenCalledWith(expect.objectContaining({
    allocationId: "allocation-1",
    amount: 5000,
  }));
  expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
    event_type: "adjust_allocation",
  }));
});

test("reverses allocation and excludes it from paid amount", async () => {
  const result = await service.reverseManualAllocation(authContext, "plan-1", "allocation-1", {
    reason: "错误核销",
  });

  expect(result.receivable_plan.paid_amount).toBe(0);
  expect(reverseAllocation).toHaveBeenCalledWith(expect.objectContaining({
    allocationId: "allocation-1",
    reversedBy: "employee-1",
    reason: "错误核销",
  }));
  expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
    event_type: "reverse_allocation",
  }));
});
```

Run:

```bash
cd apps/api && bun test src/services/project-receivable-allocations.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 2: Add schemas**

In `apps/api/src/schema/finance-receivables.ts`:

```typescript
export const PROJECT_RECEIVABLE_EVENT_TYPE_VALUES = [
  "manual_created",
  "adjusted",
  "canceled",
  "follow_up",
  "allocate_payment",
  "adjust_allocation",
  "reverse_allocation",
] as const;

const AllocationAmountSchema = z.coerce.number("核销金额必须是数字")
  .positive("核销金额必须大于 0");

export const CreateFinanceReceivableAllocationSchema = z.object({
  payment_id: z.uuid("请选择有效的收款记录"),
  amount: AllocationAmountSchema,
  reason: z.string().trim().min(1, "请输入核销原因").max(500, "核销原因不能超过 500 个字符"),
  idempotency_key: z.uuid("核销幂等键必须是有效 UUID").optional(),
});

export const UpdateFinanceReceivableAllocationSchema = z.object({
  amount: AllocationAmountSchema,
  reason: z.string().trim().min(1, "请输入调整原因").max(500, "调整原因不能超过 500 个字符"),
});

export const ReverseFinanceReceivableAllocationSchema = z.object({
  reason: z.string().trim().min(1, "请输入撤销原因").max(500, "撤销原因不能超过 500 个字符"),
});
```

Export inferred types for all three schemas.

- [ ] **Step 3: Add repository methods**

Extend `apps/api/src/repositories/project-receivable-allocations.ts` with methods:

```typescript
async listActiveByReceivable(input: {
  tenantId: string;
  receivablePlanId: string;
}): Promise<ProjectReceivableAllocationWithPayment[]>

async listConfirmedProjectPayments(input: {
  projectId: string;
  pageSize: number;
}): Promise<ProjectReceivablePaymentAllocationCandidate[]>

async sumActiveAllocatedAmount(input: {
  tenantId: string;
  receivablePlanId: string;
}): Promise<number>

async sumActiveAllocatedAmountByPayment(input: {
  tenantId: string;
  paymentId: string;
}): Promise<number>

async findActiveById(input: {
  tenantId: string;
  allocationId: string;
}): Promise<ProjectReceivableAllocationRecord | null>

async updateManualAllocationAmount(input: {
  tenantId: string;
  allocationId: string;
  amount: number;
  metadata: Record<string, unknown>;
}): Promise<ProjectReceivableAllocationRecord>

async reverseManualAllocation(input: {
  tenantId: string;
  allocationId: string;
  reversedBy: string | null;
  reason: string;
  metadata: Record<string, unknown>;
}): Promise<ProjectReceivableAllocationRecord>
```

Every sum query must include:

```typescript
.is("reversed_at", null)
```

Every list query must use `.limit()` or `.range()`.

- [ ] **Step 4: Implement service**

Create `apps/api/src/services/project-receivable-allocations.ts`:

```typescript
export class ProjectReceivableAllocationsService {
  async getAllocationContext(
    authContext: AuthContext,
    planId: string,
  ): Promise<ProjectReceivableAllocationContext>;

  async createManualAllocation(
    authContext: AuthContext,
    planId: string,
    input: CreateFinanceReceivableAllocationInput,
  ): Promise<ProjectReceivableAllocationMutationResult>;

  async adjustManualAllocation(
    authContext: AuthContext,
    planId: string,
    allocationId: string,
    input: UpdateFinanceReceivableAllocationInput,
  ): Promise<ProjectReceivableAllocationMutationResult>;

  async reverseManualAllocation(
    authContext: AuthContext,
    planId: string,
    allocationId: string,
    input: ReverseFinanceReceivableAllocationInput,
  ): Promise<ProjectReceivableAllocationMutationResult>;
}
```

Validation rules:

- Require `finance.receivable.manage`.
- Receivable plan must belong to current tenant.
- Receivable plan status cannot be `canceled` or `paid` for create.
- Existing allocation must be active and belong to the same receivable for adjust/reverse.
- Payment must be `confirmed`.
- Payment project must equal receivable project.
- Payment amount must be positive.
- New active allocations for payment must not exceed payment amount.
- New active allocations for receivable must not exceed receivable amount.

Error codes:

- `RECEIVABLE_CANCELED`
- `RECEIVABLE_PAID`
- `PAYMENT_NOT_CONFIRMED`
- `PAYMENT_PROJECT_MISMATCH`
- `PAYMENT_ALLOCATION_EXCEEDS_REMAINING`
- `RECEIVABLE_ALLOCATION_EXCEEDS_REMAINING`
- `ALLOCATION_NOT_FOUND`
- `ALLOCATION_NOT_MANUAL`

- [ ] **Step 5: Add controller routes**

In `apps/api/src/controllers/finance/index.ts` import the schemas and service, then add:

```typescript
@Get("/finance/receivables/:id/allocation-context")
async getReceivableAllocationContext(...) {}

@Post("/finance/receivables/:id/allocations")
async createReceivableAllocation(...) {}

@Patch("/finance/receivables/:id/allocations/:allocationId")
async updateReceivableAllocation(...) {}

@Post("/finance/receivables/:id/allocations/:allocationId/reverse")
async reverseReceivableAllocation(...) {}
```

Use `this.idParamSchema` for `:id` and a local Zod UUID object for `allocationId`.

- [ ] **Step 6: Update reconciliation allocation sums**

In `apps/api/src/repositories/finance-reconciliation.ts`, update both allocation sum methods to add:

```typescript
.is("reversed_at", null)
```

- [ ] **Step 7: Run backend tests**

Run:

```bash
cd apps/api && bun test src/services/project-receivable-allocations.test.ts src/services/project-receivables.test.ts src/services/project-receivables-operations.test.ts src/services/finance-reconciliation.test.ts src/services/finance-reconciliation-action-targets.test.ts
cd apps/api && bun run typecheck
cd apps/api && bun run check:file-size
```

Expected: all pass.

- [ ] **Step 8: Commit backend**

```bash
git add apps/api/src/schema/finance-receivables.ts apps/api/src/repositories/project-receivable-allocations.ts apps/api/src/services/project-receivable-allocations.ts apps/api/src/services/project-receivable-allocations.test.ts apps/api/src/repositories/finance-reconciliation.ts apps/api/src/controllers/finance/index.ts
git commit -m "feat(finance): 增加人工收款核销接口"
```

## Task 3: Admin Allocation Dialog

**Files:**
- Modify: `apps/admin/components/finance/finance-requests.ts`
- Create: `apps/admin/components/finance/finance-receivable-allocation-utils.ts`
- Create: `apps/admin/components/finance/finance-receivable-allocation-utils.test.ts`
- Create: `apps/admin/components/finance/finance-receivable-allocation-dialog.tsx`
- Modify: `apps/admin/components/finance/finance-receivable-actions.tsx`
- Modify: `apps/admin/components/finance/finance-receivables-table.tsx`

- [ ] **Step 1: Write utility tests**

Create `apps/admin/components/finance/finance-receivable-allocation-utils.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  buildAllocationPaymentOptions,
  calculateReceivableAllocationSummary,
} from "./finance-receivable-allocation-utils";

describe("finance receivable allocation utils", () => {
  test("keeps only payments with remaining allocatable amount", () => {
    expect(buildAllocationPaymentOptions([
      { id: "payment-1", amount: 10000, allocated_amount: 3000, remaining_amount: 7000, pay_date: "2026-06-29", type: "stage_2" },
      { id: "payment-2", amount: 5000, allocated_amount: 5000, remaining_amount: 0, pay_date: "2026-06-29", type: "stage_2" },
    ])).toEqual([
      expect.objectContaining({ value: "payment-1", remainingAmount: 7000 }),
    ]);
  });

  test("summarizes receivable allocation state", () => {
    expect(calculateReceivableAllocationSummary({
      amount: 10000,
      paid_amount: 3000,
      remaining_amount: 7000,
    })).toMatchObject({
      amount: 10000,
      paidAmount: 3000,
      remainingAmount: 7000,
      canAllocate: true,
    });
  });
});
```

Run:

```bash
bun test apps/admin/components/finance/finance-receivable-allocation-utils.test.ts
```

Expected: FAIL because the utility file does not exist.

- [ ] **Step 2: Add Admin request types and helpers**

In `apps/admin/components/finance/finance-requests.ts`, add:

```typescript
export type FinanceReceivableAllocationRecord = {
  id: string;
  payment_id: string;
  receivable_plan_id: string;
  amount: number;
  allocated_at: string | null;
  allocated_by_name: string | null;
  source_type: string;
  source_id: string | null;
  payment?: {
    id: string;
    amount: number;
    type: string | null;
    pay_date: string | null;
    status: string | null;
  } | null;
};

export type FinanceReceivablePaymentCandidate = {
  id: string;
  amount: number;
  allocated_amount: number;
  remaining_amount: number;
  type: string | null;
  pay_date: string | null;
  remark: string | null;
};

export type FinanceReceivableAllocationContext = {
  receivable_plan: FinanceReceivableRecord;
  allocations: FinanceReceivableAllocationRecord[];
  payments: FinanceReceivablePaymentCandidate[];
};
```

Add `fetchFinanceReceivableAllocationContext(planId)` and mutation helpers that call:

- `GET /finance/receivables/:id/allocation-context`
- `POST /finance/receivables/:id/allocations`
- `PATCH /finance/receivables/:id/allocations/:allocationId`
- `POST /finance/receivables/:id/allocations/:allocationId/reverse`

- [ ] **Step 3: Implement allocation utils**

Create `apps/admin/components/finance/finance-receivable-allocation-utils.ts`:

```typescript
export function calculateReceivableAllocationSummary(input: {
  amount: number;
  paid_amount: number;
  remaining_amount: number;
}) {
  return {
    amount: Number(input.amount || 0),
    paidAmount: Number(input.paid_amount || 0),
    remainingAmount: Math.max(Number(input.remaining_amount || 0), 0),
    canAllocate: Number(input.remaining_amount || 0) > 0,
  };
}
```

Also add `buildAllocationPaymentOptions(payments)` that filters `remaining_amount > 0` and maps labels containing payment type, pay date, total, allocated, remaining.

- [ ] **Step 4: Implement dialog**

Create `apps/admin/components/finance/finance-receivable-allocation-dialog.tsx`.

UI requirements:

- Dialog width max `720px`.
- Header: “收款核销”.
- Top summary: 应收、已收、未收.
- Payment select: only payments with remaining amount.
- Amount input: defaults to min(receivable remaining, selected payment remaining).
- Reason textarea required.
- Existing allocations list below with “调整” and “撤销” row actions.
- Loading and error states via `StatusAlert`.
- Disable submit while pending.

Use `requestBackendJson` or helper wrappers; call `router.refresh()` after success.

- [ ] **Step 5: Add row action**

In `apps/admin/components/finance/finance-receivable-actions.tsx`:

```typescript
type DialogMode = "create" | "edit" | "cancel" | "follow_up" | "allocate";
```

Add a “核销” ghost button with `WalletCards` or `ReceiptText` icon. Disable only when row status is `paid` or `canceled`. Render `FinanceReceivableAllocationDialog` when mode is `allocate`.

- [ ] **Step 6: Run Admin tests/check**

Run:

```bash
bun test apps/admin/components/finance/finance-receivable-allocation-utils.test.ts
pnpm --dir apps/admin run check
```

Expected: all pass.

- [ ] **Step 7: Commit Admin**

```bash
git add apps/admin/components/finance/finance-requests.ts apps/admin/components/finance/finance-receivable-allocation-utils.ts apps/admin/components/finance/finance-receivable-allocation-utils.test.ts apps/admin/components/finance/finance-receivable-allocation-dialog.tsx apps/admin/components/finance/finance-receivable-actions.tsx apps/admin/components/finance/finance-receivables-table.tsx
git commit -m "feat(admin): 增加应收收款核销入口"
```

## Task 4: Smoke And Documentation

**Files:**
- Create: `docs/decoration-finance/2026-06-29-phase7-4-manual-allocation-smoke.md`
- Modify: `docs/decoration-finance/README.md`

- [ ] **Step 1: Start temporary services from worktree**

Use ports that do not touch main services:

```bash
cd apps/api && PORT=3320 NODE_ENV=development bun --env-file=.env src/app.ts
pnpm --dir apps/admin dev --hostname 0.0.0.0 --port 3330
```

- [ ] **Step 2: Execute API smoke on a test project**

Use an existing `payment_unallocated` sample from:

```bash
GET http://127.0.0.1:3330/api/backend/finance/reconciliation/exceptions?page=1&pageSize=20&status=open&exception_code=payment_unallocated
```

Then call:

```bash
GET /api/backend/finance/receivables/:planId/allocation-context
POST /api/backend/finance/receivables/:planId/allocations
GET /api/backend/finance/reconciliation/exceptions?page=1&pageSize=20&status=open&exception_code=payment_unallocated
```

Record:

- project ID
- receivable plan ID
- payment ID
- allocation ID
- before and after paid amount
- before and after reconciliation exception count

- [ ] **Step 3: Execute Admin read/render smoke**

Verify:

- `/finance/receivables?project_id=...` returns 200.
- Row has “核销” action.
- Dialog loads allocation context.
- No `Application error`.
- No “后端服务未连接”.

- [ ] **Step 4: Document results**

Create the smoke doc with:

- branch and commit list
- migration applied status
- static verification commands
- API smoke evidence
- Admin smoke evidence
- write constraints and rollback notes
- small program statement: “小程序无必改，不提供修账入口”

Update README index.

- [ ] **Step 5: Commit docs**

```bash
git add docs/decoration-finance/2026-06-29-phase7-4-manual-allocation-smoke.md docs/decoration-finance/README.md
git commit -m "docs(finance): 记录phase7.4人工核销smoke"
```

## Task 5: Final Verification And RAG

**Files:**
- No source edits expected.

- [ ] **Step 1: Run final verification**

```bash
git diff --check
bun test apps/admin/components/finance/finance-receivable-allocation-utils.test.ts
pnpm --dir apps/admin run check
cd apps/api && bun test src/services/project-receivable-allocations.test.ts src/services/project-receivables.test.ts src/services/project-receivables-operations.test.ts src/services/finance-reconciliation.test.ts src/services/finance-reconciliation-action-targets.test.ts
cd apps/api && bun run typecheck
cd apps/api && bun run build
cd apps/api && bun run check:file-size
```

- [ ] **Step 2: Push branch**

```bash
git push -u origin feat/finance-manual-allocation
```

- [ ] **Step 3: Sync docs to RAG**

Run:

```bash
node /Users/leefo/Public/work/mcp/rag/scripts/sync-repo-docs.mjs \
  --repo /Users/leefo/Public/work/gooes/.worktrees/finance-manual-allocation \
  --repo-name gooes \
  --profile gooes-curated \
  --only-path docs/decoration-finance/2026-06-29-phase7-4-manual-allocation-smoke.md \
  --only-path docs/decoration-finance/README.md
```

If README conflicts with LightRAG `409`, delete only the current gooes `docs/decoration-finance/README.md` document record and re-upload README, then wait for pipeline idle.

- [ ] **Step 4: Final status**

Verify:

```bash
git status --short
git rev-parse --short HEAD
lsof -nP -iTCP:3320 -sTCP:LISTEN || true
lsof -nP -iTCP:3330 -sTCP:LISTEN || true
```

Expected:

- clean git status
- no temp services left on 3320/3330
- LightRAG `failed=0`, `processing=0`

## Self-Review

- Spec coverage: covers Phase 7.4 Task 2 for `payment_unallocated`, `allocation_amount_mismatch`, and `receivable_paid_amount_mismatch`; leaves overdue handling, ledger generation, and legacy ledger marking for later Phase 7.4 tasks.
- Placeholder scan: no unfinished-marker placeholders are intentionally left. Any command that may depend on local Supabase availability includes expected fallback documentation.
- Type consistency: allocation create/update/reverse schema names, service names, and route paths are consistent across backend and Admin tasks.
- Scope control: implementation remains in receivables domain; reconciliation stays read-only; small program has no required code change.
