# Finance Correction Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only finance correction audit API and Admin page for tracing manual receivable allocation and ledger repair actions.

**Architecture:** The API adds a dedicated `/finance/correction-audits` read model that aggregates existing `project_receivable_events` and `finance_ledger_entries` audit fields into one DTO. Admin adds a finance tab that fetches that read model server-side and renders compact filters, KPI cards, and a read-only table. No database migration or new write path is part of this plan.

**Tech Stack:** Bun + TypeScript + Fastify + Supabase for API, Next.js + shadcn/Radix + Tailwind + TanStack Table for Admin, `bun:test` for focused unit tests.

---

## Working Directory

Use the isolated worktree:

```bash
cd /Users/leefo/Public/work/gooes/.worktrees/finance-correction-audit
git status --short --branch
```

Expected: `## feat/finance-correction-audit...origin/feat/finance-correction-audit` with no uncommitted files before starting.

## File Structure

Create:

- `apps/api/src/schema/finance-correction-audits.ts`
  - Owns query validation, operation enum, DTO types, and summary type.
- `apps/api/src/repositories/finance-correction-audits.ts`
  - Owns bounded Supabase reads from `project_receivable_events` and `finance_ledger_entries`.
- `apps/api/src/services/finance-correction-audits.ts`
  - Owns permission check, multi-source normalization, sorting, pagination, and summary.
- `apps/api/src/services/finance-correction-audits.test.ts`
  - Proves permission, operation mapping, summary, filters, and pagination behavior.
- `apps/admin/app/(console)/finance/audits/page.tsx`
  - Server component page for the Admin finance audit tab.
- `apps/admin/components/finance/finance-correction-audit-requests.ts`
  - Owns backend fetch, typed API response, employee filter options, and empty fallback.
- `apps/admin/components/finance/finance-correction-audit-table.tsx`
  - Client table component with read-only row actions.
- `apps/admin/components/finance/finance-correction-audit-utils.ts`
  - Owns labels, badges, target href sanitization, query param building, and date display helpers.
- `apps/admin/components/finance/finance-correction-audit-utils.test.ts`
  - Proves Admin labels, hrefs, and query params.

Modify:

- `apps/api/src/controllers/finance/index.ts`
  - Add the new GET route and wire schema to service.
- `apps/admin/components/finance/finance-module-tabs.tsx`
  - Add `audits` tab.
- `apps/admin/components/finance/finance-module-tabs.test.ts`
  - Prove the tab is visible.

Do not create migrations, write operations, export actions, miniprogram code, or new dependencies.

---

### Task 1: API Schema And Service Contract

**Files:**
- Create: `apps/api/src/schema/finance-correction-audits.ts`
- Create: `apps/api/src/services/finance-correction-audits.ts`
- Create: `apps/api/src/services/finance-correction-audits.test.ts`

- [ ] **Step 1: Write the failing service tests**

Create `apps/api/src/services/finance-correction-audits.test.ts` with this structure:

```typescript
import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const listReceivableCorrectionEvents = mock(async () => ({
  list: [
    {
      id: "event-allocate",
      tenant_id: "tenant-1",
      project_id: "project-1",
      project_name: "张三施工项目",
      receivable_plan_id: "plan-1",
      event_type: "allocate_payment",
      title: "人工核销收款",
      note: "历史收款补核销",
      before_snapshot: { paid_amount: 0 },
      after_snapshot: { paid_amount: 1000, amount: 1000, status: "paid" },
      created_by: "employee-1",
      created_by_name: "财务甲",
      created_at: "2026-06-30T10:00:00.000Z",
    },
    {
      id: "event-adjust",
      tenant_id: "tenant-1",
      project_id: "project-1",
      project_name: "张三施工项目",
      receivable_plan_id: "plan-1",
      event_type: "adjust_allocation",
      title: "调整核销金额",
      note: "金额修正",
      before_snapshot: { id: "allocation-1", amount: 800 },
      after_snapshot: { id: "allocation-1", amount: 1000, payment_id: "payment-1" },
      created_by: "employee-1",
      created_by_name: "财务甲",
      created_at: "2026-06-30T11:00:00.000Z",
    },
  ],
  total: 2,
}));

const listLedgerCorrectionAudits = mock(async () => ({
  list: [
    {
      id: "ledger-1",
      tenant_id: "tenant-1",
      project_id: "project-1",
      project_name: "张三施工项目",
      amount: 1000,
      payment_id: "payment-1",
      payment_linked_at: "2026-06-30T12:00:00.000Z",
      payment_linked_by: "employee-2",
      payment_linked_by_name: "主管乙",
      payment_link_reason: "历史台账补关联",
      legacy_payment_ledger_marked_at: null,
      legacy_payment_ledger_marked_by: null,
      legacy_payment_ledger_marked_by_name: null,
      legacy_payment_ledger_reason: null,
      metadata: { operation: "link_ledger_payment" },
    },
    {
      id: "ledger-legacy",
      tenant_id: "tenant-1",
      project_id: "project-2",
      project_name: "李四施工项目",
      amount: 2000,
      payment_id: null,
      payment_linked_at: null,
      payment_linked_by: null,
      payment_linked_by_name: null,
      payment_link_reason: null,
      legacy_payment_ledger_marked_at: "2026-06-30T09:00:00.000Z",
      legacy_payment_ledger_marked_by: "employee-2",
      legacy_payment_ledger_marked_by_name: "主管乙",
      legacy_payment_ledger_reason: "2025 历史流水",
      metadata: { operation: "mark_legacy_ledger" },
    },
  ],
  total: 2,
}));

mock.module("@/repositories/finance-correction-audits", () => ({
  financeCorrectionAuditRepository: {
    listReceivableCorrectionEvents,
    listLedgerCorrectionAudits,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock((authContext: AuthContext) => authContext.tenantId),
    hasPermission: mock((authContext: AuthContext, permissionCode: string) =>
      authContext.permissions.some((permission) => permission.code === permissionCode)
    ),
  },
}));

const baseAuthContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "财务",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: "FINANCE",
  departmentName: "财务部",
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
} satisfies Omit<AuthContext, "permissions">;

function authContextWithPermissions(
  permissions: AuthContext["permissions"],
): AuthContext {
  return {
    ...baseAuthContext,
    permissions,
  };
}

describe("financeCorrectionAuditService", () => {
  beforeEach(() => {
    listReceivableCorrectionEvents.mockClear();
    listLedgerCorrectionAudits.mockClear();
  });

  test("requires reconciliation manage permission", async () => {
    const { financeCorrectionAuditService } = await import("./finance-correction-audits");

    await expect(
      financeCorrectionAuditService.listAudits(
        authContextWithPermissions([{ code: "finance.receivable.manage", scope: "all" }]),
        { page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test("merges receivable and ledger correction records sorted by occurrence time", async () => {
    const { financeCorrectionAuditService } = await import("./finance-correction-audits");

    const result = await financeCorrectionAuditService.listAudits(
      authContextWithPermissions([{ code: "finance.reconciliation.manage", scope: "all" }]),
      { page: 1, pageSize: 20 },
    );

    expect(result.summary).toEqual({
      total: 4,
      ledger_repair: 2,
      receivable_allocation: 2,
    });
    expect(result.list.map((item) => item.operation)).toEqual([
      "link_ledger_payment",
      "adjust_allocation",
      "manual_allocation",
      "mark_legacy_ledger",
    ]);
    expect(result.list[0]).toMatchObject({
      id: "ledger:ledger-1:link_ledger_payment",
      operation_label: "关联收款",
      domain: "ledger",
      project_name: "张三施工项目",
      actor_employee_name: "主管乙",
      payment_id: "payment-1",
      ledger_id: "ledger-1",
      target: {
        label: "查看台账流水",
        href: "/finance/ledger?ledger_id=ledger-1",
      },
    });
    expect(result.list[1].allocation_id).toBe("allocation-1");
    expect(result.list[2]).toMatchObject({
      operation: "manual_allocation",
      allocation_id: null,
      target: {
        label: "查看应收计划",
        href: "/finance/receivables?project_id=project-1&receivable_plan_id=plan-1",
      },
    });
  });

  test("forwards filters and paginates after merging sources", async () => {
    const { financeCorrectionAuditService } = await import("./finance-correction-audits");

    const result = await financeCorrectionAuditService.listAudits(
      authContextWithPermissions([{ code: "finance.reconciliation.manage", scope: "all" }]),
      {
        page: 2,
        pageSize: 2,
        operation: "manual_allocation",
        project_id: "11111111-1111-4111-8111-111111111111",
        actor_employee_id: "22222222-2222-4222-8222-222222222222",
        date_from: "2026-06-01",
        date_to: "2026-06-30",
      },
    );

    expect(listReceivableCorrectionEvents).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      query: {
        page: 2,
        pageSize: 2,
        operation: "manual_allocation",
        project_id: "11111111-1111-4111-8111-111111111111",
        actor_employee_id: "22222222-2222-4222-8222-222222222222",
        date_from: "2026-06-01",
        date_to: "2026-06-30",
      },
      candidateLimit: 4,
    });
    expect(listLedgerCorrectionAudits).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      query: {
        page: 2,
        pageSize: 2,
        operation: "manual_allocation",
        project_id: "11111111-1111-4111-8111-111111111111",
        actor_employee_id: "22222222-2222-4222-8222-222222222222",
        date_from: "2026-06-01",
        date_to: "2026-06-30",
      },
      candidateLimit: 4,
    });
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 2,
      total: 4,
      totalPages: 2,
    });
    expect(result.list).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the API test and verify RED**

```bash
cd apps/api
bun test src/services/finance-correction-audits.test.ts
```

Expected: FAIL because `./finance-correction-audits` and `@/repositories/finance-correction-audits` do not exist.

- [ ] **Step 3: Add schema and service implementation**

Create `apps/api/src/schema/finance-correction-audits.ts`:

```typescript
import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";

function optionalQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value === "string") {
      const normalized = value.trim();
      return normalized || undefined;
    }
    return value;
  }, schema.optional());
}

export const FinanceCorrectionAuditOperationSchema = z.enum([
  "manual_allocation",
  "adjust_allocation",
  "reverse_allocation",
  "generate_payment_ledger",
  "link_ledger_payment",
  "mark_legacy_ledger",
]);

export type FinanceCorrectionAuditOperation =
  z.infer<typeof FinanceCorrectionAuditOperationSchema>;

export const FinanceCorrectionAuditListQuerySchema = PaginationQuerySchema.extend({
  operation: optionalQueryValue(FinanceCorrectionAuditOperationSchema),
  project_id: optionalQueryValue(z.uuid("请选择有效的项目")),
  actor_employee_id: optionalQueryValue(z.uuid("请选择有效的操作人")),
  date_from: optionalQueryValue(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "开始日期格式必须为 YYYY-MM-DD"),
  ),
  date_to: optionalQueryValue(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "结束日期格式必须为 YYYY-MM-DD"),
  ),
});

export type FinanceCorrectionAuditListQuery =
  z.infer<typeof FinanceCorrectionAuditListQuerySchema>;

export type FinanceCorrectionAuditDomain = "receivable" | "ledger";

export type FinanceCorrectionAuditRecord = {
  id: string;
  operation: FinanceCorrectionAuditOperation;
  operation_label: string;
  domain: FinanceCorrectionAuditDomain;
  project_id: string | null;
  project_name: string | null;
  actor_employee_id: string | null;
  actor_employee_name: string | null;
  occurred_at: string;
  reason: string | null;
  amount: number | null;
  receivable_plan_id: string | null;
  allocation_id: string | null;
  payment_id: string | null;
  ledger_id: string | null;
  target: {
    label: string;
    href: string;
  };
};

export type FinanceCorrectionAuditSummary = {
  total: number;
  ledger_repair: number;
  receivable_allocation: number;
};
```

Create `apps/api/src/services/finance-correction-audits.ts`:

```typescript
import { Errors } from "@/errors/error-factory";
import {
  financeCorrectionAuditRepository,
  type LedgerCorrectionAuditRow,
  type ReceivableCorrectionEventRow,
} from "@/repositories/finance-correction-audits";
import type {
  FinanceCorrectionAuditListQuery,
  FinanceCorrectionAuditOperation,
  FinanceCorrectionAuditRecord,
} from "@/schema/finance-correction-audits";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

type Dependencies = {
  repository: Pick<
    typeof financeCorrectionAuditRepository,
    "listReceivableCorrectionEvents" | "listLedgerCorrectionAudits"
  >;
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission"
  >;
};

const OPERATION_LABELS: Record<FinanceCorrectionAuditOperation, string> = {
  manual_allocation: "人工核销",
  adjust_allocation: "调整核销",
  reverse_allocation: "撤销核销",
  generate_payment_ledger: "补生成收款台账",
  link_ledger_payment: "关联收款",
  mark_legacy_ledger: "标记历史流水",
};

export class FinanceCorrectionAuditService {
  constructor(
    private readonly dependencies: Dependencies = {
      repository: financeCorrectionAuditRepository,
      accessPolicyService,
    },
  ) {}

  async listAudits(
    authContext: AuthContext,
    query: FinanceCorrectionAuditListQuery,
  ) {
    const tenantId = this.requireView(authContext);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const candidateLimit = page * pageSize;
    const [receivableResult, ledgerResult] = await Promise.all([
      this.dependencies.repository.listReceivableCorrectionEvents({
        tenantId,
        query,
        candidateLimit,
      }),
      this.dependencies.repository.listLedgerCorrectionAudits({
        tenantId,
        query,
        candidateLimit,
      }),
    ]);

    const receivableRecords = receivableResult.list
      .map((row) => this.mapReceivableEvent(row))
      .filter((record): record is FinanceCorrectionAuditRecord => Boolean(record));
    const ledgerRecords = ledgerResult.list
      .flatMap((row) => this.mapLedgerRow(row));
    const allRecords = [...receivableRecords, ...ledgerRecords]
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    const from = (page - 1) * pageSize;
    const list = allRecords.slice(from, from + pageSize);
    const total = receivableResult.total + ledgerResult.total;

    return {
      list,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
      summary: {
        total,
        ledger_repair: ledgerResult.total,
        receivable_allocation: receivableResult.total,
      },
    };
  }

