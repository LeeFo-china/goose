# Finance Ledger Legacy Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 7.4 Task 4 so `ledger_without_payment` exceptions can be closed through controlled ledger-to-payment linking or historical ledger marking.

**Architecture:** The reconciliation page remains an exception router. Actual repair writes go through `FinanceLedgerService` and `FinanceLedgerRepository`; Admin ledger rows expose actions only for project payment income ledgers without a payment link and not already marked as legacy.

**Tech Stack:** Bun + TypeScript + Fastify API, Supabase migrations, Next.js Admin, shadcn/Radix/Tailwind, Bun tests.

---

## File Map

- Modify `apps/api/src/schema/finance.ts`
  - Add `ledger_id` filter.
  - Add request schemas for linking a ledger to a payment and marking a ledger as historical.
- Modify `apps/api/src/repositories/finance-ledger.ts`
  - Add `findById`, `linkProjectPayment`, and `markLegacyProjectPayment`.
  - Add list filter by `ledger_id`.
- Modify `apps/api/src/services/finance-ledger.ts`
  - Add `linkProjectPayment` and `markLegacyProjectPayment`.
  - Enforce `finance.reconciliation.manage`, tenant, employee, ledger type, payment status, same project, amount match, duplicate payment ledger prevention, and reason.
- Modify `apps/api/src/controllers/finance/index.ts`
  - Add `POST /finance/ledger/:id/link-payment`.
  - Add `POST /finance/ledger/:id/mark-legacy-payment`.
- Modify `apps/api/src/repositories/finance-reconciliation.ts`
  - Exclude legacy-marked ledgers from `ledger_without_payment`.
- Modify `apps/api/src/services/finance-reconciliation-exceptions.ts`
  - Add `ledger_id` to `ledger_without_payment` action target.
- Modify API tests:
  - `apps/api/src/services/finance-ledger.test.ts`
  - `apps/api/src/services/finance-reconciliation.test.ts`
  - `apps/api/src/services/finance-reconciliation-action-targets.test.ts`
- Modify Admin:
  - `apps/admin/app/(console)/finance/ledger/page.tsx`
  - `apps/admin/components/finance/finance-ledger-query-utils.ts`
  - `apps/admin/components/finance/finance-ledger-query-utils.test.ts`
  - `apps/admin/components/finance/finance-requests.ts`
  - `apps/admin/components/finance/finance-ledger-table.tsx`
  - Create `apps/admin/components/finance/finance-ledger-payment-repair-dialog.tsx`
- Create migration:
  - `supabase/migrations/20260630093000_finance_ledger_legacy_repair.sql`
- Create smoke doc:
  - `docs/decoration-finance/2026-06-30-phase7-4-ledger-legacy-repair-smoke.md`

## Task 1: API Tests

**Files:**
- Modify: `apps/api/src/services/finance-ledger.test.ts`
- Modify: `apps/api/src/services/finance-reconciliation.test.ts`
- Modify: `apps/api/src/services/finance-reconciliation-action-targets.test.ts`

- [x] **Step 1: Add failing service tests**

Add cases that expect:

```ts
financeLedgerService.linkProjectPayment(
  authContextWithPermissions([{ code: "finance.reconciliation.manage", scope: "all" }]),
  "ledger-1",
  {
    payment_id: "550e8400-e29b-41d4-a716-446655440099",
    reason: "确认历史流水对应这笔收款",
  },
)
```

to call repository update with tenant, ledger ID, payment ID, employee ID and reason.

Add cases that reject:

- missing `finance.reconciliation.manage` with 403
- ledger already has `payment_id` with `LEDGER_PAYMENT_ALREADY_LINKED`
- payment status not `confirmed` with `PAYMENT_NOT_CONFIRMED`
- payment amount not equal to ledger amount with `LEDGER_PAYMENT_AMOUNT_MISMATCH`

Add a case for:

```ts
financeLedgerService.markLegacyProjectPayment(
  authContextWithPermissions([{ code: "finance.reconciliation.manage", scope: "all" }]),
  "ledger-1",
  { reason: "历史导入流水，原始 payment 不存在" },
)
```

