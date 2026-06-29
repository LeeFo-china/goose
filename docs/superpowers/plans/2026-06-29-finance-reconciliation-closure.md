# Finance Reconciliation Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe, auditable closure flow for finance reconciliation exceptions so finance users can acknowledge, ignore, resolve, and reopen computed exceptions without mutating payment, receivable, allocation, or ledger business records.

**Architecture:** Keep the Phase 7 exception calculation read-only and deterministic, then layer a separate action ledger on top. The backend generates stable exception fingerprints, merges the latest action per fingerprint into list/project summary responses, and persists user actions in a dedicated table. Admin renders and submits backend-provided state; it never derives closure status or writes finance business tables.

**Tech Stack:** Bun + TypeScript + Fastify + Zod in `apps/api`, Supabase migrations and service-role repository access, Next.js 15 + shadcn/Radix + TanStack table in `apps/admin`, focused Bun unit tests.

---

## Scope And Current Files

Phase 7.1 builds on these existing files:

- API controller: `apps/api/src/controllers/finance/index.ts`
- API schema: `apps/api/src/schema/finance-reconciliation.ts`
- API read service: `apps/api/src/services/finance-reconciliation.ts`
- API read repository: `apps/api/src/repositories/finance-reconciliation.ts`
- API project summary repository: `apps/api/src/repositories/finance-reconciliation-project-summary.ts`
- API tests: `apps/api/src/services/finance-reconciliation.test.ts`
- Admin page: `apps/admin/app/(console)/finance/reconciliation/page.tsx`
- Admin requests/types: `apps/admin/components/finance/finance-reconciliation-requests.ts`
- Admin table: `apps/admin/components/finance/finance-reconciliation-table.tsx`
- Admin helpers: `apps/admin/components/finance/finance-reconciliation-utils.ts`
- Project summary panel: `apps/admin/components/projects/project-finance-reconciliation-summary-panel.tsx`
- Project summary helpers: `apps/admin/components/projects/project-finance-reconciliation-summary-utils.ts`
- Product plan: `docs/decoration-finance/2026-06-29-phase7-1-reconciliation-closure-plan.md`

New files:

- `supabase/migrations/20260629143000_finance_reconciliation_exception_actions.sql`
- `apps/api/src/repositories/finance-reconciliation-actions.ts`
- `apps/admin/components/finance/finance-reconciliation-action-dialog.tsx`
- `docs/decoration-finance/2026-06-29-phase7-1-reconciliation-closure-smoke.md`

---

### Task 1: Migration And Permission

**Files:**
- Create: `supabase/migrations/20260629143000_finance_reconciliation_exception_actions.sql`
- Reference: `supabase/migrations/20260628110000_finance_receivable_operations.sql`
- Reference: `supabase/migrations/20260616170000_decoration_finance_phase1.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260629143000_finance_reconciliation_exception_actions.sql` with:

```sql
create table if not exists public.finance_reconciliation_exception_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  exception_fingerprint text not null,
  exception_code text not null,
  subject_type text not null,
  subject_id uuid null,
  project_id uuid null references public.projects(id) on delete set null,
  action text not null,
  remark text not null,
  actor_employee_id uuid null references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint finance_reconciliation_exception_actions_fingerprint_not_blank
    check (btrim(exception_fingerprint) <> ''),
  constraint finance_reconciliation_exception_actions_code_not_blank
    check (btrim(exception_code) <> ''),
  constraint finance_reconciliation_exception_actions_subject_type_check
    check (subject_type in ('receivable', 'payment', 'ledger')),
  constraint finance_reconciliation_exception_actions_action_check
    check (action in ('acknowledge', 'ignore', 'resolve', 'reopen')),
  constraint finance_reconciliation_exception_actions_remark_not_blank
    check (char_length(btrim(remark)) >= 2)
);

create index if not exists idx_finance_reconciliation_exception_actions_tenant_fingerprint
  on public.finance_reconciliation_exception_actions (
    tenant_id,
    exception_fingerprint,
    created_at desc
  );

create index if not exists idx_finance_reconciliation_exception_actions_tenant_project
  on public.finance_reconciliation_exception_actions (
    tenant_id,
    project_id,
    created_at desc
  );

create index if not exists idx_finance_reconciliation_exception_actions_tenant_actor
  on public.finance_reconciliation_exception_actions (
    tenant_id,
    actor_employee_id,
    created_at desc
  )
  where actor_employee_id is not null;

insert into public.permissions (code, name, module, resource, action, description, status)
values (
  'finance.reconciliation.manage',
  '处理财务对账异常',
  'finance',
  'finance_reconciliation',
  'manage',
  '允许确认、忽略、标记处理或重新打开财务对账异常',
  'active'
)
on conflict (code) do update set
  name = excluded.name,
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  status = excluded.status;

insert into public.role_permissions (role_id, permission_id, access_scope)
select roles.id, permissions.id, 'all'
from public.roles
join public.permissions on permissions.code = 'finance.reconciliation.manage'
where roles.code in ('tenant_admin', 'finance_manager')
on conflict (role_id, permission_id) do update set
  access_scope = excluded.access_scope;

comment on table public.finance_reconciliation_exception_actions is
  '财务对账异常处理动作记录。只记录确认、忽略、处理完成、重新打开等动作，不修改财务业务表。';
comment on column public.finance_reconciliation_exception_actions.exception_fingerprint is
  '后端根据异常类型和业务对象生成的稳定指纹，例如 payment_without_ledger:{payment_id}。';
comment on column public.finance_reconciliation_exception_actions.remark is
  '处理备注，至少 2 个字符，用于审计追溯。';
```