  private requireView(authContext: AuthContext) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    if (
      !this.dependencies.accessPolicyService.hasPermission(
        authContext,
        "finance.reconciliation.manage",
      )
    ) {
      throw Errors.forbidden();
    }
    return tenantId;
  }

  private mapReceivableEvent(
    row: ReceivableCorrectionEventRow,
  ): FinanceCorrectionAuditRecord | null {
    const operation = receivableEventOperation(row.event_type);
    if (!operation) return null;
    const allocationId = readString(row.after_snapshot, "id") ??
      readString(row.before_snapshot, "id");
    const paymentId = readString(row.after_snapshot, "payment_id") ??
      readString(row.before_snapshot, "payment_id");
    const amount = readNumber(row.after_snapshot, "amount") ??
      readNumber(row.before_snapshot, "amount");
    const href = new URLSearchParams();
    href.set("project_id", row.project_id);
    href.set("receivable_plan_id", row.receivable_plan_id);
    if (allocationId) href.set("allocation_id", allocationId);

    return {
      id: `receivable:${row.id}`,
      operation,
      operation_label: OPERATION_LABELS[operation],
      domain: "receivable",
      project_id: row.project_id,
      project_name: row.project_name,
      actor_employee_id: row.created_by,
      actor_employee_name: row.created_by_name,
      occurred_at: row.created_at,
      reason: row.note,
      amount,
      receivable_plan_id: row.receivable_plan_id,
      allocation_id: allocationId,
      payment_id: paymentId,
      ledger_id: null,
      target: {
        label: "查看应收计划",
        href: `/finance/receivables?${href}`,
      },
    };
  }

  private mapLedgerRow(row: LedgerCorrectionAuditRow): FinanceCorrectionAuditRecord[] {
    const records: FinanceCorrectionAuditRecord[] = [];
    if (row.payment_linked_at) {
      records.push({
        id: `ledger:${row.id}:link_ledger_payment`,
        operation: "link_ledger_payment",
        operation_label: OPERATION_LABELS.link_ledger_payment,
        domain: "ledger",
        project_id: row.project_id,
        project_name: row.project_name,
        actor_employee_id: row.payment_linked_by,
        actor_employee_name: row.payment_linked_by_name,
        occurred_at: row.payment_linked_at,
        reason: row.payment_link_reason,
        amount: row.amount,
        receivable_plan_id: null,
        allocation_id: null,
        payment_id: row.payment_id,
        ledger_id: row.id,
        target: ledgerTarget(row.id),
      });
    }
    if (row.legacy_payment_ledger_marked_at) {
      records.push({
        id: `ledger:${row.id}:mark_legacy_ledger`,
        operation: "mark_legacy_ledger",
        operation_label: OPERATION_LABELS.mark_legacy_ledger,
        domain: "ledger",
        project_id: row.project_id,
        project_name: row.project_name,
        actor_employee_id: row.legacy_payment_ledger_marked_by,
        actor_employee_name: row.legacy_payment_ledger_marked_by_name,
        occurred_at: row.legacy_payment_ledger_marked_at,
        reason: row.legacy_payment_ledger_reason,
        amount: row.amount,
        receivable_plan_id: null,
        allocation_id: null,
        payment_id: row.payment_id,
        ledger_id: row.id,
        target: ledgerTarget(row.id),
      });
    }
    return records;
  }
}

function receivableEventOperation(
  eventType: string,
): FinanceCorrectionAuditOperation | null {
  if (eventType === "allocate_payment") return "manual_allocation";
  if (eventType === "adjust_allocation") return "adjust_allocation";
  if (eventType === "reverse_allocation") return "reverse_allocation";
  return null;
}