to call repository mark with tenant, ledger ID, employee ID and reason.

- [x] **Step 2: Add failing reconciliation action target tests**

Update `ledger_without_payment` action target to:

```text
/finance/ledger?project_id=project-7&direction=in&entry_type=project_payment&ledger_id=ledger-without-payment
```

- [x] **Step 3: Run tests and verify RED**

Run:

```bash
cd apps/api
bun test src/services/finance-ledger.test.ts src/services/finance-reconciliation.test.ts src/services/finance-reconciliation-action-targets.test.ts
```

Expected: tests fail because methods and action target are not implemented.

## Task 2: API Implementation and Migration

**Files:**
- Modify: `apps/api/src/schema/finance.ts`
- Modify: `apps/api/src/repositories/finance-ledger.ts`
- Modify: `apps/api/src/services/finance-ledger.ts`
- Modify: `apps/api/src/controllers/finance/index.ts`
- Modify: `apps/api/src/repositories/finance-reconciliation.ts`
- Modify: `apps/api/src/services/finance-reconciliation-exceptions.ts`
- Create: `supabase/migrations/20260630093000_finance_ledger_legacy_repair.sql`

- [x] **Step 1: Add schema**

Add:

```ts
ledger_id: optionalQueryValue(z.uuid("请选择有效的台账流水")),

export const LinkFinanceLedgerPaymentSchema = z.object({
  payment_id: z.uuid("请选择有效的收款记录"),
  reason: z.string().trim().min(1, "请填写关联原因").max(500, "原因不能超过 500 个字符"),
});

export const MarkLegacyFinanceLedgerSchema = z.object({
  reason: z.string().trim().min(1, "请填写历史标记原因").max(500, "原因不能超过 500 个字符"),
});
```

- [x] **Step 2: Add migration**

Add nullable audit columns:

```sql
ALTER TABLE public.finance_ledger_entries
ADD COLUMN IF NOT EXISTS payment_linked_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS payment_linked_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS payment_link_reason text NULL,
ADD COLUMN IF NOT EXISTS payment_link_previous_payment_id uuid NULL,
ADD COLUMN IF NOT EXISTS legacy_payment_ledger_marked_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS legacy_payment_ledger_marked_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS legacy_payment_ledger_reason text NULL;

CREATE INDEX IF NOT EXISTS finance_ledger_entries_unlinked_project_payment_idx
ON public.finance_ledger_entries (tenant_id, project_id, occurred_at DESC)
WHERE direction = 'in'
  AND entry_type = 'project_payment'
  AND payment_id IS NULL
  AND legacy_payment_ledger_marked_at IS NULL;
```

- [x] **Step 3: Implement repository methods**

Add `findById({ tenantId, ledgerId })`, `linkProjectPayment(...)`, and `markLegacyProjectPayment(...)`.

- [x] **Step 4: Implement service methods**

`linkProjectPayment` must:

- require `finance.reconciliation.manage`
- require employee ID
- validate ledger exists in tenant
- require `direction=in` and `entry_type=project_payment`
- reject if `payment_id` already exists
- reject if legacy-marked
- validate payment exists, same tenant and same project
- require payment status `confirmed`
- require payment amount equals ledger amount
- reject if another project payment ledger already uses that payment
- update ledger with payment ID and audit fields

`markLegacyProjectPayment` must:

- require `finance.reconciliation.manage`
- require employee ID
- validate ledger exists in tenant
- require `direction=in` and `entry_type=project_payment`
- reject if `payment_id` already exists
- reject if already legacy-marked
- update legacy audit fields and metadata

- [x] **Step 5: Add controller routes**

Add:

```ts
@Post("/finance/ledger/:id/link-payment")
@Post("/finance/ledger/:id/mark-legacy-payment")
```

- [x] **Step 6: Update reconciliation**

Exclude rows with `legacy_payment_ledger_marked_at` and include `ledger_id` in action target.