- [ ] **Step 2: Verify migration syntax locally**

Run:

```bash
rg -n "finance_reconciliation_exception_actions|finance.reconciliation.manage" supabase/migrations/20260629143000_finance_reconciliation_exception_actions.sql
```

Expected:

```text
The command prints the table name, indexes, permission code, and comments from the migration file.
```

- [ ] **Step 3: Commit migration**

Run:

```bash
git add supabase/migrations/20260629143000_finance_reconciliation_exception_actions.sql
git commit -m "feat(finance): 增加对账异常处理记录表"
```

---

### Task 2: Backend Schemas And Action Repository

**Files:**
- Modify: `apps/api/src/schema/finance-reconciliation.ts`
- Create: `apps/api/src/repositories/finance-reconciliation-actions.ts`
- Test: `apps/api/src/services/finance-reconciliation.test.ts`

- [ ] **Step 1: Extend schema values**

Modify `apps/api/src/schema/finance-reconciliation.ts` to include:

```ts
export const FINANCE_RECONCILIATION_STATUS_VALUES = [
  "open",
  "acknowledged",
  "ignored",
  "resolved",
] as const;

export const FINANCE_RECONCILIATION_ACTION_VALUES = [
  "acknowledge",
  "ignore",
  "resolve",
  "reopen",
] as const;

export const FinanceReconciliationStatusSchema = z.enum(
  FINANCE_RECONCILIATION_STATUS_VALUES,
  { message: "无效的对账异常状态" },
);

export const FinanceReconciliationActionSchema = z.enum(
  FINANCE_RECONCILIATION_ACTION_VALUES,
  { message: "无效的对账异常处理动作" },
);
```

Update `FinanceReconciliationExceptionListQuerySchema`:

```ts
status: FinanceReconciliationStatusSchema.optional(),
actor_employee_id: z.uuid("请选择有效的处理人").optional(),
```

Add:

```ts
export const FinanceReconciliationExceptionActionParamsSchema = z.object({
  fingerprint: z.string()
    .trim()
    .min(6, "无效的对账异常指纹")
    .max(240, "对账异常指纹过长"),
});

export const CreateFinanceReconciliationExceptionActionSchema = z.object({
  action: FinanceReconciliationActionSchema,
  remark: z.string()
    .trim()
    .min(2, "处理备注至少 2 个字符")
    .max(500, "处理备注不能超过 500 个字符"),
});

export type FinanceReconciliationStatus =
  (typeof FINANCE_RECONCILIATION_STATUS_VALUES)[number];
export type FinanceReconciliationAction =
  (typeof FINANCE_RECONCILIATION_ACTION_VALUES)[number];
export type CreateFinanceReconciliationExceptionAction = z.infer<
  typeof CreateFinanceReconciliationExceptionActionSchema
>;
```

- [ ] **Step 2: Create repository**

Create `apps/api/src/repositories/finance-reconciliation-actions.ts`:

```ts
import { Errors } from "@/errors/error-factory";
import type {
  FinanceReconciliationAction,
} from "@/schema/finance-reconciliation";
import { SupabaseDB } from "@/utils/supabase/index";

export type FinanceReconciliationActionRecord = {
  id: string;
  tenant_id: string;
  exception_fingerprint: string;
  exception_code: string;
  subject_type: string;
  subject_id: string | null;
  project_id: string | null;
  action: FinanceReconciliationAction;
  remark: string;
  actor_employee_id: string | null;
  actor_employee_name: string | null;
  created_at: string;
};

export type CreateFinanceReconciliationActionInput = {
  tenantId: string;
  exceptionFingerprint: string;
  exceptionCode: string;
  subjectType: string;
  subjectId: string | null;
  projectId: string | null;
  action: FinanceReconciliationAction;
  remark: string;
  actorEmployeeId: string | null;
};

type ActionDbRow = {
  id: string;
  tenant_id: string;
  exception_fingerprint: string;
  exception_code: string;
  subject_type: string;
  subject_id: string | null;
  project_id: string | null;
  action: FinanceReconciliationAction;
  remark: string;
  actor_employee_id: string | null;
  created_at: string;
  actor_employee?: { name: string | null } | null;
};

class FinanceReconciliationActionsRepository {
  async listLatestActions(input: {
    tenantId: string;
    fingerprints: string[];
  }): Promise<Map<string, FinanceReconciliationActionRecord>> {
    const fingerprints = Array.from(new Set(input.fingerprints.filter(Boolean)));
    if (fingerprints.length === 0) return new Map();

    let query = SupabaseDB.getAdminClient()
      .from("finance_reconciliation_exception_actions")
      .select(`
        id,
        tenant_id,
        exception_fingerprint,
        exception_code,
        subject_type,
        subject_id,
        project_id,
        action,
        remark,
        actor_employee_id,
        created_at,
        actor_employee:employees!finance_reconciliation_exception_actions_actor_employee_id_fkey(name)
      `)
      .eq("tenant_id", input.tenantId)
      .in("exception_fingerprint", fingerprints)
      .order("created_at", { ascending: false })
      .limit(fingerprints.length * 5);

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询对账异常处理记录失败", error);
    }

    const latest = new Map<string, FinanceReconciliationActionRecord>();
    for (const row of (data || []) as unknown as ActionDbRow[]) {
      if (latest.has(row.exception_fingerprint)) continue;
      latest.set(row.exception_fingerprint, normalizeActionRow(row));
    }
    return latest;
  }

  async createAction(
    input: CreateFinanceReconciliationActionInput,
  ): Promise<FinanceReconciliationActionRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_reconciliation_exception_actions")
      .insert({
        tenant_id: input.tenantId,
        exception_fingerprint: input.exceptionFingerprint,
        exception_code: input.exceptionCode,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        project_id: input.projectId,
        action: input.action,
        remark: input.remark,
        actor_employee_id: input.actorEmployeeId,
      })
      .select(`
        id,
        tenant_id,
        exception_fingerprint,
        exception_code,
        subject_type,
        subject_id,
        project_id,
        action,
        remark,
        actor_employee_id,
        created_at,
        actor_employee:employees!finance_reconciliation_exception_actions_actor_employee_id_fkey(name)
      `)
      .single();

    if (error) {
      throw Errors.dbError("记录对账异常处理动作失败", error);
    }

    return normalizeActionRow(data as unknown as ActionDbRow);
  }
}

function normalizeActionRow(row: ActionDbRow): FinanceReconciliationActionRecord {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    exception_fingerprint: row.exception_fingerprint,
    exception_code: row.exception_code,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    project_id: row.project_id,
    action: row.action,
    remark: row.remark,
    actor_employee_id: row.actor_employee_id,
    actor_employee_name: row.actor_employee?.name ?? null,
    created_at: row.created_at,
  };
}

export const financeReconciliationActionsRepository =
  new FinanceReconciliationActionsRepository();
```

- [ ] **Step 3: Add test import scaffolding**

In `apps/api/src/services/finance-reconciliation.test.ts`, add mocks for `listLatestActions` and `createAction` near existing repository mocks:

```ts
const listLatestActions = mock(async () => new Map());
const createAction = mock(async () => ({
  id: "action-1",
  tenant_id: "tenant-1",
  exception_fingerprint: "payment_without_ledger:payment-without-ledger",
  exception_code: "payment_without_ledger",
  subject_type: "payment",
  subject_id: "payment-without-ledger",
  project_id: "project-3",
  action: "acknowledge",
  remark: "已通知财务复核",
  actor_employee_id: "employee-1",
  actor_employee_name: "财务",
  created_at: "2026-06-29T10:00:00.000Z",
}));
```

- [ ] **Step 4: Run focused schema typecheck**

Run:

```bash
bun run api:typecheck
```

Expected:

```text
tsc exits with code 0.
```

- [ ] **Step 5: Commit schema and repository**

Run:

```bash
git add apps/api/src/schema/finance-reconciliation.ts apps/api/src/repositories/finance-reconciliation-actions.ts apps/api/src/services/finance-reconciliation.test.ts
git commit -m "feat(finance): 增加对账异常处理仓库"
```

---

### Task 3: Backend Status Merge And Action API

**Files:**
- Modify: `apps/api/src/services/finance-reconciliation.ts`
- Modify: `apps/api/src/controllers/finance/index.ts`
- Modify: `apps/api/src/services/finance-reconciliation.test.ts`

- [ ] **Step 1: Add failing tests for status merge and filtering**

Add to `apps/api/src/services/finance-reconciliation.test.ts`:

```ts
test("merges latest exception action status by fingerprint", async () => {
  listLatestActions.mockImplementationOnce(async () =>
    new Map([
      ["payment_without_ledger:payment-without-ledger", {
        id: "action-1",
        tenant_id: "tenant-1",
        exception_fingerprint: "payment_without_ledger:payment-without-ledger",
        exception_code: "payment_without_ledger",
        subject_type: "payment",
        subject_id: "payment-without-ledger",
        project_id: "project-3",
        action: "acknowledge",
        remark: "已通知财务复核",
        actor_employee_id: "employee-1",
        actor_employee_name: "财务",
        created_at: "2026-06-29T10:00:00.000Z",
      }],
    ]),
  );
  const service = await createService();

  const result = await service.listExceptions(
    authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
    {
      page: 1,
      pageSize: 20,
      date_from: "2026-06-01",
      date_to: "2026-06-30",
      status: "acknowledged",
    },
  );

  expect(result.pagination.total).toBe(1);
  expect(result.list[0]).toEqual(
    expect.objectContaining({
      id: "payment-without-ledger",
      exception_fingerprint: "payment_without_ledger:payment-without-ledger",
      status: "acknowledged",
      last_action: "acknowledge",
      last_action_remark: "已通知财务复核",
      last_actor_employee_name: "财务",
      last_action_at: "2026-06-29T10:00:00.000Z",
    }),
  );
});
```

Add:

```ts
test("creates a reconciliation action without mutating finance source rows", async () => {
  const service = await createService();

  const result = await service.createExceptionAction(
    authContextWithPermissions([
      { code: "finance.view", scope: "all" },
      { code: "finance.reconciliation.manage", scope: "all" },
    ]),
    "payment_without_ledger:payment-without-ledger",
    {
      action: "acknowledge",
      remark: "已通知财务复核",
    },
  );

  expect(result.status).toBe("acknowledged");
  expect(createAction).toHaveBeenCalledWith({
    tenantId: "tenant-1",
    exceptionFingerprint: "payment_without_ledger:payment-without-ledger",
    exceptionCode: "payment_without_ledger",
    subjectType: "payment",
    subjectId: "payment-without-ledger",
    projectId: "project-3",
    action: "acknowledge",
    remark: "已通知财务复核",
    actorEmployeeId: "employee-1",
  });
  expect(getProjectSummaryTotals).not.toHaveBeenCalled();
});
```

Run:

```bash
bun test ./src/services/finance-reconciliation.test.ts
```

Expected:

```text
The new tests fail because createExceptionAction and action status merge are not implemented.
```

- [ ] **Step 2: Extend service dependencies and output types**

Modify imports in `apps/api/src/services/finance-reconciliation.ts`:

```ts
import {
  financeReconciliationActionsRepository,
  type FinanceReconciliationActionRecord,
} from "@/repositories/finance-reconciliation-actions";
import type {
  CreateFinanceReconciliationExceptionAction,
  FinanceReconciliationAction,
  FinanceReconciliationStatus,
} from "@/schema/finance-reconciliation";
```

Extend dependencies:

```ts
actionsRepository: Pick<
  typeof financeReconciliationActionsRepository,
  "listLatestActions" | "createAction"
>;
```

Default constructor adds:

```ts
actionsRepository: financeReconciliationActionsRepository,
```

Extend `FinanceReconciliationException`:

```ts
exception_fingerprint: string;
subject_type: "receivable" | "payment" | "ledger";
subject_id: string;
status: FinanceReconciliationStatus;
last_action: FinanceReconciliationAction | null;
last_action_at: string | null;
last_action_remark: string | null;
last_actor_employee_id: string | null;
last_actor_employee_name: string | null;
```

- [ ] **Step 3: Generate stable fingerprints**

In each exception builder, add fields:

```ts
exception_fingerprint: `${exception_code}:${row.id}`,
subject_type: "payment",
subject_id: row.id,
status: "open",
last_action: null,
last_action_at: null,
last_action_remark: null,
last_actor_employee_id: null,
last_actor_employee_name: null,
```

Use the concrete exception code in each builder:

- `receivable_overdue:${row.id}`
- `receivable_paid_amount_mismatch:${row.id}`
- `payment_without_ledger:${row.id}`
- `payment_unallocated:${row.id}`
- `allocation_amount_mismatch:${row.id}`
- `ledger_without_payment:${row.id}`

- [ ] **Step 4: Merge latest action records**

Add helpers in `apps/api/src/services/finance-reconciliation.ts`:

```ts
async function withActionState(input: {
  tenantId: string;
  exceptions: FinanceReconciliationException[];
  actionsRepository: Pick<
    typeof financeReconciliationActionsRepository,
    "listLatestActions"
  >;
}) {
  const actionMap = await input.actionsRepository.listLatestActions({
    tenantId: input.tenantId,
    fingerprints: input.exceptions.map((item) => item.exception_fingerprint),
  });

  return input.exceptions.map((item) =>
    applyActionState(item, actionMap.get(item.exception_fingerprint) ?? null)
  );
}

function applyActionState(
  item: FinanceReconciliationException,
  action: FinanceReconciliationActionRecord | null,
): FinanceReconciliationException {
  if (!action) return item;
  const status = action.action === "acknowledge"
    ? "acknowledged"
    : action.action === "ignore"
      ? "ignored"
      : action.action === "resolve"
        ? "resolved"
        : "open";
  return {
    ...item,
    status,
    last_action: action.action,
    last_action_at: action.created_at,
    last_action_remark: action.remark,
    last_actor_employee_id: action.actor_employee_id,
    last_actor_employee_name: action.actor_employee_name,
  };
}
```

In `listExceptions`, build raw exceptions, call `withActionState`, then filter.

- [ ] **Step 5: Filter by status and actor**

Modify `filterExceptions`:

```ts
(!query.status || item.status === query.status) &&
(!query.actor_employee_id || item.last_actor_employee_id === query.actor_employee_id)
```

Important: actor filtering must run after merging each exception's latest action. Do not push
`actor_employee_id` into `listLatestActions`, because that would find "latest action by this actor"
instead of "latest action on this exception, and that latest actor is this actor".

Remove the old early return for `query.status === "resolved"`.

- [ ] **Step 6: Add create action service method**

Add to `FinanceReconciliationService`:

```ts
async createExceptionAction(
  authContext: AuthContext,
  fingerprint: string,
  input: CreateFinanceReconciliationExceptionAction,
) {
  const tenantId = this.dependencies.accessPolicyService
    .assertTenantContext(authContext);
  this.assertCanManageReconciliation(authContext);

  const dateTo = toDateOnly(this.dependencies.now?.() ?? new Date());
  const candidates = await this.dependencies.repository.listCandidateRows({
    tenantId,
    dateFrom: "1970-01-01",
    dateTo,
  });
  const target = this.buildExceptions(candidates, dateTo)
    .find((item) => item.exception_fingerprint === fingerprint);
  if (!target) {
    throw Errors.notFound("对账异常不存在或已消失");
  }

  const record = await this.dependencies.actionsRepository.createAction({
    tenantId,
    exceptionFingerprint: target.exception_fingerprint,
    exceptionCode: target.exception_code,
    subjectType: target.subject_type,
    subjectId: target.subject_id,
    projectId: target.project_id,
    action: input.action,
    remark: input.remark,
    actorEmployeeId: authContext.employeeId ?? null,
  });

  return applyActionState(target, record);
}
```

Add:

```ts
private assertCanManageReconciliation(authContext: AuthContext) {
  if (!this.dependencies.accessPolicyService.hasPermission(
    authContext,
    "finance.reconciliation.manage",
  )) {
    throw Errors.forbidden();
  }
}
```

- [ ] **Step 7: Wire controller route**

Modify `apps/api/src/controllers/finance/index.ts` imports:

```ts
FinanceReconciliationExceptionActionParamsSchema,
CreateFinanceReconciliationExceptionActionSchema,
```

Add route:

```ts
@Post("/finance/reconciliation/exceptions/:fingerprint/actions")
async createReconciliationExceptionAction(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const authContext = await this.getRequiredTenantContext(request);
  const paramsResult = FinanceReconciliationExceptionActionParamsSchema
    .safeParse(request.params);
  if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

  const bodyResult = CreateFinanceReconciliationExceptionActionSchema
    .safeParse(request.body);
  if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

  const data = await financeReconciliationService.createExceptionAction(
    authContext,
    paramsResult.data.fingerprint,
    bodyResult.data,
  );
  return ResponseHandler.success(data);
}
```

- [ ] **Step 8: Run backend tests**

Run:

```bash
bun test ./src/services/finance-reconciliation.test.ts
bun run api:typecheck
```

Expected:

```text
finance-reconciliation tests pass and tsc exits with code 0.
```

- [ ] **Step 9: Commit backend API**

Run:

```bash
git add apps/api/src/controllers/finance/index.ts apps/api/src/schema/finance-reconciliation.ts apps/api/src/services/finance-reconciliation.ts apps/api/src/services/finance-reconciliation.test.ts
git commit -m "feat(finance): 增加对账异常处理接口"
```

---

### Task 4: Admin Reconciliation Actions

**Files:**
- Modify: `apps/admin/components/finance/finance-reconciliation-requests.ts`
- Modify: `apps/admin/components/finance/finance-reconciliation-utils.ts`
- Modify: `apps/admin/components/finance/finance-reconciliation-utils.test.ts`
- Create: `apps/admin/components/finance/finance-reconciliation-action-dialog.tsx`
- Modify: `apps/admin/components/finance/finance-reconciliation-table.tsx`
- Modify: `apps/admin/app/(console)/finance/reconciliation/page.tsx`

- [ ] **Step 1: Add helper tests**

In `apps/admin/components/finance/finance-reconciliation-utils.test.ts`, add:

```ts
test("maps reconciliation statuses and actions to labels", () => {
  expect(financeReconciliationStatusMeta("open")).toEqual({
    label: "未处理",
    variant: "warning",
  });
  expect(financeReconciliationStatusMeta("ignored")).toEqual({
    label: "已忽略",
    variant: "outline",
  });
  expect(financeReconciliationActionLabel("resolve")).toBe("标记已处理");
});
```

Run:

```bash
bun test components/finance/finance-reconciliation-utils.test.ts
```

Expected:

```text
The new test fails because status/action helpers do not exist yet.
```

- [ ] **Step 2: Extend Admin types and request mutation**

Modify `apps/admin/components/finance/finance-reconciliation-requests.ts`:

```ts
export type FinanceReconciliationStatus =
  | "open"
  | "acknowledged"
  | "ignored"
  | "resolved";

export type FinanceReconciliationAction =
  | "acknowledge"
  | "ignore"
  | "resolve"
  | "reopen";
```

Extend `FinanceReconciliationExceptionRecord`:

```ts
exception_fingerprint: string;
subject_type: "receivable" | "payment" | "ledger";
subject_id: string;
status: FinanceReconciliationStatus;
last_action: FinanceReconciliationAction | null;
last_action_at: string | null;
last_action_remark: string | null;
last_actor_employee_id: string | null;
last_actor_employee_name: string | null;
```

Add:

```ts
export async function submitFinanceReconciliationAction(input: {
  fingerprint: string;
  action: FinanceReconciliationAction;
  remark: string;
}) {
  const response = await fetch(
    `/api/backend/finance/reconciliation/exceptions/${
      encodeURIComponent(input.fingerprint)
    }/actions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: input.action,
        remark: input.remark,
      }),
    },
  );
  const payload = await response.json().catch(() => ({})) as {
    success?: boolean;
    message?: string;
    data?: FinanceReconciliationExceptionRecord;
  };
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || "对账异常处理失败");
  }
  return payload.data;
}
```

The fingerprint contains `:` separators, so every client caller must URL-encode it before putting it
into the route path.

- [ ] **Step 3: Add status helpers**

Modify `apps/admin/components/finance/finance-reconciliation-utils.ts`:

```ts
export function financeReconciliationStatusMeta(
  status: string | null | undefined,
) {
  if (status === "acknowledged") {
    return { label: "已确认", variant: "secondary" as const };
  }
  if (status === "ignored") {
    return { label: "已忽略", variant: "outline" as const };
  }
  if (status === "resolved") {
    return { label: "已处理", variant: "success" as const };
  }
  return { label: "未处理", variant: "warning" as const };
}

export function financeReconciliationActionLabel(action: string) {
  if (action === "acknowledge") return "确认";
  if (action === "ignore") return "忽略";
  if (action === "resolve") return "标记已处理";
  if (action === "reopen") return "重新打开";
  return "处理";
}
```

- [ ] **Step 4: Create action dialog**

Create `apps/admin/components/finance/finance-reconciliation-action-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
  FinanceReconciliationAction,
  FinanceReconciliationExceptionRecord,
} from "./finance-reconciliation-requests";
import {
  financeReconciliationActionLabel,
  financeReconciliationExceptionLabel,
} from "./finance-reconciliation-utils";
import { submitFinanceReconciliationAction } from "./finance-reconciliation-requests";

export type FinanceReconciliationActionDialogState = {
  row: FinanceReconciliationExceptionRecord;
  action: FinanceReconciliationAction;
} | null;

