# Finance Receivable Overdue Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Finish Phase 7.4 Task 1 by making `receivable_overdue` handling explicit, auditable, and easy to reach from Admin.

**Architecture:** Reuse the existing receivable operations stack instead of introducing a new reconciliation writer. Add a focused due-date adjustment API that writes a dedicated audit event, keep cancellation/follow-up on the existing service, and make reconciliation actions deep-link to the exact overdue receivable row.

**Tech Stack:** Bun + TypeScript + Fastify API, Supabase migrations, Next.js Admin, shadcn/Radix UI, Bun tests, `pnpm --dir apps/admin check`.

---

## Current State

- `GET /finance/receivables` already supports `status=overdue`, `overdue_only=true`, `follow_up_due_only=true`, and pagination.
- `POST /finance/receivables/:id/follow-ups` already writes `follow_up`.
- `PATCH /finance/receivables/:id` can adjust `due_date`, but it is bundled into the generic `adjusted` event and does not require a dedicated reason.
- `POST /finance/receivables/:id/cancel` cancels unpaid receivables, but writes the generic `canceled` event.
- `/finance/reconciliation/exceptions` currently links `receivable_overdue` to `/finance/receivables?project_id=...&status=overdue`, so the operator must find the exact plan manually.

## File Structure

- Modify: `apps/api/src/schema/finance-receivables.ts`
  Add `AdjustFinanceReceivableDueDateSchema` and event types `adjust_due_date` / `cancel_receivable`.
- Modify: `apps/api/src/services/project-receivables-operations.ts`
  Add `adjustDueDate`; switch new cancel events to `cancel_receivable`; preserve readable history for old event types.
- Modify: `apps/api/src/controllers/finance/index.ts`
  Register the finance receivables sub-controller and keep non-receivable finance routes.
- Create: `apps/api/src/controllers/finance/receivables-controller.ts`
  Move receivable routes into a focused controller and add `PATCH /finance/receivables/:id/due-date`.
- Modify: `apps/api/src/services/finance-reconciliation-exceptions.ts`
  Include `receivable_plan_id` in the overdue action target.
- Modify: `apps/api/src/services/project-receivables-operations.test.ts`
  Add tests for dedicated due-date adjustment and cancel event type.
- Modify: `apps/api/src/services/finance-reconciliation.test.ts`
  Assert exact overdue deep link target.
- Create: `supabase/migrations/20260629223000_receivable_overdue_handling_events.sql`
  Extend `project_receivable_events_event_type_check` with new event values.
- Modify: `apps/admin/components/finance/finance-requests.ts`
  Add `receivable_plan_id` query support.
- Modify: `apps/admin/app/(console)/finance/receivables/page.tsx`
  Preserve and pass through `receivable_plan_id`.
- Modify: `apps/admin/components/finance/finance-receivable-actions.tsx`
  Add explicit “调整到期日” action and dialog.
- Modify: `apps/admin/components/finance/finance-receivables-table.tsx`
  Highlight exact overdue rows from `receivable_plan_id`.

---

### Task 1: Backend Due-Date Operation

**Files:**
- Modify: `apps/api/src/schema/finance-receivables.ts`
- Modify: `apps/api/src/services/project-receivables-operations.ts`
- Modify: `apps/api/src/controllers/finance/index.ts`
- Create: `apps/api/src/controllers/finance/receivables-controller.ts`
- Modify: `apps/api/src/services/project-receivables-operations.test.ts`

- [x] **Step 1: Write failing service tests**

Add these tests to `apps/api/src/services/project-receivables-operations.test.ts`:

```typescript
test("adjusts due date with dedicated audit event", async () => {
  updatePlan.mockImplementationOnce(async (input) => ({
    ...baseRecord,
    due_date: String(input.values.due_date),
  }));
  const service = await createService();

  const result = await service.adjustDueDate(authContext, "plan-1", {
    due_date: "2026-07-20",
    reason: "客户延期付款",
  });

  expect(result.due_date).toBe("2026-07-20");
  expect(updatePlan).toHaveBeenCalledWith({
    tenantId: "tenant-1",
    planId: "plan-1",
    values: {
      due_date: "2026-07-20",
      status: "pending",
    },
  });
  expect(createEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      event_type: "adjust_due_date",
      title: "调整应收到期日",
      note: "客户延期付款",
      before_snapshot: expect.objectContaining({ due_date: "2026-07-05" }),
      after_snapshot: expect.objectContaining({ due_date: "2026-07-20" }),
    }),
  );
});

test("writes explicit cancel receivable event type", async () => {
  const service = await createService();

  await service.cancelReceivable(authContext, "plan-1", {
    reason: "客户取消增项",
  });

  expect(createEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      event_type: "cancel_receivable",
      title: "取消应收计划",
      note: "客户取消增项",
    }),
  );
});
```

- [x] **Step 2: Verify the tests fail for the right reason**

Run:

```bash
cd apps/api
bun test src/services/project-receivables-operations.test.ts
```