- [x] **Step 7: Run API tests**

Run:

```bash
cd apps/api
bun test src/services/finance-ledger.test.ts src/services/finance-reconciliation.test.ts src/services/finance-reconciliation-action-targets.test.ts
bun run ../../scripts/check-api-file-size.ts
```

Expected: all tests pass and file size check passes.

## Task 3: Admin UI

**Files:**
- Modify: `apps/admin/app/(console)/finance/ledger/page.tsx`
- Modify: `apps/admin/components/finance/finance-ledger-query-utils.ts`
- Modify: `apps/admin/components/finance/finance-ledger-query-utils.test.ts`
- Modify: `apps/admin/components/finance/finance-requests.ts`
- Modify: `apps/admin/components/finance/finance-ledger-table.tsx`
- Create: `apps/admin/components/finance/finance-ledger-payment-repair-dialog.tsx`

- [x] **Step 1: Add `ledger_id` query support**

Add `ledger_id` to query helpers, page search params, `fetchFinanceLedger`, and hidden form inputs.

- [x] **Step 2: Add record fields**

Extend `FinanceLedgerRecord` with:

```ts
metadata?: Record<string, unknown> | null;
payment_linked_at?: string | null;
payment_linked_by?: string | null;
payment_link_reason?: string | null;
legacy_payment_ledger_marked_at?: string | null;
legacy_payment_ledger_marked_by?: string | null;
legacy_payment_ledger_reason?: string | null;
```

- [x] **Step 3: Add repair dialog**

Create a compact dialog with two modes:

- link payment: fetch confirmed payments for the ledger project with `/payments?project_id=...&status=confirmed&page=1&pageSize=100`, require selected payment and reason, POST `/finance/ledger/:id/link-payment`
- mark legacy: require reason, POST `/finance/ledger/:id/mark-legacy-payment`

- [x] **Step 4: Add table actions**

For project payment income rows with no `payment_id` and no `legacy_payment_ledger_marked_at`, show:

- `关联收款`
- `标记历史`

Only show actions when the session has `finance.reconciliation.manage`.

- [x] **Step 5: Run Admin tests**

Run:

```bash
bun test apps/admin/components/finance/finance-ledger-query-utils.test.ts
pnpm --dir apps/admin check
```

Expected: tests and typecheck pass.

## Task 4: Smoke and Documentation

**Files:**
- Create: `docs/decoration-finance/2026-06-30-phase7-4-ledger-legacy-repair-smoke.md`
- Modify: `docs/decoration-finance/README.md`

- [x] **Step 1: Apply migration**

Use the existing pooler-safe Supabase CLI command shape:

```bash
PGSSLMODE=disable supabase db push --db-url "$DB_URL_WITH_STATEMENT_CACHE_DISABLED" --yes
```

- [x] **Step 2: Worktree API smoke**

Start temporary API on `127.0.0.1:3101`.

Smoke:

- Create or identify a `ledger_without_payment` sample.
- Verify reconciliation action target includes `ledger_id`.
- Link one legacy ledger to a confirmed payment and verify the exception disappears.
- Mark one unlinked project payment ledger as historical and verify the exception disappears.

- [x] **Step 3: Record smoke**

Document:

- project ID
- ledger IDs
- payment ID used for link
- response codes
- migration verification
- test command results
- mini-program boundary: no required changes

- [x] **Step 4: Final verification**

Run:

```bash
bun run api:typecheck
pnpm --dir apps/admin check
git diff --check
```

- [x] **Step 5: Commit**

Commit:

```bash
git add .
git commit -m "feat(finance): 支持历史收款台账修正"
```

## Self Review

- Spec coverage: Task 4 requirements map to link payment, mark legacy, audit fields, reconciliation recomputation, Admin ledger entry, and mini-program boundary.
- Placeholder scan: no placeholders.
- Type consistency: route names, schema names and service method names are consistent across API and Admin sections.
- Scope: focused on `ledger_without_payment`; Task 5 exception drawer remains separate.