function readString(
  record: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(
  record: Record<string, unknown> | null,
  key: string,
): number | null {
  const value = record?.[key];
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function ledgerTarget(ledgerId: string) {
  return {
    label: "查看台账流水",
    href: `/finance/ledger?ledger_id=${ledgerId}`,
  };
}

export const financeCorrectionAuditService = new FinanceCorrectionAuditService();
```

- [ ] **Step 4: Run the API service test and verify GREEN**

```bash
cd apps/api
bun test src/services/finance-correction-audits.test.ts
```

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/api/src/schema/finance-correction-audits.ts \
  apps/api/src/services/finance-correction-audits.ts \
  apps/api/src/services/finance-correction-audits.test.ts
git commit -m "feat(finance): 增加修正审计服务契约"
```

---

### Task 2: API Repository And Controller Route

**Files:**
- Create: `apps/api/src/repositories/finance-correction-audits.ts`
- Modify: `apps/api/src/controllers/finance/index.ts`
- Test: `apps/api/src/services/finance-correction-audits.test.ts`

- [ ] **Step 1: Add a failing test for query validation pagination max**

Append this test to `apps/api/src/services/finance-correction-audits.test.ts`:

```typescript
test("schema caps page size and parses optional filters", async () => {
  const { FinanceCorrectionAuditListQuerySchema } = await import(
    "@/schema/finance-correction-audits"
  );

  const parsed = FinanceCorrectionAuditListQuerySchema.parse({
    page: "3",
    pageSize: "100",
    operation: "link_ledger_payment",
    project_id: "11111111-1111-4111-8111-111111111111",
    actor_employee_id: "22222222-2222-4222-8222-222222222222",
    date_from: "2026-06-01",
    date_to: "2026-06-30",
  });

  expect(parsed).toEqual({
    page: 3,
    pageSize: 100,
    operation: "link_ledger_payment",
    project_id: "11111111-1111-4111-8111-111111111111",
    actor_employee_id: "22222222-2222-4222-8222-222222222222",
    date_from: "2026-06-01",
    date_to: "2026-06-30",
  });
  expect(() =>
    FinanceCorrectionAuditListQuerySchema.parse({ pageSize: "101" })
  ).toThrow();
});
```

- [ ] **Step 2: Run the test and verify RED if schema max is missing**

```bash
cd apps/api
bun test src/services/finance-correction-audits.test.ts
```

Expected: PASS if Task 1 schema already uses `PaginationQuerySchema`. If it passes immediately, keep the test because it protects the list pagination invariant.

- [ ] **Step 3: Implement repository bounded reads**

Create `apps/api/src/repositories/finance-correction-audits.ts`:

```typescript
import { Errors } from "@/errors/error-factory";
import type {
  FinanceCorrectionAuditListQuery,
  FinanceCorrectionAuditOperation,
} from "@/schema/finance-correction-audits";
import { SupabaseDB } from "@/utils/supabase/index";

export type ReceivableCorrectionEventRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  project_name: string | null;
  receivable_plan_id: string;
  event_type: "allocate_payment" | "adjust_allocation" | "reverse_allocation";
  title: string;
  note: string | null;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
};

export type LedgerCorrectionAuditRow = {
  id: string;
  tenant_id: string;
  project_id: string | null;
  project_name: string | null;
  amount: number | null;
  payment_id: string | null;
  payment_linked_at: string | null;
  payment_linked_by: string | null;
  payment_linked_by_name: string | null;
  payment_link_reason: string | null;
  legacy_payment_ledger_marked_at: string | null;
  legacy_payment_ledger_marked_by: string | null;
  legacy_payment_ledger_marked_by_name: string | null;
  legacy_payment_ledger_reason: string | null;
  metadata: Record<string, unknown> | null;
};

type ListInput = {
  tenantId: string;
  query: FinanceCorrectionAuditListQuery;
  candidateLimit: number;
};

const RECEIVABLE_EVENT_OPERATIONS: Record<string, FinanceCorrectionAuditOperation> = {
  allocate_payment: "manual_allocation",
  adjust_allocation: "adjust_allocation",
  reverse_allocation: "reverse_allocation",
};

class FinanceCorrectionAuditRepository {
  async listReceivableCorrectionEvents(input: ListInput): Promise<{
    list: ReceivableCorrectionEventRow[];
    total: number;
  }> {
    const eventTypes = receivableEventTypesForOperation(input.query.operation);
    if (input.query.operation && eventTypes.length === 0) {
      return { list: [], total: 0 };
    }

    let request = SupabaseDB.getAdminClient()
      .from("project_receivable_events")
      .select(`
        id,
        tenant_id,
        project_id,
        receivable_plan_id,
        event_type,
        title,
        note,
        before_snapshot,
        after_snapshot,
        created_by,
        created_at,
        project:projects!project_receivable_events_project_id_fkey(id, name),
        creator:employees!project_receivable_events_created_by_fkey(id, name)
      `, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .in("event_type", eventTypes)
      .order("created_at", { ascending: false });

    if (input.query.project_id) request = request.eq("project_id", input.query.project_id);
    if (input.query.actor_employee_id) {
      request = request.eq("created_by", input.query.actor_employee_id);
    }
    if (input.query.date_from) {
      request = request.gte("created_at", `${input.query.date_from}T00:00:00.000Z`);
    }
    if (input.query.date_to) {
      request = request.lte("created_at", `${input.query.date_to}T23:59:59.999Z`);
    }

    const limit = Math.max(input.candidateLimit, 1);
    const { data, error, count } = await request.range(0, limit - 1);
    if (error) throw Errors.dbError("查询财务修正应收事件失败", error);

    return {
      list: ((data as unknown[]) || []).map(normalizeReceivableEventRow),
      total: count || 0,
    };
  }

  async listLedgerCorrectionAudits(input: ListInput): Promise<{
    list: LedgerCorrectionAuditRow[];
    total: number;
  }> {
    if (input.query.operation && !isLedgerOperation(input.query.operation)) {
      return { list: [], total: 0 };
    }

    let request = SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .select(`
        id,
        tenant_id,
        project_id,
        amount,
        payment_id,
        payment_linked_at,
        payment_linked_by,
        payment_link_reason,
        legacy_payment_ledger_marked_at,
        legacy_payment_ledger_marked_by,
        legacy_payment_ledger_reason,
        metadata,
        project:projects(id, name),
        payment_linker:employees!finance_ledger_entries_payment_linked_by_fkey(id, name),
        legacy_marker:employees!finance_ledger_entries_legacy_payment_ledger_marked_by_fkey(id, name)
      `, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .eq("entry_type", "project_payment")
      .or("payment_linked_at.not.is.null,legacy_payment_ledger_marked_at.not.is.null")
      .order("payment_linked_at", { ascending: false, nullsFirst: false });

    if (input.query.project_id) request = request.eq("project_id", input.query.project_id);
    if (input.query.actor_employee_id) {
      request = request.or(
        `payment_linked_by.eq.${input.query.actor_employee_id},legacy_payment_ledger_marked_by.eq.${input.query.actor_employee_id}`,
      );
    }
    if (input.query.date_from) {
      request = request.or(
        `payment_linked_at.gte.${input.query.date_from}T00:00:00.000Z,legacy_payment_ledger_marked_at.gte.${input.query.date_from}T00:00:00.000Z`,
      );
    }
    if (input.query.date_to) {
      request = request.or(
        `payment_linked_at.lte.${input.query.date_to}T23:59:59.999Z,legacy_payment_ledger_marked_at.lte.${input.query.date_to}T23:59:59.999Z`,
      );
    }

    const limit = Math.max(input.candidateLimit, 1);
    const { data, error, count } = await request.range(0, limit - 1);
    if (error) throw Errors.dbError("查询财务修正台账事件失败", error);

    return {
      list: ((data as unknown[]) || [])
        .map(normalizeLedgerRow)
        .filter((row) => ledgerRowMatchesOperation(row, input.query.operation)),
      total: count || 0,
    };
  }
}

function receivableEventTypesForOperation(
  operation?: FinanceCorrectionAuditOperation,
) {
  if (!operation) {
    return ["allocate_payment", "adjust_allocation", "reverse_allocation"];
  }
  return Object.entries(RECEIVABLE_EVENT_OPERATIONS)
    .filter(([, mappedOperation]) => mappedOperation === operation)
    .map(([eventType]) => eventType);
}

function isLedgerOperation(operation: FinanceCorrectionAuditOperation) {
  return operation === "link_ledger_payment" ||
    operation === "mark_legacy_ledger" ||
    operation === "generate_payment_ledger";
}

function ledgerRowMatchesOperation(
  row: LedgerCorrectionAuditRow,
  operation?: FinanceCorrectionAuditOperation,
) {
  if (!operation) return true;
  if (operation === "link_ledger_payment") return Boolean(row.payment_linked_at);
  if (operation === "mark_legacy_ledger") {
    return Boolean(row.legacy_payment_ledger_marked_at);
  }
  return false;
}

function normalizeReceivableEventRow(row: Record<string, unknown>): ReceivableCorrectionEventRow {
  const project = relationObject(row.project);
  const creator = relationObject(row.creator);
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    project_id: String(row.project_id),
    project_name: stringOrNull(project?.name),
    receivable_plan_id: String(row.receivable_plan_id),
    event_type: row.event_type as ReceivableCorrectionEventRow["event_type"],
    title: String(row.title ?? ""),
    note: stringOrNull(row.note),
    before_snapshot: objectOrNull(row.before_snapshot),
    after_snapshot: objectOrNull(row.after_snapshot),
    created_by: stringOrNull(row.created_by),
    created_by_name: stringOrNull(creator?.name),
    created_at: String(row.created_at),
  };
}

function normalizeLedgerRow(row: Record<string, unknown>): LedgerCorrectionAuditRow {
  const project = relationObject(row.project);
  const paymentLinker = relationObject(row.payment_linker);
  const legacyMarker = relationObject(row.legacy_marker);
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    project_id: stringOrNull(row.project_id),
    project_name: stringOrNull(project?.name),
    amount: numberOrNull(row.amount),
    payment_id: stringOrNull(row.payment_id),
    payment_linked_at: stringOrNull(row.payment_linked_at),
    payment_linked_by: stringOrNull(row.payment_linked_by),
    payment_linked_by_name: stringOrNull(paymentLinker?.name),
    payment_link_reason: stringOrNull(row.payment_link_reason),
    legacy_payment_ledger_marked_at: stringOrNull(row.legacy_payment_ledger_marked_at),
    legacy_payment_ledger_marked_by: stringOrNull(row.legacy_payment_ledger_marked_by),
    legacy_payment_ledger_marked_by_name: stringOrNull(legacyMarker?.name),
    legacy_payment_ledger_reason: stringOrNull(row.legacy_payment_ledger_reason),
    metadata: objectOrNull(row.metadata),
  };
}

function relationObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return relationObject(value[0]);
  return objectOrNull(value);
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export const financeCorrectionAuditRepository =
  new FinanceCorrectionAuditRepository();
```

- [ ] **Step 4: Wire the controller route**

Modify imports in `apps/api/src/controllers/finance/index.ts`:

```typescript
import {
  FinanceCorrectionAuditListQuerySchema,
} from "@/schema/finance-correction-audits";
import { financeCorrectionAuditService } from "@/services/finance-correction-audits";
```

Add this method near the ledger/reconciliation finance routes:

```typescript
  @Get("/finance/correction-audits")
  async listCorrectionAudits(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = FinanceCorrectionAuditListQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const data = await financeCorrectionAuditService.listAudits(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }
```

- [ ] **Step 5: Run focused API tests and typecheck**

```bash
cd apps/api
bun test src/services/finance-correction-audits.test.ts
pnpm exec tsc -p tsconfig.json --noEmit
```

Expected: test file passes, TypeScript exits 0.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/api/src/repositories/finance-correction-audits.ts \
  apps/api/src/controllers/finance/index.ts \
  apps/api/src/services/finance-correction-audits.test.ts
git commit -m "feat(finance): 暴露修正审计接口"
```

---

### Task 3: Admin Utilities And Finance Tab

**Files:**
- Create: `apps/admin/components/finance/finance-correction-audit-utils.ts`
- Create: `apps/admin/components/finance/finance-correction-audit-utils.test.ts`
- Modify: `apps/admin/components/finance/finance-module-tabs.tsx`
- Modify: `apps/admin/components/finance/finance-module-tabs.test.ts`

- [ ] **Step 1: Write failing Admin utility and tab tests**

Create `apps/admin/components/finance/finance-correction-audit-utils.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  buildFinanceCorrectionAuditSearchParams,
  financeCorrectionAuditDomainMeta,
  financeCorrectionAuditOperationLabel,
  safeFinanceCorrectionAuditHref,
} from "./finance-correction-audit-utils";

describe("finance correction audit helpers", () => {
  test("builds backend query params for correction audit filters", () => {
    const params = buildFinanceCorrectionAuditSearchParams({
      page: 2,
      pageSize: 20,
      operation: "link_ledger_payment",
      project_id: "project-1",
      actor_employee_id: "employee-1",
      date_from: "2026-06-01",
      date_to: "2026-06-30",
    });

    expect(params.toString()).toBe(
      "page=2&pageSize=20&date_from=2026-06-01&date_to=2026-06-30&project_id=project-1&operation=link_ledger_payment&actor_employee_id=employee-1",
    );
  });

  test("maps operation and domain labels", () => {
    expect(financeCorrectionAuditOperationLabel("manual_allocation")).toBe("人工核销");
    expect(financeCorrectionAuditOperationLabel("mark_legacy_ledger")).toBe("标记历史流水");
    expect(financeCorrectionAuditDomainMeta("receivable")).toEqual({
      label: "应收核销",
      variant: "secondary",
    });
    expect(financeCorrectionAuditDomainMeta("ledger")).toEqual({
      label: "台账修正",
      variant: "outline",
    });
  });

  test("keeps row links inside finance pages", () => {
    expect(safeFinanceCorrectionAuditHref("/finance/ledger?ledger_id=ledger-1")).toBe(
      "/finance/ledger?ledger_id=ledger-1",
    );
    expect(safeFinanceCorrectionAuditHref("https://example.com")).toBe("/finance/audits");
  });
});
```

Append this test to `apps/admin/components/finance/finance-module-tabs.test.ts`:

```typescript
test("includes correction audits as a finance module tab", () => {
  expect(FINANCE_MODULE_TABS).toContainEqual({
    value: "audits",
    label: "修正审计",
    href: "/finance/audits",
  });
});
```

- [ ] **Step 2: Run Admin tests and verify RED**

```bash
cd apps/admin
bun test components/finance/finance-correction-audit-utils.test.ts \
  components/finance/finance-module-tabs.test.ts
```

Expected: FAIL because the new util file does not exist and the tab is missing.

- [ ] **Step 3: Implement Admin utility helpers**

Create `apps/admin/components/finance/finance-correction-audit-utils.ts`:

```typescript
import type { BadgeProps } from "@/components/ui/badge";

export type FinanceCorrectionAuditOperation =
  | "manual_allocation"
  | "adjust_allocation"
  | "reverse_allocation"
  | "generate_payment_ledger"
  | "link_ledger_payment"
  | "mark_legacy_ledger";

export type FinanceCorrectionAuditDomain = "receivable" | "ledger";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

const OPERATION_LABELS: Record<FinanceCorrectionAuditOperation, string> = {
  manual_allocation: "人工核销",
  adjust_allocation: "调整核销",
  reverse_allocation: "撤销核销",
  generate_payment_ledger: "补生成收款台账",
  link_ledger_payment: "关联收款",
  mark_legacy_ledger: "标记历史流水",
};

export function financeCorrectionAuditOperationLabel(
  operation: FinanceCorrectionAuditOperation | string,
) {
  return OPERATION_LABELS[operation as FinanceCorrectionAuditOperation] ||
    "未知修正";
}

export function financeCorrectionAuditDomainMeta(
  domain: FinanceCorrectionAuditDomain,
): { label: string; variant: BadgeVariant } {
  if (domain === "receivable") {
    return { label: "应收核销", variant: "secondary" };
  }
  return { label: "台账修正", variant: "outline" };
}

export function buildFinanceCorrectionAuditSearchParams(query: {
  page?: number;
  pageSize?: number;
  date_from?: string;
  date_to?: string;
  project_id?: string;
  operation?: string;
  actor_employee_id?: string;
}) {
  const params = new URLSearchParams();
  params.set("page", String(query.page || 1));
  params.set("pageSize", String(query.pageSize || 20));
  appendIfPresent(params, "date_from", query.date_from);
  appendIfPresent(params, "date_to", query.date_to);
  appendIfPresent(params, "project_id", query.project_id);
  appendIfPresent(params, "operation", query.operation);
  appendIfPresent(params, "actor_employee_id", query.actor_employee_id);
  return params;
}

export function safeFinanceCorrectionAuditHref(href: string | null | undefined) {
  if (!href || !href.startsWith("/finance/")) return "/finance/audits";
  return href;
}

function appendIfPresent(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}
```

Modify `apps/admin/components/finance/finance-module-tabs.tsx`:

```typescript
export type FinanceModuleTab =
  | "overview"
  | "diagnostics"
  | "reconciliation"
  | "audits"
  | "reports"
  | "receivables"
  | "ledger";
```

Add the tab after `reconciliation`:

```typescript
  { value: "audits", label: "修正审计", href: "/finance/audits" },
```

- [ ] **Step 4: Run Admin tests and verify GREEN**

```bash
cd apps/admin
bun test components/finance/finance-correction-audit-utils.test.ts \
  components/finance/finance-module-tabs.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/admin/components/finance/finance-correction-audit-utils.ts \
  apps/admin/components/finance/finance-correction-audit-utils.test.ts \
  apps/admin/components/finance/finance-module-tabs.tsx \
  apps/admin/components/finance/finance-module-tabs.test.ts
git commit -m "feat(admin): 增加财务修正审计入口"
```

---

### Task 4: Admin Requests, Table, And Page

**Files:**
- Create: `apps/admin/components/finance/finance-correction-audit-requests.ts`
- Create: `apps/admin/components/finance/finance-correction-audit-table.tsx`
- Create: `apps/admin/app/(console)/finance/audits/page.tsx`
- Modify: `apps/admin/components/finance/finance-correction-audit-utils.test.ts`

- [ ] **Step 1: Add a failing test for empty fallback**

Append this test to `apps/admin/components/finance/finance-correction-audit-utils.test.ts`:

```typescript
import { emptyFinanceCorrectionAuditResult } from "./finance-correction-audit-requests";

test("builds an empty correction audit result with pagination", () => {
  expect(emptyFinanceCorrectionAuditResult(3, 50)).toEqual({
    list: [],
    pagination: {
      page: 3,
      pageSize: 50,
      total: 0,
      totalPages: 0,
    },
    summary: {
      total: 0,
      ledger_repair: 0,
      receivable_allocation: 0,
    },
    error: null,
  });
});
```

- [ ] **Step 2: Run Admin test and verify RED**

```bash
cd apps/admin
bun test components/finance/finance-correction-audit-utils.test.ts
```

Expected: FAIL because `finance-correction-audit-requests.ts` does not exist.

- [ ] **Step 3: Implement request types and fetchers**

Create `apps/admin/components/finance/finance-correction-audit-requests.ts`:

```typescript
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import type {
  FinanceCorrectionAuditDomain,
  FinanceCorrectionAuditOperation,
} from "./finance-correction-audit-utils";
import { buildFinanceCorrectionAuditSearchParams } from "./finance-correction-audit-utils";

export type FinanceCorrectionAuditRecord = {
  id: string;
  operation: FinanceCorrectionAuditOperation;
  operation_label: string;
  domain: FinanceCorrectionAuditDomain;
  project_id: string | null;
  project_name: string | null;
  actor_employee_id: string | null;
  actor_employee_name: string | null;
  occurred_at: string;
  reason: string | null;
  amount: number | null;
  receivable_plan_id: string | null;
  allocation_id: string | null;
  payment_id: string | null;
  ledger_id: string | null;
  target: {
    label: string;
    href: string;
  };
};

export type FinanceCorrectionAuditListData = {
  list: FinanceCorrectionAuditRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    total: number;
    ledger_repair: number;
    receivable_allocation: number;
  };
};