Expected: fail because `adjustDueDate` is not defined and cancel still writes `canceled`.

- [x] **Step 3: Add schema fields and event values**

In `apps/api/src/schema/finance-receivables.ts`, extend event values:

```typescript
export const PROJECT_RECEIVABLE_EVENT_TYPE_VALUES = [
  "manual_created",
  "adjusted",
  "canceled",
  "follow_up",
  "adjust_due_date",
  "cancel_receivable",
  "allocate_payment",
  "adjust_allocation",
  "reverse_allocation",
] as const;
```

Add schema:

```typescript
export const AdjustFinanceReceivableDueDateSchema = z.object({
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "应收日期格式必须为 YYYY-MM-DD"),
  reason: z.string().trim()
    .min(1, "请输入调整原因")
    .max(500, "调整原因不能超过 500 个字符"),
});
```

Export the inferred type:

```typescript
export type AdjustFinanceReceivableDueDateInput = z.infer<
  typeof AdjustFinanceReceivableDueDateSchema
>;
```

- [x] **Step 4: Add service method**

In `apps/api/src/services/project-receivables-operations.ts`, import `AdjustFinanceReceivableDueDateInput`, add `adjustDueDate`, and include event type `"adjust_due_date" | "cancel_receivable"` in `createEvent`.

```typescript
async adjustDueDate(
  authContext: AuthContext,
  planId: string,
  input: AdjustFinanceReceivableDueDateInput,
) {
  const tenantId = this.requireManage(authContext);
  const current = await this.getWritablePlan(tenantId, planId, "adjust");
  const updated = await this.dependencies.operationsRepository.updatePlan({
    tenantId,
    planId,
    values: {
      due_date: input.due_date,
      status: deriveStoredStatus(current.paid_amount, current.amount),
    },
  });
  await this.createEvent({
    record: updated,
    eventType: "adjust_due_date",
    title: "调整应收到期日",
    note: input.reason,
    before: snapshot(current),
    after: snapshot(updated),
    createdBy: authContext.employeeId,
  });
  return updated;
}
```

Also change `cancelReceivable` event type from `"canceled"` to `"cancel_receivable"`.

- [x] **Step 5: Add controller route**

In `apps/api/src/controllers/finance/index.ts`, import `AdjustFinanceReceivableDueDateSchema` and add:

```typescript
@Patch("/finance/receivables/:id/due-date")
async adjustReceivableDueDate(request: FastifyRequest, reply: FastifyReply) {
  const authContext = await this.getRequiredTenantContext(request);
  const idVerify = this.idParamSchema.safeParse(request.params);
  if (!idVerify.success) throw Errors.fromZod(idVerify.error);

  const bodyResult = AdjustFinanceReceivableDueDateSchema.safeParse(request.body);
  if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

  const data = await projectReceivableOperationsService.adjustDueDate(
    authContext,
    idVerify.data.id,
    bodyResult.data,
  );
  return ResponseHandler.success(data);
}
```

- [x] **Step 6: Verify backend service tests pass**

Run:

```bash
cd apps/api
bun test src/services/project-receivables-operations.test.ts
```

Expected: pass.

---

### Task 2: Migration for New Event Types

**Files:**
- Create: `supabase/migrations/20260629223000_receivable_overdue_handling_events.sql`

- [x] **Step 1: Create migration**

Add:

```sql
-- Phase 7.4 Task 1: explicit receivable overdue operation audit event types.

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
    'adjust_due_date',
    'cancel_receivable',
    'allocate_payment',
    'adjust_allocation',
    'reverse_allocation'
  )
);
```

- [x] **Step 2: Verify migration syntax by static inspection**

Run:

```bash
rg -n "adjust_due_date|cancel_receivable" supabase/migrations/20260629223000_receivable_overdue_handling_events.sql
```

Expected: both event types are present.

---

### Task 3: Reconciliation Deep Link to Exact Receivable

**Files:**
- Modify: `apps/api/src/services/finance-reconciliation-exceptions.ts`
- Modify: `apps/api/src/services/finance-reconciliation.test.ts`

- [x] **Step 1: Write failing test assertion**

In `apps/api/src/services/finance-reconciliation.test.ts`, extend the existing `receivable_overdue` assertion:

```typescript
expect(result.list).toContainEqual(
  expect.objectContaining({
    id: "plan-overdue",
    exception_code: "receivable_overdue",
    level: "warning",
    amount: 10000,
    occurred_at: "2026-06-01T00:00:00.000Z",
    action: expect.objectContaining({
      key: "open_receivable_overdue",
      target: "/finance/receivables?project_id=project-1&status=overdue&receivable_plan_id=plan-overdue",
    }),
  }),
);
```

- [x] **Step 2: Verify the test fails**

Run:

```bash
cd apps/api
bun test src/services/finance-reconciliation.test.ts
```

Expected: fail because the action key/target do not include `receivable_plan_id`.

- [x] **Step 3: Update action builder**