export function FinanceReconciliationActionDialog({
  state,
  onClose,
  onSaved,
}: {
  state: FinanceReconciliationActionDialogState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [remark, setRemark] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const actionLabel = state ? financeReconciliationActionLabel(state.action) : "处理";

  function submit() {
    if (!state) return;
    const normalizedRemark = remark.trim();
    if (normalizedRemark.length < 2) {
      setError("处理备注至少 2 个字符");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        await submitFinanceReconciliationAction({
          fingerprint: state.row.exception_fingerprint,
          action: state.action,
          remark: normalizedRemark,
        });
        setRemark("");
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "对账异常处理失败");
      }
    });
  }

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{actionLabel}对账异常</DialogTitle>
          <DialogDescription>
            {state
              ? `${financeReconciliationExceptionLabel(state.row.exception_code)}：${state.row.title}`
              : "处理对账异常"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="reconciliation-action-remark">
            处理备注
          </label>
          <Textarea
            id="reconciliation-action-remark"
            value={remark}
            onChange={(event) => {
              setRemark(event.target.value);
              setError("");
            }}
            placeholder="说明处理原因、核对结论或后续跟进人"
            className="min-h-28"
          />
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "提交中" : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Add actions to table**

Modify `apps/admin/components/finance/finance-reconciliation-table.tsx`:

```tsx
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FinanceReconciliationActionDialog,
  type FinanceReconciliationActionDialogState,
} from "./finance-reconciliation-action-dialog";
```

Inside component:

```tsx
const router = useRouter();
const [dialogState, setDialogState] =
  useState<FinanceReconciliationActionDialogState>(null);
```

Add status column using `financeReconciliationStatusMeta`.

Replace action cell with link plus dropdown:

```tsx
<div className="flex items-center justify-end gap-1">
  <Button asChild variant="ghost" size="sm" className="h-8 px-2">
    <Link href={financeReconciliationActionHref(row.original.action.target)}>
      {row.original.action.label || "查看"}
      <ArrowUpRight data-icon="inline-end" />
    </Link>
  </Button>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="icon" className="size-8">
        <MoreHorizontal className="size-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => setDialogState({ row: row.original, action: "acknowledge" })}>
        确认
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setDialogState({ row: row.original, action: "ignore" })}>
        忽略
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setDialogState({ row: row.original, action: "resolve" })}>
        标记已处理
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setDialogState({ row: row.original, action: "reopen" })}>
        重新打开
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</div>
```

Render dialog below `DataTable`:

```tsx
<FinanceReconciliationActionDialog
  state={dialogState}
  onClose={() => setDialogState(null)}
  onSaved={() => {
    setDialogState(null);
    router.refresh();
  }}
/>
```

- [ ] **Step 6: Add status filter to page**

In `apps/admin/app/(console)/finance/reconciliation/page.tsx`, add `status?: string` and `actor_employee_id?: string` to `FinanceReconciliationPageSearchParams`.

Add:

```ts
const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "open", label: "未处理" },
  { value: "acknowledged", label: "已确认" },
  { value: "ignored", label: "已忽略" },
  { value: "resolved", label: "已处理" },
];
```

Pass `status` and `actor_employee_id` into `fetchFinanceReconciliationExceptions` and `reconciliationPageHref`.

Add a `FinanceFilterSelectField`:

```tsx
<FinanceFilterSelectField
  id="reconciliation-status"
  name="status"
  label="处理状态"
  value={params.status}
  options={STATUS_OPTIONS}
/>
```

Add actor input:

```tsx
<Input
  id="reconciliation-actor-employee-id"
  name="actor_employee_id"
  defaultValue={params.actor_employee_id || ""}
  placeholder="按处理人 ID 精确筛选"
  className="h-9"
/>
```

- [ ] **Step 7: Run Admin tests and typecheck**

Run:

```bash
bun test components/finance/finance-reconciliation-utils.test.ts
pnpm --dir apps/admin run check
```

Expected:

```text
The helper test passes and Admin typecheck exits with code 0.
```

- [ ] **Step 8: Commit Admin actions**

Run:

```bash
git add apps/admin/app/'(console)'/finance/reconciliation/page.tsx apps/admin/components/finance/finance-reconciliation-requests.ts apps/admin/components/finance/finance-reconciliation-utils.ts apps/admin/components/finance/finance-reconciliation-utils.test.ts apps/admin/components/finance/finance-reconciliation-action-dialog.tsx apps/admin/components/finance/finance-reconciliation-table.tsx
git commit -m "feat(admin): 增加对账异常处理入口"
```

---

### Task 5: Project Reconciliation Summary Enhancements

**Files:**
- Modify: `apps/api/src/services/finance-reconciliation.ts`
- Modify: `apps/api/src/services/finance-reconciliation.test.ts`
- Modify: `apps/admin/components/projects/project-finance-reconciliation-summary-utils.ts`
- Modify: `apps/admin/components/projects/project-finance-reconciliation-summary-utils.test.ts`
- Modify: `apps/admin/components/projects/project-finance-reconciliation-summary-panel.tsx`

- [ ] **Step 1: Add API summary fields**

Extend `FinanceReconciliationProjectSummary` in `apps/api/src/services/finance-reconciliation.ts`:

```ts
open_exception_count: number;
acknowledged_exception_count: number;
ignored_exception_count: number;
resolved_exception_count: number;
latest_action_at: string | null;
latest_action_remark: string | null;
latest_actor_employee_name: string | null;
```

In `getProjectSummary`, merge action state like list exceptions, then calculate counts by `status`.

- [ ] **Step 2: Add service test**

In `apps/api/src/services/finance-reconciliation.test.ts`, update `returns project reconciliation summary with exception counts` expected result with:

```ts
open_exception_count: 6,
acknowledged_exception_count: 0,
ignored_exception_count: 0,
resolved_exception_count: 0,
latest_action_at: null,
latest_action_remark: null,
latest_actor_employee_name: null,
```

Add a second summary test:

```ts
test("returns project reconciliation summary with latest action state", async () => {
  listLatestActions.mockImplementationOnce(async () =>
    new Map([
      ["ledger_without_payment:ledger-without-payment", {
        id: "action-2",
        tenant_id: "tenant-1",
        exception_fingerprint: "ledger_without_payment:ledger-without-payment",
        exception_code: "ledger_without_payment",
        subject_type: "ledger",
        subject_id: "ledger-without-payment",
        project_id: "project-7",
        action: "ignore",
        remark: "历史手工流水保留",
        actor_employee_id: "employee-1",
        actor_employee_name: "财务",
        created_at: "2026-06-29T11:00:00.000Z",
      }],
    ]),
  );
  const service = await createService();

  const result = await service.getProjectSummary(
    authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
    "project-1",
  );

  expect(result.ignored_exception_count).toBe(1);
  expect(result.latest_action_remark).toBe("历史手工流水保留");
  expect(result.latest_actor_employee_name).toBe("财务");
});
```

- [ ] **Step 3: Update Admin project summary types and cards**

Modify `apps/admin/components/projects/project-finance-reconciliation-summary-utils.ts` type:

```ts
open_exception_count: number;
acknowledged_exception_count: number;
ignored_exception_count: number;
resolved_exception_count: number;
latest_action_at: string | null;
latest_action_remark: string | null;
latest_actor_employee_name: string | null;
```

Update the `exceptions` check helper:

```ts
helper: `未处理 ${summary.open_exception_count} 条 / 已处理 ${summary.resolved_exception_count} 条`,
```

- [ ] **Step 4: Update panel footer**

Modify `apps/admin/components/projects/project-finance-reconciliation-summary-panel.tsx` footer:

```tsx
<span>
  最近处理：{formatFinanceDateTime(summary.latest_action_at)}
</span>
<span>
  处理人：{summary.latest_actor_employee_name || "-"}
</span>
<span>
  处理备注：{summary.latest_action_remark || "-"}
</span>
```

- [ ] **Step 5: Run tests**

Run:

```bash
bun test ./src/services/finance-reconciliation.test.ts
bun test components/projects/project-finance-reconciliation-summary-utils.test.ts
pnpm --dir apps/admin run check
bun run api:typecheck
```

Expected:

```text
Both Bun test commands pass, Admin check exits with code 0, API typecheck exits with code 0.
```

- [ ] **Step 6: Commit project summary**

Run:

```bash
git add apps/api/src/services/finance-reconciliation.ts apps/api/src/services/finance-reconciliation.test.ts apps/admin/components/projects/project-finance-reconciliation-summary-utils.ts apps/admin/components/projects/project-finance-reconciliation-summary-utils.test.ts apps/admin/components/projects/project-finance-reconciliation-summary-panel.tsx
git commit -m "feat(finance): 增强项目对账处理摘要"
```

---

### Task 6: Verification, Migration Apply, And Handoff

**Files:**
- Create: `docs/decoration-finance/2026-06-29-phase7-1-reconciliation-closure-smoke.md`
- Modify: `docs/decoration-finance/README.md`

- [ ] **Step 1: Run full focused verification**

Run from repo root:

```bash
bun test ./src/services/finance-reconciliation.test.ts ./src/services/finance-operating-report.test.ts ./src/services/project-receivables.test.ts ./src/services/finance-ledger.test.ts
bun run api:typecheck
pnpm --dir apps/admin run check
git diff --check
bun scripts/check-file-size.ts
```

Expected:

```text
All commands exit with code 0.
```

- [ ] **Step 2: Apply migration in the target environment**

Run the project-approved migration command for the current Supabase environment:

```bash
supabase migration list
supabase db push
supabase migration list
```

Expected:

```text
The before list shows the new migration pending remotely. The after list shows Local and Remote aligned for 20260629143000_finance_reconciliation_exception_actions.sql.
```

If this environment does not have Supabase CLI credentials available, do not run ad hoc SQL. Record the blocker in the smoke document and leave the migration unapplied.

- [ ] **Step 3: Smoke API with authenticated finance manager**

Use `18800005001 / 小龙女` against the local API:

```bash
POST /admin/auth/login
GET /finance/reconciliation/exceptions?page=1&pageSize=5&status=open
POST /finance/reconciliation/exceptions/{fingerprint}/actions
GET /finance/reconciliation/exceptions?page=1&pageSize=5&status=acknowledged
GET /finance/reconciliation/project/{projectId}
```

Expected:

```text
Login returns 200. The action POST returns 200. The acknowledged list includes the fingerprint. Project summary includes updated action fields. No request mutates payment, receivable, allocation, or ledger rows.
```

- [ ] **Step 4: Smoke Admin**

Use Admin `http://127.0.0.1:3010`:

```text
1. Open /finance/reconciliation.
2. Filter status = 未处理.
3. Open row action menu.
4. Submit 确认 with remark "Phase 7.1 smoke 确认".
5. Filter status = 已确认.
6. Open project detail overview and check 对账摘要.
```

Expected:

```text
The row moves from open to acknowledged. The action record appears in the list response. Browser console has 0 errors.
```

- [ ] **Step 5: Create smoke handoff doc**

Create `docs/decoration-finance/2026-06-29-phase7-1-reconciliation-closure-smoke.md`:

```md
# Phase 7.1 财务对账异常闭环 Smoke

日期：2026-06-29

## 范围

- 对账异常 action 表 migration。
- 对账异常状态合并。
- 对账异常处理动作 API。
- Admin 对账异常处理入口。
- 项目详情对账处理摘要。

## 验证结果

- API 测试：记录命令、退出码、通过数量。
- Admin 检查：记录命令、退出码、typecheck 结果。
- Migration 状态：记录 `supabase migration list` 前后对齐状态；如果无法执行，记录无法执行的具体原因。
- API smoke：记录登录账号、请求路径、HTTP status、目标 fingerprint、action id。
- Admin smoke：记录页面路径、操作动作、处理后状态、浏览器 console error 数量。

## 小程序结论

小程序无必改。小程序不调用 `/finance/reconciliation/*`，不处理异常，不本地计算对账状态。

## 风险

- 异常本身仍是实时计算结果；处理动作只是审计和人工闭环，不代表业务数据已自动修复。
```

- [ ] **Step 6: Update README index**

Add to `docs/decoration-finance/README.md`:

```md
- [2026-06-29-phase7-1-reconciliation-closure-smoke.md](./2026-06-29-phase7-1-reconciliation-closure-smoke.md)：Phase 7.1 财务对账异常处理闭环 smoke 和小程序无必改回执。
```

- [ ] **Step 7: Commit verification docs**

Run:

```bash
git add docs/decoration-finance/2026-06-29-phase7-1-reconciliation-closure-smoke.md docs/decoration-finance/README.md
git commit -m "docs(finance): 记录phase7.1对账闭环smoke"
```

---

## Final Completion Checklist

Before merging this branch:

- [ ] `git status --short` is clean.
- [ ] `bun test ./src/services/finance-reconciliation.test.ts ./src/services/finance-operating-report.test.ts ./src/services/project-receivables.test.ts ./src/services/finance-ledger.test.ts` passes.
- [ ] `bun run api:typecheck` passes.
- [ ] `pnpm --dir apps/admin run check` passes.
- [ ] `git diff --check` passes.
- [ ] `bun scripts/check-file-size.ts` passes.
- [ ] Migration status is documented.
- [ ] Admin handoff is documented.
- [ ] 小程序无必改结论 is documented.

## Review Notes

- The closure action table is append-only. Do not update existing action rows for status changes.
- `resolved` means “manual closure recorded”, not “backend repaired finance data”.
- `ignored` is appropriate for historical/manual records where the finance team intentionally accepts the mismatch.
- `reopen` makes the computed exception visible as `open` again.
- Do not add automatic updates to `payments`, `project_receivable_plans`, `project_receivable_allocations`, or `finance_ledger_entries` in this phase.