export type FinanceCorrectionAuditResult = FinanceCorrectionAuditListData & {
  error: string | null;
};

export type FinanceCorrectionAuditEmployeeOption = {
  value: string;
  label: string;
};

type EmployeeOptionRow = {
  id: string;
  name?: string | null;
  phone?: string | null;
  department_name?: string | null;
  post_name?: string | null;
};

type EmployeeListData = {
  list?: EmployeeOptionRow[];
};

export function emptyFinanceCorrectionAuditResult(
  page = 1,
  pageSize = 20,
): FinanceCorrectionAuditResult {
  return {
    list: [],
    pagination: {
      page,
      pageSize,
      total: 0,
      totalPages: 0,
    },
    summary: {
      total: 0,
      ledger_repair: 0,
      receivable_allocation: 0,
    },
    error: null,
  };
}

export async function fetchFinanceCorrectionAudits(query: {
  page?: number;
  pageSize?: number;
  date_from?: string;
  date_to?: string;
  project_id?: string;
  operation?: string;
  actor_employee_id?: string;
}): Promise<FinanceCorrectionAuditResult> {
  const token = await getAdminToken();
  const params = buildFinanceCorrectionAuditSearchParams(query);
  const page = Number(params.get("page") || 1);
  const pageSize = Number(params.get("pageSize") || 20);

  if (!token) {
    return {
      ...emptyFinanceCorrectionAuditResult(page, pageSize),
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(
      buildBackendUrl(`/finance/correction-audits?${params}`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<FinanceCorrectionAuditListData>(
      response,
    );
    return {
      ...(payload.data || emptyFinanceCorrectionAuditResult(page, pageSize)),
      error: null,
    };
  } catch (error) {
    return {
      ...emptyFinanceCorrectionAuditResult(page, pageSize),
      error: error instanceof Error ? error.message : "修正审计加载失败",
    };
  }
}

export async function fetchFinanceCorrectionAuditEmployeeOptions(
  selectedEmployeeId?: string,
): Promise<FinanceCorrectionAuditEmployeeOption[]> {
  const token = await getAdminToken();
  const fallbackOption = selectedEmployeeId
    ? [{
      value: selectedEmployeeId,
      label: `已选操作人 ${selectedEmployeeId.slice(0, 8)}`,
    }]
    : [];

  if (!token) {
    return [{ value: "", label: "全部操作人" }, ...fallbackOption];
  }

  try {
    const params = new URLSearchParams({
      page: "1",
      pageSize: "100",
      status: "active",
    });
    const response = await fetch(buildBackendUrl(`/employees?${params}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<EmployeeListData>(response);
    const options = (payload.data?.list || []).map((employee) => ({
      value: employee.id,
      label: employeeLabel(employee),
    }));
    if (
      selectedEmployeeId &&
      !options.some((option) => option.value === selectedEmployeeId)
    ) {
      const selectedOption = fallbackOption[0];
      if (selectedOption) options.push(selectedOption);
    }
    return [{ value: "", label: "全部操作人" }, ...options];
  } catch {
    return [{ value: "", label: "全部操作人" }, ...fallbackOption];
  }
}

function employeeLabel(employee: EmployeeOptionRow) {
  const title = employee.name || employee.phone || employee.id;
  const meta = [
    employee.department_name,
    employee.post_name,
    employee.phone && employee.phone !== title ? employee.phone : null,
  ].filter(Boolean).join(" · ");
  return meta ? `${title} (${meta})` : title;
}
```

- [ ] **Step 4: Implement the read-only table**

Create `apps/admin/components/finance/finance-correction-audit-table.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/admin/data-table";
import type {
  FinanceCorrectionAuditRecord,
} from "@/components/finance/finance-correction-audit-requests";
import {
  financeCorrectionAuditDomainMeta,
  financeCorrectionAuditOperationLabel,
  safeFinanceCorrectionAuditHref,
} from "@/components/finance/finance-correction-audit-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatFinanceDateTime,
  formatFinanceMoney,
} from "./finance-ledger-utils";

function projectName(row: FinanceCorrectionAuditRecord) {
  return row.project_name || row.project_id || "-";
}

export function FinanceCorrectionAuditTable({
  rows,
}: {
  rows: FinanceCorrectionAuditRecord[];
}) {
  const columns: ColumnDef<FinanceCorrectionAuditRecord>[] = [
    {
      accessorKey: "occurred_at",
      header: "发生时间",
      cell: ({ row }) => formatFinanceDateTime(row.original.occurred_at),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground tabular-nums",
      },
    },
    {
      accessorKey: "operation",
      header: "类型",
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-2">
          <span>{financeCorrectionAuditOperationLabel(row.original.operation)}</span>
          <Badge variant={financeCorrectionAuditDomainMeta(row.original.domain).variant}>
            {financeCorrectionAuditDomainMeta(row.original.domain).label}
          </Badge>
        </div>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "project",
      header: "项目",
      cell: ({ row }) => (
        <div className="max-w-[18rem]">
          <div className="truncate font-medium">{projectName(row.original)}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {row.original.project_id || "-"}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "amount",
      header: "金额",
      cell: ({ row }) => formatFinanceMoney(row.original.amount),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right font-medium tabular-nums",
      },
    },
    {
      id: "actor",
      header: "操作人",
      cell: ({ row }) => (
        <div className="max-w-[10rem] truncate">
          {row.original.actor_employee_name || row.original.actor_employee_id || "-"}
        </div>
      ),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground",
      },
    },
    {
      accessorKey: "reason",
      header: "原因",
      cell: ({ row }) => (
        <div className="max-w-[22rem] truncate">
          {row.original.reason || "-"}
        </div>
      ),
    },
    {
      id: "subject",
      header: "关联对象",
      cell: ({ row }) => (
        <div className="max-w-[18rem] space-y-1 text-xs text-muted-foreground">
          <div className="truncate">应收：{row.original.receivable_plan_id || "-"}</div>
          <div className="truncate">收款：{row.original.payment_id || "-"}</div>
          <div className="truncate">台账：{row.original.ledger_id || "-"}</div>
        </div>
      ),
    },
    {
      id: "action",
      header: "",
      cell: ({ row }) => (
        <Button asChild variant="ghost" size="sm" className="h-8 px-2">
          <Link href={safeFinanceCorrectionAuditHref(row.original.target.href)}>
            {row.original.target.label || "查看"}
            <ArrowUpRight data-icon="inline-end" />
          </Link>
        </Button>
      ),
      meta: {
        cellClassName: "whitespace-nowrap text-right",
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyText="当前筛选条件下暂无修正审计记录"
      minWidth="min-w-[1280px]"
    />
  );
}
```

- [ ] **Step 5: Implement the Admin page**

Create `apps/admin/app/(console)/finance/audits/page.tsx`:

```tsx
import Link from "next/link";
import { ClipboardList, History, ReceiptText } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  FinanceFilterSelectField,
} from "@/components/finance/finance-filter-controls";
import { FinanceCorrectionAuditTable } from "@/components/finance/finance-correction-audit-table";
import {
  fetchFinanceCorrectionAuditEmployeeOptions,
  fetchFinanceCorrectionAudits,
} from "@/components/finance/finance-correction-audit-requests";
import {
  buildFinanceCorrectionAuditSearchParams,
} from "@/components/finance/finance-correction-audit-utils";
import { FinanceModuleTabs } from "@/components/finance/finance-module-tabs";
import { FinanceMetricCard } from "@/components/finance/finance-overview-cards";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type FinanceCorrectionAuditPageSearchParams = {
  page?: string;
  date_from?: string;
  date_to?: string;
  project_id?: string;
  operation?: string;
  actor_employee_id?: string;
};

const OPERATION_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "manual_allocation", label: "人工核销" },
  { value: "adjust_allocation", label: "调整核销" },
  { value: "reverse_allocation", label: "撤销核销" },
  { value: "link_ledger_payment", label: "关联收款" },
  { value: "mark_legacy_ledger", label: "标记历史流水" },
];

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function auditPageHref(
  page: number,
  filters: FinanceCorrectionAuditPageSearchParams,
) {
  const params = buildFinanceCorrectionAuditSearchParams({
    page,
    pageSize: 20,
    date_from: filters.date_from,
    date_to: filters.date_to,
    project_id: filters.project_id,
    operation: filters.operation,
    actor_employee_id: filters.actor_employee_id,
  });
  return `/finance/audits?${params}`;
}

export default async function FinanceCorrectionAuditPage({
  searchParams,
}: {
  searchParams: Promise<FinanceCorrectionAuditPageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const page = normalizePage(params.page);
  const [data, employeeOptions] = await Promise.all([
    fetchFinanceCorrectionAudits({
      page,
      pageSize: 20,
      date_from: clean(params.date_from),
      date_to: clean(params.date_to),
      project_id: clean(params.project_id),
      operation: clean(params.operation),
      actor_employee_id: clean(params.actor_employee_id),
    }),
    fetchFinanceCorrectionAuditEmployeeOptions(clean(params.actor_employee_id)),
  ]);
  const canGoPrev = data.pagination.page > 1;
  const canGoNext = data.pagination.totalPages > 0 &&
    data.pagination.page < data.pagination.totalPages;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <ClipboardList aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">修正审计</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              追溯财务人工核销和台账修正记录。当前共 {data.pagination.total} 条记录。
            </p>
          </div>
        </div>
        <Badge variant="outline" className="w-fit tabular-nums">
          第 {data.pagination.page || 1} / {Math.max(data.pagination.totalPages || 0, 1)} 页
        </Badge>
      </div>

      <FinanceModuleTabs activeTab="audits" />

      {data.error ? (
        <StatusAlert
          tone="warning"
          title="修正审计加载失败"
          description={data.error}
        />
      ) : null}

      <div className="grid shrink-0 gap-2 md:grid-cols-3">
        <FinanceMetricCard
          icon={<ClipboardList aria-hidden="true" className="size-4" />}
          label="修正总数"
          value={`${data.summary.total} 条`}
          helper="当前筛选范围"
        />
        <FinanceMetricCard
          icon={<ReceiptText aria-hidden="true" className="size-4" />}
          label="台账修正"
          value={`${data.summary.ledger_repair} 条`}
          helper="关联收款和历史流水"
        />
        <FinanceMetricCard
          icon={<History aria-hidden="true" className="size-4" />}
          label="应收核销修正"
          value={`${data.summary.receivable_allocation} 条`}
          helper="人工核销、调整和撤销"
        />
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <form
            action="/finance/audits"
            className="shrink-0 grid gap-3 border-b bg-card p-4 md:grid-cols-2 xl:grid-cols-[minmax(9rem,11rem)_minmax(9rem,11rem)_minmax(12rem,1fr)_minmax(11rem,13rem)_minmax(12rem,1fr)_auto] xl:items-end"
          >
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-date-from">
                起始日期
              </label>
              <Input
                id="audit-date-from"
                name="date_from"
                type="date"
                defaultValue={params.date_from || ""}
                className="h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-date-to">
                截止日期
              </label>
              <Input
                id="audit-date-to"
                name="date_to"
                type="date"
                defaultValue={params.date_to || ""}
                className="h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-project-id">
                项目 ID
              </label>
              <Input
                id="audit-project-id"
                name="project_id"
                defaultValue={params.project_id || ""}
                className="h-9"
              />
            </div>
            <FinanceFilterSelectField
              id="audit-operation"
              name="operation"
              label="修正类型"
              value={params.operation}
              options={OPERATION_OPTIONS}
            />
            <FinanceFilterSelectField
              id="audit-actor-employee-id"
              name="actor_employee_id"
              label="操作人"
              value={params.actor_employee_id}
              options={employeeOptions}
            />
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Button type="submit" size="sm">筛选</Button>
              <Button asChild type="button" variant="outline" size="sm">
                <Link href="/finance/audits">重置</Link>
              </Button>
            </div>
          </form>

          <div className="min-h-0 flex-1 overflow-auto">
            <FinanceCorrectionAuditTable rows={data.list} />
          </div>

          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">
              共 {data.pagination.total} 条，每页 {data.pagination.pageSize} 条
            </p>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" disabled={!canGoPrev}>
                <Link
                  href={canGoPrev ? auditPageHref(data.pagination.page - 1, params) : "#"}
                  aria-disabled={!canGoPrev}
                >
                  上一页
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" disabled={!canGoNext}>
                <Link
                  href={canGoNext ? auditPageHref(data.pagination.page + 1, params) : "#"}
                  aria-disabled={!canGoNext}
                >
                  下一页
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Run Admin tests and typecheck**

```bash
cd apps/admin
bun test components/finance/finance-correction-audit-utils.test.ts \
  components/finance/finance-module-tabs.test.ts
pnpm run check
```

Expected: focused tests pass; Admin check exits 0.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/admin/components/finance/finance-correction-audit-requests.ts \
  apps/admin/components/finance/finance-correction-audit-table.tsx \
  apps/admin/app/'(console)'/finance/audits/page.tsx \
  apps/admin/components/finance/finance-correction-audit-utils.test.ts
git commit -m "feat(admin): 展示财务修正审计列表"
```

---

### Task 5: Full Verification And Handoff

**Files:**
- Modify: `docs/decoration-finance/README.md`
- Create: `docs/decoration-finance/2026-06-30-phase7-5-finance-correction-audit.md`

- [ ] **Step 1: Run full focused verification**

```bash
cd /Users/leefo/Public/work/gooes/.worktrees/finance-correction-audit
cd apps/api && bun test src/services/finance-correction-audits.test.ts && pnpm exec tsc -p tsconfig.json --noEmit
cd ../admin && bun test components/finance/finance-correction-audit-utils.test.ts components/finance/finance-module-tabs.test.ts && pnpm run check
cd ../..
git diff --check
```

Expected:

- API test passes.
- API typecheck exits 0.
- Admin tests pass.
- Admin check exits 0.
- `git diff --check` exits 0.

- [ ] **Step 2: Add handoff documentation**

Create `docs/decoration-finance/2026-06-30-phase7-5-finance-correction-audit.md`:

```markdown
# Phase 7.5 财务修正审计视图

日期：2026-06-30

## 结论

Phase 7.5 新增 Admin 财务“修正审计”只读视图，用于追溯财务人工核销和台账修正记录。

## 范围

- API：`GET /finance/correction-audits`
- Admin：`/finance/audits`
- 权限：`finance.reconciliation.manage`
- 小程序：无必改，无新增入口

## 覆盖记录

- 人工核销收款：`manual_allocation`
- 调整人工核销：`adjust_allocation`
- 撤销人工核销：`reverse_allocation`
- 历史收款台账关联 confirmed payment：`link_ledger_payment`
- 历史收款台账标记为历史流水：`mark_legacy_ledger`

## 当前边界

- 不新增修正写操作。
- 不新增复核审批流。
- 不新增导出。
- 不新增数据库表。
- `manual_allocation` 当前没有稳定 `allocation_id`，第一版展示为空。
- 补生成台账缺少稳定审计字段时不纳入列表，避免误报。

## 验证

- `cd apps/api && bun test src/services/finance-correction-audits.test.ts`
- `cd apps/api && pnpm exec tsc -p tsconfig.json --noEmit`
- `cd apps/admin && bun test components/finance/finance-correction-audit-utils.test.ts components/finance/finance-module-tabs.test.ts`
- `cd apps/admin && pnpm run check`
- `git diff --check`
```

Append one bullet under the Phase 7 section of `docs/decoration-finance/README.md`:

```markdown
- [Phase 7.5 财务修正审计视图](./2026-06-30-phase7-5-finance-correction-audit.md)
```

- [ ] **Step 3: Commit docs**

```bash
git add docs/decoration-finance/README.md \
  docs/decoration-finance/2026-06-30-phase7-5-finance-correction-audit.md
git commit -m "docs(finance): 记录phase7-5修正审计"
```

- [ ] **Step 4: Run final verification before merge**

```bash
cd /Users/leefo/Public/work/gooes/.worktrees/finance-correction-audit
git status --short --branch
git log --oneline -8
```

Expected:

- Branch is `feat/finance-correction-audit`.
- No uncommitted files.
- Commits include Task 1 through Task 5.

- [ ] **Step 5: Push branch**

```bash
git push
```

Expected: remote branch `origin/feat/finance-correction-audit` contains all Phase 7.5 commits.

---

## Self-Review Checklist

- Spec coverage:
  - API endpoint: Task 2.
  - Permission: Task 1 service test and implementation.
  - Receivable event mapping: Task 1.
  - Ledger repair mapping: Task 1.
  - Pagination max: Task 2.
  - Admin tab and page: Tasks 3 and 4.
  - No miniprogram change: docs in Task 5.
  - No migration/new writes: file structure and docs state it.
- Placeholder scan:
  - The plan contains no unfinished markers or incomplete path names.
- Type consistency:
  - API operation names match the design doc and Admin utility names.
  - Admin `audits` tab matches `/finance/audits`.
  - API and Admin pagination shapes both use `page`, `pageSize`, `total`, `totalPages`.