In `buildReceivableExceptions`, change overdue action to:

```typescript
action: receivableAction(row.project_id, {
  status: "overdue",
  receivablePlanId: row.id,
  key: "open_receivable_overdue",
}),
```

Update `receivableAction`:

```typescript
function receivableAction(
  projectId: string | null,
  filters: {
    status?: string;
    receivablePlanId?: string;
    key?: string;
  } = {},
) {
  const params = new URLSearchParams();
  appendParam(params, "project_id", projectId);
  appendParam(params, "status", filters.status);
  appendParam(params, "receivable_plan_id", filters.receivablePlanId);
  return {
    key: filters.key ?? "open_receivables",
    label: "去处理",
    target: buildTarget("/finance/receivables", params),
  };
}
```

- [x] **Step 4: Verify reconciliation tests pass**

Run:

```bash
cd apps/api
bun test src/services/finance-reconciliation.test.ts
```

Expected: pass.

---

### Task 4: Admin Receivable Overdue UX

**Files:**
- Modify: `apps/admin/components/finance/finance-requests.ts`
- Modify: `apps/admin/app/(console)/finance/receivables/page.tsx`
- Modify: `apps/admin/components/finance/finance-receivable-actions.tsx`
- Modify: `apps/admin/components/finance/finance-receivables-table.tsx`

- [x] **Step 1: Add request/query support**

In `apps/admin/components/finance/finance-requests.ts`, add optional `receivable_plan_id?: string` to the receivable query type and append it to request params.

- [x] **Step 2: Preserve filter in page**

In `apps/admin/app/(console)/finance/receivables/page.tsx`, add `receivable_plan_id?: string` to `FinanceReceivablesPageSearchParams`, pass it to `fetchFinanceReceivables`, and preserve it in `buildReceivableHref`.

- [x] **Step 3: Add due-date action in row actions**

In `apps/admin/components/finance/finance-receivable-actions.tsx`:

```typescript
type DialogMode =
  | "create"
  | "edit"
  | "adjust_due_date"
  | "cancel"
  | "follow_up"
  | "allocate";
```

Add a clock/calendar button labeled `延期` for unpaid receivables. The dialog should post to `/finance/receivables/:id/due-date` with:

```typescript
{
  due_date: read(form, "due_date"),
  reason: read(form, "reason"),
}
```

Dialog title should be `调整到期日`; the form should include only `due_date` and `reason`.

- [x] **Step 4: Highlight exact target row**

In `apps/admin/components/finance/finance-receivables-table.tsx`, accept `highlightReceivablePlanId?: string`, and add a subtle row marker for the matching row:

```tsx
<div className="max-w-[16rem] truncate">
  {row.original.id === highlightReceivablePlanId ? (
    <Badge variant="warning" className="mr-2">待处理</Badge>
  ) : null}
  {row.original.title || paymentTypeLabel(row.original.payment_type)}
</div>
```

Pass the prop from the page using `params.receivable_plan_id`.

- [x] **Step 5: Verify Admin typecheck**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: pass.

---

### Task 5: Full Verification and Commit

**Files:**
- All changed files.

- [x] **Step 1: Run focused API tests**

```bash
cd apps/api
bun test src/services/project-receivables-operations.test.ts src/services/finance-reconciliation.test.ts
```

Expected: all pass.

- [x] **Step 2: Run API typecheck**

```bash
bun run api:typecheck
```

Expected: pass.

- [x] **Step 3: Run Admin check**

```bash
pnpm --dir apps/admin check
```

Expected: pass.

- [x] **Step 4: Run whitespace check**

```bash
git diff --check
```

Expected: no output.

- [x] **Step 5: Review diff**

```bash
git diff --stat
git diff -- apps/api/src/schema/finance-receivables.ts apps/api/src/services/project-receivables-operations.ts apps/api/src/controllers/finance/index.ts apps/api/src/services/finance-reconciliation-exceptions.ts
```

Expected: changes are scoped to Task 1 and do not alter workflow execution or payment allocation.

- [x] **Step 6: Commit**

```bash
git add apps/api/src/schema/finance-receivables.ts \
  apps/api/src/services/project-receivables-operations.ts \
  apps/api/src/controllers/finance/index.ts \
  apps/api/src/controllers/finance/receivables-controller.ts \
  apps/api/src/services/project-receivables-operations.test.ts \
  apps/api/src/services/finance-reconciliation-exceptions.ts \
  apps/api/src/services/finance-reconciliation.test.ts \
  apps/admin/components/finance/finance-requests.ts \
  'apps/admin/app/(console)/finance/receivables/page.tsx' \
  apps/admin/components/finance/finance-receivable-actions.tsx \
  apps/admin/components/finance/finance-receivables-table.tsx \
  supabase/migrations/20260629223000_receivable_overdue_handling_events.sql \
  docs/superpowers/plans/2026-06-29-finance-receivable-overdue.md
git commit -m "feat(finance): 完善逾期应收处理"
```

Expected: commit succeeds.
