# Finance Analysis Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 5 finance operating analysis and budget warning closure so Admin can filter, understand, and act on project finance risks while backend remains the source of truth for risk calculation.

**Architecture:** Keep the existing Phase 3/4 finance summary model and extend it instead of creating a separate risk workflow. Backend adds stable risk contracts, risk reasons, unallocated expense totals, and server-side risk filtering. Admin consumes only backend `risk_level`, `risk_flags`, `risk_reasons`, and action metadata, then renders dense finance dashboard controls using the existing shadcn/Tailwind admin stack.

**Tech Stack:** Bun + TypeScript + Fastify API, Supabase migrations/RPC, Zod schemas, existing service/repository layering, Next.js Admin server components, shadcn/ui, Tailwind, lucide-react, Bun tests and Admin typecheck.

---

## Source Documents

- PRD: `docs/decoration-finance/2026-06-24-phase5-finance-analysis-warning-prd.md`
- Phase 3 baseline: `docs/decoration-finance/2026-06-23-phase3-project-operating-summary.md`
- Phase 4 baseline: `docs/decoration-finance/2026-06-24-phase4-cost-budget-profit-prd.md`
- Phase 4 release acceptance: `docs/decoration-finance/2026-06-24-phase4-post-release-acceptance.md`

## Current Code Map

Backend:

- `apps/api/src/schema/finance.ts`
  - Existing `FinanceProjectSummaryListQuerySchema` only supports `keyword` and `status`.
- `apps/api/src/repositories/finance-project-summary.ts`
  - Existing repository lists projects and separately aggregates ledger, receivables, and budget totals.
  - Existing `listLedgerTotals` tracks `expense_by_category` but not unallocated outflow amount.
- `apps/api/src/services/finance-project-summary.ts`
  - Existing service computes `risk_flags` and `risk_level`.
  - Existing risk flags are `budget_missing`, `category_over_budget`, `project_over_budget`, `low_projected_margin`, `receivable_overdue`.
  - Existing tests are in `apps/api/src/services/finance-project-summary.test.ts`.
- `apps/api/src/controllers/finance/index.ts`
  - Existing controller exposes `/finance/project-summary`, `/projects/:id/finance-summary`, cost categories, budgets, and ledger category updates.

Admin:

- `apps/admin/app/(console)/finance/page.tsx`
  - Existing finance dashboard supports project keyword and project status filters.
  - Existing metric cards summarize the current page.
- `apps/admin/components/finance/finance-requests.ts`
  - Existing Admin request types need Phase 5 risk fields and query params.
- `apps/admin/components/finance/finance-project-summary-table.tsx`
  - Existing table renders risk labels from `risk_flags`.
- `apps/admin/components/projects/project-finance-operating-summary-panel.tsx`
  - Existing project detail panel renders simple risk text from `risk_flags`.
- `apps/admin/components/projects/project-cost-budget-panel.tsx`
  - Existing budget panel renders category risk badge and unallocated expense amount.
- `apps/admin/app/(console)/finance/ledger/page.tsx`
  - Existing ledger page supports `cost_category_id` only.
- `apps/admin/components/finance/finance-ledger-table.tsx`
  - Existing ledger table already displays outflow records without cost category as “待归集”.

## Design Decisions

1. **Risk calculation remains backend-owned.**
   Admin must not compute `risk_level`, `risk_flags`, `risk_reasons`, or whether an action should appear. It may map known `action.key` values to local links.

2. **Risk filtering must be server-side.**
   `GET /finance/project-summary?risk_level=warning` must return a correct `pagination.total`. Do not filter only the current page in Admin.

3. **Use a risk-search RPC for filter correctness and performance.**
   Existing TypeScript aggregation is good for the current page, but risk filters depend on derived aggregates. Add a Supabase RPC that returns matching project IDs and filtered total count. Then reuse existing TypeScript summary builder for the returned page.

4. **Do not add risk task tables in Phase 5.**
   Risk closure is handled by existing actions: configure budget, classify ledger cost, inspect receivables, and inspect project details.

5. **No mini-program code change in this phase.**
   Add only a gooes handoff document that says orange has no required change unless product later opens employee-side finance risk display.

## File Structure

Create backend files:

- `supabase/migrations/20260624160000_finance_project_risk_search.sql`
  - Adds `public.search_finance_project_risk_ids(...)` RPC for risk-filtered project IDs and total count.
- `apps/api/src/services/finance-project-risk.ts`
  - Pure risk flag, level, reason, label, and action contract helpers.
- `apps/api/src/services/finance-project-risk.test.ts`
  - Unit tests for risk level, new flags, and `risk_reasons[]`.
- `apps/api/src/repositories/finance-project-summary-risk-search.test.ts`
  - Unit test for repository RPC parameter mapping and ID order preservation.

Modify backend files:

- `apps/api/src/schema/finance.ts`
  - Add risk filter schemas and query fields.
- `apps/api/src/repositories/finance-project-summary.ts`
  - Add unallocated outflow totals.
  - Add `searchProjectIdsByRisk(...)`.
  - Add project fetch by ordered IDs.
- `apps/api/src/services/finance-project-summary.ts`
  - Use `finance-project-risk.ts`.
  - Return `risk_reasons[]` and `unallocated_expense_amount`.
  - Use RPC-backed project ID search when risk filters are present.
  - Preserve existing non-risk keyword/status path where no risk filters are present.
- `apps/api/src/services/finance-project-summary.test.ts`
  - Cover `unallocated_expense`, negative profit flags, risk reasons, and risk-filtered repository calls.

Modify Admin files:

- `apps/admin/components/finance/finance-requests.ts`
  - Add Phase 5 types and query params.
- `apps/admin/components/finance/finance-risk-display.ts`
  - New shared display helpers for risk labels, badge variants, and action hrefs.
- `apps/admin/components/finance/finance-risk-display.test.ts`
  - Unit tests for labels, action hrefs, and unknown action handling.
- `apps/admin/app/(console)/finance/page.tsx`
  - Add risk filters and risk summary cards.
- `apps/admin/components/finance/finance-project-summary-table.tsx`
  - Render `risk_reasons[]`, unallocated amount, and action links.
- `apps/admin/components/projects/project-finance-operating-summary-panel.tsx`
  - Render risk reason cards and action buttons.
- `apps/admin/components/projects/project-cost-budget-panel.tsx`
  - Show category-level risk reason text if provided.
- `apps/admin/app/(console)/finance/ledger/page.tsx`
  - Add project, direction, and unallocated filters.
- `apps/admin/components/finance/finance-ledger-table.tsx`
  - Keep table display but ensure unallocated rows remain clear.

Create docs:

- `docs/decoration-finance/2026-06-24-phase5-finance-analysis-warning-miniprogram-handoff.md`
  - Mini-program impact: no required code change; optional future read-only risk display contract.
- `docs/decoration-finance/2026-06-24-phase5-finance-analysis-warning-smoke.md`
  - API/Admin smoke checklist and final evidence.

---

## Task 1: Backend Risk Contract Helpers

**Files:**

- Create: `apps/api/src/services/finance-project-risk.ts`
- Create: `apps/api/src/services/finance-project-risk.test.ts`
- Modify: `apps/api/src/services/finance-project-summary.ts`

- [ ] **Step 1: Write the failing risk helper tests**

Create `apps/api/src/services/finance-project-risk.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  buildFinanceProjectRisk,
  type FinanceProjectRiskInput,
} from "./finance-project-risk";

const baseInput = {
  projectId: "project-1",
  contractAmount: 100000,
  receivedAmount: 50000,
  expensePaidAmount: 20000,
  budgetConfigured: true,
  budgetCostAmount: 80000,
  budgetUsageRatio: 0.25,
  projectedBudgetGrossMargin: 0.2,
  overdueCount: 0,
  overdueAmount: 0,
  unallocatedExpenseAmount: 0,
  hasCategoryOverBudget: false,
} satisfies FinanceProjectRiskInput;

describe("buildFinanceProjectRisk", () => {
  test("returns normal when no finance risk is present", () => {
    expect(buildFinanceProjectRisk(baseInput)).toEqual({
      risk_level: "normal",
      risk_flags: [],
      risk_reasons: [],
    });
  });

  test("returns info reason for unallocated project expenses", () => {
    const result = buildFinanceProjectRisk({
      ...baseInput,
      unallocatedExpenseAmount: 1200,
    });

    expect(result.risk_level).toBe("info");
    expect(result.risk_flags).toContain("unallocated_expense");
    expect(result.risk_reasons).toContainEqual(
      expect.objectContaining({
        code: "unallocated_expense",
        level: "info",
        title: "存在未归集成本",
        current_value: 1200,
        unit: "money",
        action: expect.objectContaining({
          key: "open_unallocated_ledger",
          label: "去归集成本",
        }),
      }),
    );
  });

  test("returns danger for negative actual and projected profit", () => {
    const result = buildFinanceProjectRisk({
      ...baseInput,
      contractAmount: 50000,
      receivedAmount: 10000,
      expensePaidAmount: 70000,
      budgetCostAmount: 80000,
      projectedBudgetGrossMargin: -0.6,
    });

    expect(result.risk_level).toBe("danger");
    expect(result.risk_flags).toContain("project_over_budget");
    expect(result.risk_flags).toContain("negative_actual_profit");
    expect(result.risk_flags).toContain("negative_projected_profit");
    expect(result.risk_reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        "project_over_budget",
        "negative_actual_profit",
        "negative_projected_profit",
      ]),
    );
  });

  test("keeps overdue and low margin as warning when no danger exists", () => {
    const result = buildFinanceProjectRisk({
      ...baseInput,
      projectedBudgetGrossMargin: 0.12,
      overdueCount: 2,
      overdueAmount: 3000,
    });

    expect(result.risk_level).toBe("warning");
    expect(result.risk_flags).toEqual([
      "low_projected_margin",
      "receivable_overdue",
    ]);
    expect(result.risk_reasons).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run:

```bash
cd apps/api
bun test ./src/services/finance-project-risk.test.ts
```

Expected: FAIL because `finance-project-risk.ts` does not exist.

- [ ] **Step 3: Add the risk helper implementation**

Create `apps/api/src/services/finance-project-risk.ts`:

```ts
export type FinanceProjectRiskLevel = "normal" | "info" | "warning" | "danger";

export type FinanceProjectRiskFlag =
  | "budget_missing"
  | "unallocated_expense"
  | "category_over_budget"
  | "project_over_budget"
  | "low_projected_margin"
  | "receivable_overdue"
  | "negative_actual_profit"
  | "negative_projected_profit";

export type FinanceProjectRiskReasonUnit = "money" | "ratio" | "count" | "boolean";

export type FinanceProjectRiskAction = {
  key:
    | "open_cost_budget"
    | "open_unallocated_ledger"
    | "open_receivables"
    | "open_project_finance";
  label: string;
  target: string;
};

export type FinanceProjectRiskReason = {
  code: FinanceProjectRiskFlag;
  level: FinanceProjectRiskLevel;
  title: string;
  description: string;
  current_value: number | null;
  threshold_value: number | null;
  unit: FinanceProjectRiskReasonUnit;
  action: FinanceProjectRiskAction | null;
};

export type FinanceProjectRiskInput = {
  projectId: string;
  contractAmount: number;
  receivedAmount: number;
  expensePaidAmount: number;
  budgetConfigured: boolean;
  budgetCostAmount: number;
  budgetUsageRatio: number | null;
  projectedBudgetGrossMargin: number | null;
  overdueCount: number;
  overdueAmount: number;
  unallocatedExpenseAmount: number;
  hasCategoryOverBudget: boolean;
  projectedMarginWarningRatio?: number;
};

export type FinanceProjectRiskResult = {
  risk_level: FinanceProjectRiskLevel;
  risk_flags: FinanceProjectRiskFlag[];
  risk_reasons: FinanceProjectRiskReason[];
};

const DEFAULT_PROJECTED_MARGIN_WARNING_RATIO = 0.2;

export function buildFinanceProjectRisk(
  input: FinanceProjectRiskInput,
): FinanceProjectRiskResult {
  const threshold = input.projectedMarginWarningRatio ??
    DEFAULT_PROJECTED_MARGIN_WARNING_RATIO;
  const actualProfitAmount = roundMoney(input.receivedAmount - input.expensePaidAmount);
  const projectedBudgetProfitAmount = input.budgetConfigured
    ? roundMoney(input.contractAmount - input.budgetCostAmount)
    : 0;
  const reasons: FinanceProjectRiskReason[] = [];

  if (!input.budgetConfigured) {
    reasons.push(reason({
      code: "budget_missing",
      level: "info",
      title: "未配置成本预算",
      description: "项目尚未配置成本预算，预算利润和预算使用率不可判断。",
      current_value: null,
      threshold_value: null,
      unit: "boolean",
      action: {
        key: "open_cost_budget",
        label: "配置成本预算",
        target: `/projects/${input.projectId}?tab=overview`,
      },
    }));
  }

  if (input.unallocatedExpenseAmount > 0) {
    reasons.push(reason({
      code: "unallocated_expense",
      level: "info",
      title: "存在未归集成本",
      description: `项目存在 ${formatMoney(input.unallocatedExpenseAmount)} 未归集成本。`,
      current_value: roundMoney(input.unallocatedExpenseAmount),
      threshold_value: 0,
      unit: "money",
      action: {
        key: "open_unallocated_ledger",
        label: "去归集成本",
        target: `/finance/ledger?project_id=${input.projectId}&direction=out&unallocated_only=true`,
      },
    }));
  }

  if (input.hasCategoryOverBudget) {
    reasons.push(reason({
      code: "category_over_budget",
      level: "warning",
      title: "成本分类达到预警",
      description: "至少一个成本分类支出已超过该分类预算预警阈值。",
      current_value: null,
      threshold_value: null,
      unit: "boolean",
      action: {
        key: "open_cost_budget",
        label: "查看成本预算",
        target: `/projects/${input.projectId}?tab=overview`,
      },
    }));
  }

  if (input.budgetConfigured && input.expensePaidAmount > input.budgetCostAmount) {
    reasons.push(reason({
      code: "project_over_budget",
      level: "danger",
      title: "项目已超预算",
      description: `项目支出 ${formatMoney(input.expensePaidAmount)} 已超过预算 ${formatMoney(input.budgetCostAmount)}。`,
      current_value: roundMoney(input.expensePaidAmount),
      threshold_value: roundMoney(input.budgetCostAmount),
      unit: "money",
      action: {
        key: "open_cost_budget",
        label: "查看成本预算",
        target: `/projects/${input.projectId}?tab=overview`,
      },
    }));
  }

  if (
    input.projectedBudgetGrossMargin !== null &&
    input.projectedBudgetGrossMargin < threshold
  ) {
    reasons.push(reason({
      code: "low_projected_margin",
      level: "warning",
      title: "预算毛利偏低",
      description: `预测预算毛利率 ${formatRatio(input.projectedBudgetGrossMargin)}，低于阈值 ${formatRatio(threshold)}。`,
      current_value: input.projectedBudgetGrossMargin,
      threshold_value: threshold,
      unit: "ratio",
      action: {
        key: "open_cost_budget",
        label: "查看成本预算",
        target: `/projects/${input.projectId}?tab=overview`,
      },
    }));
  }

  if (input.overdueCount > 0) {
    reasons.push(reason({
      code: "receivable_overdue",
      level: "warning",
      title: "存在逾期应收",
      description: `项目存在 ${input.overdueCount} 笔逾期应收，逾期金额 ${formatMoney(input.overdueAmount)}。`,
      current_value: input.overdueCount,
      threshold_value: 0,
      unit: "count",
      action: {
        key: "open_receivables",
        label: "查看应收",
        target: `/finance/receivables?project_id=${input.projectId}&overdue_only=true`,
      },
    }));
  }

  if (actualProfitAmount < 0) {
    reasons.push(reason({
      code: "negative_actual_profit",
      level: "danger",
      title: "实际利润为负",
      description: `实际利润 ${formatMoney(actualProfitAmount)}，当前支出已超过已收金额。`,
      current_value: actualProfitAmount,
      threshold_value: 0,
      unit: "money",
      action: {
        key: "open_project_finance",
        label: "查看项目财务",
        target: `/projects/${input.projectId}?tab=overview`,
      },
    }));
  }

  if (input.budgetConfigured && projectedBudgetProfitAmount < 0) {
    reasons.push(reason({
      code: "negative_projected_profit",
      level: "danger",
      title: "预算利润为负",
      description: `预算利润 ${formatMoney(projectedBudgetProfitAmount)}，预算成本已超过合同金额。`,
      current_value: projectedBudgetProfitAmount,
      threshold_value: 0,
      unit: "money",
      action: {
        key: "open_cost_budget",
        label: "查看成本预算",
        target: `/projects/${input.projectId}?tab=overview`,
      },
    }));
  }

  return {
    risk_level: resolveRiskLevel(reasons),
    risk_flags: reasons.map((item) => item.code),
    risk_reasons: reasons,
  };
}

function reason(input: FinanceProjectRiskReason): FinanceProjectRiskReason {
  return input;
}

function resolveRiskLevel(reasons: FinanceProjectRiskReason[]): FinanceProjectRiskLevel {
  if (reasons.some((item) => item.level === "danger")) return "danger";
  if (reasons.some((item) => item.level === "warning")) return "warning";
  if (reasons.some((item) => item.level === "info")) return "info";
  return "normal";
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number) {
  return `¥${roundMoney(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRatio(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}
```

- [ ] **Step 4: Run the focused risk helper test**

Run:

```bash
cd apps/api
bun test ./src/services/finance-project-risk.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/finance-project-risk.ts apps/api/src/services/finance-project-risk.test.ts
git commit -m "feat(finance): 增加项目经营风险契约"
```

---

## Task 2: Backend Query Schema And Risk Search Repository

**Files:**

- Create: `supabase/migrations/20260624160000_finance_project_risk_search.sql`
- Create: `apps/api/src/repositories/finance-project-summary-risk-search.test.ts`
- Modify: `apps/api/src/schema/finance.ts`
- Modify: `apps/api/src/repositories/finance-project-summary.ts`

- [ ] **Step 1: Extend the query schema test through service tests**

Add this import to `apps/api/src/services/finance-project-summary.test.ts`:

```ts
import { FinanceProjectSummaryListQuerySchema } from "@/schema/finance";
```

Add this test near the top of the describe block:

```ts
test("parses finance project risk filter query", () => {
  const parsed = FinanceProjectSummaryListQuerySchema.parse({
    page: "2",
    pageSize: "50",
    risk_level: "warning",
    risk_flag: "unallocated_expense",
    budget_configured: "false",
    has_unallocated_expense: "true",
    overdue: "true",
    min_budget_usage_ratio: "0.8",
    max_projected_budget_gross_margin: "0.2",
  });

  expect(parsed).toMatchObject({
    page: 2,
    pageSize: 50,
    risk_level: "warning",
    risk_flag: "unallocated_expense",
    budget_configured: false,
    has_unallocated_expense: true,
    overdue: true,
    min_budget_usage_ratio: 0.8,
    max_projected_budget_gross_margin: 0.2,
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
cd apps/api
bun test ./src/services/finance-project-summary.test.ts
```

Expected: FAIL because the schema does not include Phase 5 fields yet.

- [ ] **Step 3: Extend `apps/api/src/schema/finance.ts`**

Add these schemas above `FinanceProjectSummaryListQuerySchema`:

```ts
const OptionalBooleanQuerySchema = z.preprocess((value) => {
  if (value == null || value === "") return undefined;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}, z.boolean().optional());

const OptionalRatioQuerySchema = z.preprocess((value) => {
  if (value == null || value === "") return undefined;
  return Number(value);
}, z.number().min(0).max(100).optional());

export const FinanceProjectRiskLevelSchema = z.enum(
  ["normal", "info", "warning", "danger"],
  { message: "无效的项目经营风险等级" },
);

export const FinanceProjectRiskFlagSchema = z.enum(
  [
    "budget_missing",
    "unallocated_expense",
    "category_over_budget",
    "project_over_budget",
    "low_projected_margin",
    "receivable_overdue",
    "negative_actual_profit",
    "negative_projected_profit",
  ],
  { message: "无效的项目经营风险原因" },
);
```

Replace `FinanceProjectSummaryListQuerySchema` with:

```ts
export const FinanceProjectSummaryListQuerySchema = PaginationQuerySchema.extend({
  keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
  status: optionalQueryValue(z.string().trim().max(50, "项目状态过长")),
  risk_level: optionalQueryValue(FinanceProjectRiskLevelSchema),
  risk_flag: optionalQueryValue(FinanceProjectRiskFlagSchema),
  budget_configured: OptionalBooleanQuerySchema,
  has_unallocated_expense: OptionalBooleanQuerySchema,
  overdue: OptionalBooleanQuerySchema,
  min_budget_usage_ratio: OptionalRatioQuerySchema,
  max_projected_budget_gross_margin: OptionalRatioQuerySchema,
});
```

- [ ] **Step 4: Add the migration RPC**

Create `supabase/migrations/20260624160000_finance_project_risk_search.sql`:

```sql
create or replace function public.search_finance_project_risk_ids(
  p_tenant_id uuid,
  p_page integer default 1,
  p_page_size integer default 20,
  p_keyword text default null,
  p_status text default null,
  p_risk_level text default null,
  p_risk_flag text default null,
  p_budget_configured boolean default null,
  p_has_unallocated_expense boolean default null,
  p_overdue boolean default null,
  p_min_budget_usage_ratio numeric default null,
  p_max_projected_budget_gross_margin numeric default null
)
returns table (
  project_id uuid,
  total_count bigint
)
language sql
stable
as $$
with normalized as (
  select
    greatest(coalesce(p_page, 1), 1) as page,
    least(greatest(coalesce(p_page_size, 20), 1), 100) as page_size,
    nullif(trim(p_keyword), '') as keyword,
    nullif(trim(p_status), '') as status,
    nullif(trim(p_risk_level), '') as risk_level,
    nullif(trim(p_risk_flag), '') as risk_flag
),
base_projects as (
  select
    p.id,
    p.name,
    p.status,
    coalesce(p.signed_amount, p.budget, 0)::numeric as contract_amount,
    p.created_at
  from public.projects p, normalized n
  where p.tenant_id = p_tenant_id
    and (n.status is null or p.status = n.status)
    and (
      n.keyword is null
      or p.name ilike '%' || n.keyword || '%'
      or p.id::text = n.keyword
    )
),
ledger_totals as (
  select
    l.project_id,
    coalesce(sum(l.amount) filter (where l.direction = 'in'), 0)::numeric as income_amount,
    coalesce(sum(l.amount) filter (where l.direction = 'out'), 0)::numeric as expense_amount,
    coalesce(sum(l.amount) filter (
      where l.direction = 'out' and l.cost_category_id is null
    ), 0)::numeric as unallocated_expense_amount
  from public.finance_ledger_entries l
  join base_projects bp on bp.id = l.project_id
  where l.tenant_id = p_tenant_id
  group by l.project_id
),
receivable_totals as (
  select
    r.project_id,
    coalesce(sum(greatest(coalesce(r.amount, 0) - coalesce(r.paid_amount, 0), 0)) filter (
      where r.status <> 'canceled'
    ), 0)::numeric as receivable_remaining_amount,
    coalesce(sum(greatest(coalesce(r.amount, 0) - coalesce(r.paid_amount, 0), 0)) filter (
      where r.status <> 'canceled'
        and r.status <> 'paid'
        and r.due_date < current_date
    ), 0)::numeric as overdue_amount,
    coalesce(count(*) filter (
      where r.status <> 'canceled'
        and r.status <> 'paid'
        and r.due_date < current_date
        and greatest(coalesce(r.amount, 0) - coalesce(r.paid_amount, 0), 0) > 0
    ), 0)::integer as overdue_count
  from public.project_receivable_plans r
  join base_projects bp on bp.id = r.project_id
  where r.tenant_id = p_tenant_id
  group by r.project_id
),
budget_totals as (
  select
    b.project_id,
    coalesce(sum(b.budget_amount), 0)::numeric as budget_amount,
    count(*)::integer as budget_count
  from public.project_cost_budgets b
  join base_projects bp on bp.id = b.project_id
  where b.tenant_id = p_tenant_id
    and b.status = 'active'
  group by b.project_id
),
category_expenses as (
  select
    l.project_id,
    l.cost_category_id,
    coalesce(sum(l.amount), 0)::numeric as expense_amount
  from public.finance_ledger_entries l
  join base_projects bp on bp.id = l.project_id
  where l.tenant_id = p_tenant_id
    and l.direction = 'out'
    and l.cost_category_id is not null
  group by l.project_id, l.cost_category_id
),
category_over_budget as (
  select distinct b.project_id
  from public.project_cost_budgets b
  join category_expenses e
    on e.project_id = b.project_id
   and e.cost_category_id = b.cost_category_id
  where b.tenant_id = p_tenant_id
    and b.status = 'active'
    and e.expense_amount > b.budget_amount * (coalesce(b.warning_threshold_percent, 100) / 100.0)
),
risk_rows as (
  select
    bp.id as project_id,
    bp.created_at,
    coalesce(l.income_amount, 0) as received_amount,
    coalesce(l.expense_amount, 0) as expense_amount,
    coalesce(l.unallocated_expense_amount, 0) as unallocated_expense_amount,
    coalesce(rt.overdue_count, 0) as overdue_count,
    coalesce(rt.overdue_amount, 0) as overdue_amount,
    coalesce(bt.budget_amount, 0) as budget_amount,
    coalesce(bt.budget_count, 0) > 0 as budget_configured,
    case
      when coalesce(bt.budget_amount, 0) > 0
        then coalesce(l.expense_amount, 0) / bt.budget_amount
      else null
    end as budget_usage_ratio,
    case
      when bp.contract_amount > 0 and coalesce(bt.budget_count, 0) > 0
        then (bp.contract_amount - coalesce(bt.budget_amount, 0)) / bp.contract_amount
      else null
    end as projected_budget_gross_margin,
    coalesce(cob.project_id is not null, false) as has_category_over_budget,
    (coalesce(l.income_amount, 0) - coalesce(l.expense_amount, 0)) < 0 as negative_actual_profit,
    (coalesce(bt.budget_count, 0) > 0 and bp.contract_amount - coalesce(bt.budget_amount, 0) < 0) as negative_projected_profit
  from base_projects bp
  left join ledger_totals l on l.project_id = bp.id
  left join receivable_totals rt on rt.project_id = bp.id
  left join budget_totals bt on bt.project_id = bp.id
  left join category_over_budget cob on cob.project_id = bp.id
),
flagged as (
  select
    rr.*,
    array_remove(array[
      case when not rr.budget_configured then 'budget_missing' end,
      case when rr.unallocated_expense_amount > 0 then 'unallocated_expense' end,
      case when rr.has_category_over_budget then 'category_over_budget' end,
      case when rr.budget_configured and rr.expense_amount > rr.budget_amount then 'project_over_budget' end,
      case when rr.projected_budget_gross_margin is not null and rr.projected_budget_gross_margin < 0.2 then 'low_projected_margin' end,
      case when rr.overdue_count > 0 then 'receivable_overdue' end,
      case when rr.negative_actual_profit then 'negative_actual_profit' end,
      case when rr.negative_projected_profit then 'negative_projected_profit' end
    ], null)::text[] as risk_flags
  from risk_rows rr
),
leveled as (
  select
    f.*,
    case
      when f.risk_flags && array['project_over_budget','negative_actual_profit','negative_projected_profit']::text[] then 'danger'
      when f.risk_flags && array['category_over_budget','low_projected_margin','receivable_overdue']::text[] then 'warning'
      when f.risk_flags && array['budget_missing','unallocated_expense']::text[] then 'info'
      else 'normal'
    end as risk_level
  from flagged f
),
filtered as (
  select l.*
  from leveled l, normalized n
  where (n.risk_level is null or l.risk_level = n.risk_level)
    and (n.risk_flag is null or n.risk_flag = any(l.risk_flags))
    and (p_budget_configured is null or l.budget_configured = p_budget_configured)
    and (p_has_unallocated_expense is null or (l.unallocated_expense_amount > 0) = p_has_unallocated_expense)
    and (p_overdue is null or (l.overdue_count > 0) = p_overdue)
    and (p_min_budget_usage_ratio is null or l.budget_usage_ratio >= p_min_budget_usage_ratio)
    and (p_max_projected_budget_gross_margin is null or l.projected_budget_gross_margin <= p_max_projected_budget_gross_margin)
),
numbered as (
  select
    f.project_id,
    count(*) over() as total_count,
    row_number() over(order by f.created_at desc, f.project_id desc) as row_number
  from filtered f
)
select
  n.project_id,
  n.total_count
from numbered n, normalized p
where n.row_number > ((p.page - 1) * p.page_size)
  and n.row_number <= (p.page * p.page_size)
order by n.row_number;
$$;
```

- [ ] **Step 5: Add repository RPC mapping test**

Create `apps/api/src/repositories/finance-project-summary-risk-search.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";

const rpc = mock(async () => ({
  data: [
    { project_id: "project-2", total_count: 2 },
    { project_id: "project-1", total_count: 2 },
  ],
  error: null,
}));

const eq = mock(() => ({
  in: mock(() => ({
    then: (resolve: (value: unknown) => void) => resolve({
      data: [
        {
          id: "project-1",
          name: "项目一",
          status: "constructing",
          signed_amount: 100000,
          budget: 90000,
        },
        {
          id: "project-2",
          name: "项目二",
          status: "constructing",
          signed_amount: 80000,
          budget: 70000,
        },
      ],
      error: null,
    }),
  })),
}));

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      rpc,
      from: () => ({
        select: () => ({
          eq,
        }),
      }),
    }),
  },
}));

describe("financeProjectSummaryRepository risk search", () => {
  test("passes risk filters to RPC and preserves returned project order", async () => {
    const { financeProjectSummaryRepository } =
      await import("./finance-project-summary");

    const result = await financeProjectSummaryRepository.searchProjectIdsByRisk({
      tenantId: "tenant-1",
      query: {
        page: 2,
        pageSize: 20,
        keyword: "张三",
        status: "constructing",
        risk_level: "warning",
        risk_flag: "unallocated_expense",
        budget_configured: false,
        has_unallocated_expense: true,
        overdue: true,
        min_budget_usage_ratio: 0.8,
        max_projected_budget_gross_margin: 0.2,
      },
    });

    expect(rpc).toHaveBeenCalledWith("search_finance_project_risk_ids", {
      p_tenant_id: "tenant-1",
      p_page: 2,
      p_page_size: 20,
      p_keyword: "张三",
      p_status: "constructing",
      p_risk_level: "warning",
      p_risk_flag: "unallocated_expense",
      p_budget_configured: false,
      p_has_unallocated_expense: true,
      p_overdue: true,
      p_min_budget_usage_ratio: 0.8,
      p_max_projected_budget_gross_margin: 0.2,
    });
    expect(result.projectIds).toEqual(["project-2", "project-1"]);
    expect(result.pagination.total).toBe(2);
  });
});
```

- [ ] **Step 6: Add repository methods**

In `apps/api/src/repositories/finance-project-summary.ts`, extend `FinanceProjectLedgerTotals`:

```ts
export type FinanceProjectLedgerTotals = {
  income_amount: number;
  expense_amount: number;
  unallocated_expense_amount: number;
  ledger_entry_count: number;
  expense_by_category: Map<string, number>;
};
```

Initialize `unallocated_expense_amount: 0` in `listLedgerTotals`, and add:

```ts
if (row.direction === "out" && !row.cost_category_id) {
  current.unallocated_expense_amount += amount;
}
```

Add these repository types:

```ts
export type FinanceProjectRiskSearchResult = {
  projectIds: string[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type FinanceProjectRiskSearchRow = {
  project_id: string;
  total_count: number | string | null;
};
```

Add method `searchProjectIdsByRisk`:

```ts
async searchProjectIdsByRisk(input: {
  tenantId: string;
  query: FinanceProjectSummaryListQuery;
}): Promise<FinanceProjectRiskSearchResult> {
  const page = input.query.page ?? 1;
  const pageSize = Math.min(input.query.pageSize ?? 20, 100);
  const { data, error } = await SupabaseDB.getAdminClient().rpc(
    "search_finance_project_risk_ids",
    {
      p_tenant_id: input.tenantId,
      p_page: page,
      p_page_size: pageSize,
      p_keyword: input.query.keyword ?? null,
      p_status: input.query.status ?? null,
      p_risk_level: input.query.risk_level ?? null,
      p_risk_flag: input.query.risk_flag ?? null,
      p_budget_configured: input.query.budget_configured ?? null,
      p_has_unallocated_expense: input.query.has_unallocated_expense ?? null,
      p_overdue: input.query.overdue ?? null,
      p_min_budget_usage_ratio: input.query.min_budget_usage_ratio ?? null,
      p_max_projected_budget_gross_margin:
        input.query.max_projected_budget_gross_margin ?? null,
    },
  );

  if (error) {
    throw Errors.dbError("查询项目经营风险筛选失败", error);
  }

  const rows = ((data as FinanceProjectRiskSearchRow[] | null) || []);
  const total = Number(rows[0]?.total_count ?? 0);
  return {
    projectIds: rows.map((row) => row.project_id).filter(Boolean),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total ? Math.ceil(total / pageSize) : 0,
    },
  };
}
```

Add method `listProjectsByIds`:

```ts
async listProjectsByIds(input: {
  tenantId: string;
  projectIds: string[];
}): Promise<FinanceProjectSummaryProjectRow[]> {
  if (input.projectIds.length === 0) return [];

  const { data, error } = await SupabaseDB.getAdminClient()
    .from("projects")
    .select("id, name, status, signed_amount, budget")
    .eq("tenant_id", input.tenantId)
    .in("id", input.projectIds);

  if (error) {
    throw Errors.dbError("查询项目经营汇总失败", error);
  }

  const byId = new Map(
    ((data as FinanceProjectSummaryProjectRow[] | null) || [])
      .map((project) => [project.id, project]),
  );
  return input.projectIds
    .map((projectId) => byId.get(projectId))
    .filter((project): project is FinanceProjectSummaryProjectRow => Boolean(project));
}
```

- [ ] **Step 7: Run focused backend tests**

Run:

```bash
cd apps/api
bun test ./src/repositories/finance-project-summary-risk-search.test.ts ./src/services/finance-project-summary.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260624160000_finance_project_risk_search.sql apps/api/src/schema/finance.ts apps/api/src/repositories/finance-project-summary.ts apps/api/src/repositories/finance-project-summary-risk-search.test.ts apps/api/src/services/finance-project-summary.test.ts
git commit -m "feat(finance): 支持项目风险筛选查询"
```

---

## Task 3: Finance Summary Service Integration

**Files:**

- Modify: `apps/api/src/services/finance-project-summary.ts`
- Modify: `apps/api/src/services/finance-project-summary.test.ts`

- [ ] **Step 1: Add service tests for risk filtering and reasons**

Extend repository mock in `apps/api/src/services/finance-project-summary.test.ts`:

```ts
const searchProjectIdsByRisk = mock(async () => ({
  projectIds: ["project-1"],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  },
}));
const listProjectsByIds = mock(async () => [
  {
    id: "project-1",
    name: "阶段五风险项目",
    status: "constructing",
    signed_amount: 100000,
    budget: 90000,
  },
]);
```

Add the mocks to the `financeProjectSummaryRepository` mock object.

Update every existing `listLedgerTotals` mock row in this file to include:

```ts
unallocated_expense_amount: 0,
```

This keeps existing tests explicit after `FinanceProjectLedgerTotals` gains the new required field.

Add tests:

```ts
test("uses risk search path when risk filters are provided", async () => {
  const { financeProjectSummaryService } =
    await import("./finance-project-summary");

  const result = await financeProjectSummaryService.listProjectSummaries(
    authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
    { page: 1, pageSize: 20, risk_level: "warning" },
  );

  expect(searchProjectIdsByRisk).toHaveBeenCalledWith({
    tenantId: "tenant-1",
    query: { page: 1, pageSize: 20, risk_level: "warning" },
  });
  expect(listProjects).not.toHaveBeenCalled();
  expect(listProjectsByIds).toHaveBeenCalledWith({
    tenantId: "tenant-1",
    projectIds: ["project-1"],
  });
  expect(result.pagination.total).toBe(1);
});

test("returns unallocated expense risk reason", async () => {
  listLedgerTotals.mockImplementationOnce(async () => new Map([
    ["project-1", {
      income_amount: 50000,
      expense_amount: 12000,
      unallocated_expense_amount: 1200,
      ledger_entry_count: 3,
      expense_by_category: new Map([
        ["category-1", 10800],
      ]),
    }],
  ]));

  const { financeProjectSummaryService } =
    await import("./finance-project-summary");

  const result = await financeProjectSummaryService.listProjectSummaries(
    authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
    { page: 1, pageSize: 20 },
  );

  expect(result.list[0]?.unallocated_expense_amount).toBe(1200);
  expect(result.list[0]?.risk_flags).toContain("unallocated_expense");
  expect(result.list[0]?.risk_reasons).toContainEqual(
    expect.objectContaining({
      code: "unallocated_expense",
      action: expect.objectContaining({ key: "open_unallocated_ledger" }),
    }),
  );
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
cd apps/api
bun test ./src/services/finance-project-summary.test.ts
```

Expected: FAIL because service types and dependency wiring do not include risk search and reasons yet.

- [ ] **Step 3: Integrate risk helper and risk search path**

In `apps/api/src/services/finance-project-summary.ts`, import:

```ts
import {
  buildFinanceProjectRisk,
  type FinanceProjectRiskFlag,
  type FinanceProjectRiskLevel,
  type FinanceProjectRiskReason,
} from "@/services/finance-project-risk";
```

Extend `FinanceProjectOperatingSummary`:

```ts
  unallocated_expense_amount: number;
  risk_reasons: FinanceProjectRiskReason[];
```

Extend totals:

```ts
  unallocated_expense_amount: number;
  risk_counts: Record<FinanceProjectRiskLevel, number>;
  risk_flag_counts: Record<FinanceProjectRiskFlag, number>;
```

Extend dependencies:

```ts
    searchProjectIdsByRisk: typeof financeProjectSummaryRepository.searchProjectIdsByRisk;
    listProjectsByIds: typeof financeProjectSummaryRepository.listProjectsByIds;
```

Add helper:

```ts
function hasRiskFilters(query: FinanceProjectSummaryListQuery) {
  return Boolean(
    query.risk_level ||
      query.risk_flag ||
      query.budget_configured !== undefined ||
      query.has_unallocated_expense !== undefined ||
      query.overdue !== undefined ||
      query.min_budget_usage_ratio !== undefined ||
      query.max_projected_budget_gross_margin !== undefined
  );
}
```

Replace list path in `listProjectSummaries`:

```ts
const projectPage = hasRiskFilters(query)
  ? await this.listRiskFilteredProjects({ tenantId, query })
  : await this.dependencies.repository.listProjects(tenantId, query);
const list = await this.buildSummaries({
  tenantId,
  projects: projectPage.list,
});

return {
  ...projectPage,
  list,
  summary: summarizeList(list),
};
```

Add private method:

```ts
private async listRiskFilteredProjects(input: {
  tenantId: string;
  query: FinanceProjectSummaryListQuery;
}) {
  const search = await this.dependencies.repository.searchProjectIdsByRisk(input);
  const projects = await this.dependencies.repository.listProjectsByIds({
    tenantId: input.tenantId,
    projectIds: search.projectIds,
  });
  return {
    list: projects,
    pagination: search.pagination,
  };
}
```

Replace old `resolveRiskFlags` and `resolveRiskLevel` usage in `buildProjectOperatingSummary` with:

```ts
const unallocatedExpenseAmount = roundMoney(
  input.ledgerTotals?.unallocated_expense_amount ?? 0,
);
const risk = buildFinanceProjectRisk({
  projectId: input.project.id,
  contractAmount,
  receivedAmount,
  expensePaidAmount,
  budgetConfigured,
  budgetCostAmount,
  budgetUsageRatio,
  projectedBudgetGrossMargin,
  overdueCount: input.receivableTotals?.overdue_count ?? 0,
  overdueAmount: roundMoney(input.receivableTotals?.overdue_amount ?? 0),
  unallocatedExpenseAmount,
  hasCategoryOverBudget: hasCategoryOverBudget({
    budgetTotals: input.budgetTotals,
    expenseByCategory: input.ledgerTotals?.expense_by_category,
  }),
});
```

Return:

```ts
    unallocated_expense_amount: unallocatedExpenseAmount,
    risk_level: risk.risk_level,
    risk_flags: risk.risk_flags,
    risk_reasons: risk.risk_reasons,
```

In `summarizeList`, initialize:

```ts
    unallocated_expense_amount: 0,
    risk_counts: { normal: 0, info: 0, warning: 0, danger: 0 },
    risk_flag_counts: {
      budget_missing: 0,
      unallocated_expense: 0,
      category_over_budget: 0,
      project_over_budget: 0,
      low_projected_margin: 0,
      receivable_overdue: 0,
      negative_actual_profit: 0,
      negative_projected_profit: 0,
    },
```

During reduce:

```ts
acc.unallocated_expense_amount += item.unallocated_expense_amount;
acc.risk_counts[item.risk_level] += 1;
for (const flag of item.risk_flags) {
  acc.risk_flag_counts[flag] += 1;
}
```

- [ ] **Step 4: Run focused service tests**

Run:

```bash
cd apps/api
bun test ./src/services/finance-project-risk.test.ts ./src/services/finance-project-summary.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/finance-project-summary.ts apps/api/src/services/finance-project-summary.test.ts
git commit -m "feat(finance): 输出项目风险原因"
```

---

## Task 4: Ledger Filtering For Unallocated Costs

**Files:**

- Modify: `apps/api/src/schema/finance.ts`
- Modify: `apps/api/src/repositories/finance-ledger.ts`
- Modify: `apps/api/src/services/finance-ledger.test.ts`
- Modify: `apps/api/src/services/finance-ledger.ts`

- [ ] **Step 1: Add ledger filter tests**

In `apps/api/src/services/finance-ledger.test.ts`, add a test that calls `financeLedgerService.list` with:

```ts
{
  page: 1,
  pageSize: 20,
  project_id: "project-1",
  direction: "out",
  unallocated_only: true,
}
```

Assert repository receives the same query and that permission behavior remains `finance.ledger.view`.

- [ ] **Step 2: Extend schema**

In `apps/api/src/schema/finance.ts`, extend `FinanceLedgerListQuerySchema`:

```ts
  unallocated_only: OptionalBooleanQuerySchema,
```

Move `OptionalBooleanQuerySchema` above both ledger and project summary schemas so it is shared.

- [ ] **Step 3: Extend repository query**

In `apps/api/src/repositories/finance-ledger.ts`, add:

```ts
if (query.unallocated_only) {
  request = request
    .eq("direction", "out")
    .is("cost_category_id", null);
}
```

Make sure this composes with `project_id`, `direction`, date filters, and pagination.

- [ ] **Step 4: Run focused ledger tests**

Run:

```bash
cd apps/api
bun test ./src/services/finance-ledger.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/schema/finance.ts apps/api/src/repositories/finance-ledger.ts apps/api/src/services/finance-ledger.ts apps/api/src/services/finance-ledger.test.ts
git commit -m "feat(finance): 支持未归集台账筛选"
```

---

## Task 5: Admin Types And Shared Risk Display

**Files:**

- Modify: `apps/admin/components/finance/finance-requests.ts`
- Create: `apps/admin/components/finance/finance-risk-display.ts`
- Create: `apps/admin/components/finance/finance-risk-display.test.ts`

- [ ] **Step 1: Add failing Admin risk display tests**

Create `apps/admin/components/finance/finance-risk-display.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  financeRiskActionHref,
  financeRiskLabel,
  financeRiskVariant,
  summarizeFinanceRiskReasons,
} from "./finance-risk-display";

describe("finance risk display helpers", () => {
  test("maps risk levels to labels and badge variants", () => {
    expect(financeRiskLabel("danger")).toBe("高风险");
    expect(financeRiskVariant("warning")).toBe("warning");
    expect(financeRiskVariant("normal")).toBe("success");
  });

  test("summarizes first two reasons with overflow count", () => {
    expect(summarizeFinanceRiskReasons([
      { code: "budget_missing", title: "未配置预算" },
      { code: "unallocated_expense", title: "存在未归集成本" },
      { code: "receivable_overdue", title: "存在逾期应收" },
    ])).toBe("未配置预算、存在未归集成本 +1");
  });

  test("maps backend action keys to local hrefs", () => {
    expect(financeRiskActionHref({
      key: "open_unallocated_ledger",
      label: "去归集成本",
      target: "/finance/ledger?project_id=project-1&direction=out&unallocated_only=true",
    })).toBe("/finance/ledger?project_id=project-1&direction=out&unallocated_only=true");
    expect(financeRiskActionHref({
      key: "unknown_action",
      label: "未知",
      target: "/not-used",
    })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the Admin focused test and confirm it fails**

Run:

```bash
cd apps/admin
bun test components/finance/finance-risk-display.test.ts
```

Expected: FAIL because the helper file does not exist.

- [ ] **Step 3: Extend Admin finance types**

In `apps/admin/components/finance/finance-requests.ts`, extend `FinanceProjectRiskFlag`:

```ts
  | "unallocated_expense"
  | "negative_actual_profit"
  | "negative_projected_profit";
```

Add:

```ts
export type FinanceProjectRiskReason = {
  code: FinanceProjectRiskFlag;
  level: FinanceProjectRiskLevel;
  title: string;
  description: string;
  current_value: number | null;
  threshold_value: number | null;
  unit: "money" | "ratio" | "count" | "boolean";
  action: {
    key: string;
    label: string;
    target: string;
  } | null;
};
```

Extend `FinanceProjectOperatingSummary`:

```ts
  unallocated_expense_amount: number;
  risk_reasons: FinanceProjectRiskReason[];
```

Extend totals:

```ts
  unallocated_expense_amount: number;
  risk_counts: Record<FinanceProjectRiskLevel, number>;
  risk_flag_counts: Record<FinanceProjectRiskFlag, number>;
```

Extend `fetchFinanceProjectSummaries` query input:

```ts
  risk_level?: string;
  risk_flag?: string;
  budget_configured?: string;
  has_unallocated_expense?: string;
  overdue?: string;
  min_budget_usage_ratio?: string;
  max_projected_budget_gross_margin?: string;
```

Append each optional query param.

Extend `fetchFinanceLedger` query input:

```ts
  project_id?: string;
  direction?: string;
  unallocated_only?: string;
```

Append `project_id`, `direction`, and `unallocated_only`.

- [ ] **Step 4: Add shared display helper**

Create `apps/admin/components/finance/finance-risk-display.ts`:

```ts
import type {
  FinanceProjectRiskLevel,
  FinanceProjectRiskReason,
} from "@/components/finance/finance-requests";

export function financeRiskLabel(level: FinanceProjectRiskLevel) {
  if (level === "danger") return "高风险";
  if (level === "warning") return "预警";
  if (level === "info") return "待处理";
  return "正常";
}

export function financeRiskVariant(level: FinanceProjectRiskLevel) {
  if (level === "danger") return "danger" as const;
  if (level === "warning") return "warning" as const;
  if (level === "info") return "secondary" as const;
  return "success" as const;
}

export function summarizeFinanceRiskReasons(
  reasons: Array<Pick<FinanceProjectRiskReason, "code" | "title">>,
) {
  const titles = reasons
    .map((reason) => reason.title)
    .filter(Boolean);
  if (titles.length <= 2) return titles.join("、");
  return `${titles.slice(0, 2).join("、")} +${titles.length - 2}`;
}

export function financeRiskActionHref(action: {
  key: string;
  target: string;
} | null | undefined) {
  if (!action) return null;
  if (
    action.key === "open_cost_budget" ||
    action.key === "open_unallocated_ledger" ||
    action.key === "open_receivables" ||
    action.key === "open_project_finance"
  ) {
    return action.target;
  }
  return null;
}
```

- [ ] **Step 5: Run Admin focused test**

Run:

```bash
cd apps/admin
bun test components/finance/finance-risk-display.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/components/finance/finance-requests.ts apps/admin/components/finance/finance-risk-display.ts apps/admin/components/finance/finance-risk-display.test.ts
git commit -m "feat(admin): 增加财务风险展示契约"
```

---

## Task 6: Admin Finance Dashboard Filters And Risk Table

**Files:**

- Modify: `apps/admin/app/(console)/finance/page.tsx`
- Modify: `apps/admin/components/finance/finance-project-summary-table.tsx`
- Modify: `apps/admin/components/finance/finance-requests.ts`

- [ ] **Step 1: Extend page search params**

In `apps/admin/app/(console)/finance/page.tsx`, extend `FinancePageSearchParams`:

```ts
  risk_level?: string;
  risk_flag?: string;
  budget_configured?: string;
  has_unallocated_expense?: string;
  overdue?: string;
```

Add static options:

```ts
const RISK_LEVEL_OPTIONS = [
  { value: "", label: "全部风险" },
  { value: "normal", label: "正常" },
  { value: "info", label: "待处理" },
  { value: "warning", label: "预警" },
  { value: "danger", label: "高风险" },
];

const RISK_FLAG_OPTIONS = [
  { value: "", label: "全部原因" },
  { value: "budget_missing", label: "未配置预算" },
  { value: "unallocated_expense", label: "未归集成本" },
  { value: "category_over_budget", label: "分类超预算" },
  { value: "project_over_budget", label: "项目超预算" },
  { value: "low_projected_margin", label: "预算毛利偏低" },
  { value: "receivable_overdue", label: "应收逾期" },
  { value: "negative_actual_profit", label: "实际利润为负" },
  { value: "negative_projected_profit", label: "预算利润为负" },
];

const BOOLEAN_FILTER_OPTIONS = [
  { value: "", label: "全部" },
  { value: "true", label: "是" },
  { value: "false", label: "否" },
];
```

- [ ] **Step 2: Pass filters to backend request and pagination links**

Update `fetchFinanceProjectSummaries` call:

```ts
  const data = await fetchFinanceProjectSummaries({
    page,
    pageSize: 20,
    keyword: clean(params.keyword),
    status: clean(params.status),
    risk_level: clean(params.risk_level),
    risk_flag: clean(params.risk_flag),
    budget_configured: clean(params.budget_configured),
    has_unallocated_expense: clean(params.has_unallocated_expense),
    overdue: clean(params.overdue),
  });
```

Update `buildFinanceSummaryHref` to append all new filters.

- [ ] **Step 3: Add compact filter controls**

Change the form grid to:

```tsx
className="shrink-0 grid gap-3 border-b bg-card p-4 md:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_12rem_11rem_12rem_10rem_10rem_auto] xl:items-end"
```

Add select controls for:

- `risk_level`
- `risk_flag`
- `budget_configured`
- `has_unallocated_expense`
- `overdue`

Keep labels compact and use existing select styling from the page.

- [ ] **Step 4: Update KPI cards**

Use summary fields:

```tsx
const riskCounts = summary.risk_counts || {
  normal: 0,
  info: 0,
  warning: 0,
  danger: 0,
};
const flagCounts = summary.risk_flag_counts || {};
```

Add cards for:

- 高风险项目：`riskCounts.danger`
- 预警项目：`riskCounts.warning`
- 未配置预算：`flagCounts.budget_missing || 0`
- 未归集成本：`formatFinanceMoney(summary.unallocated_expense_amount)`
- 逾期应收：existing overdue amount/count

Use the existing `FinanceMetricCard` component. Keep the dashboard dense and operational.

- [ ] **Step 5: Update table risk column**

In `apps/admin/components/finance/finance-project-summary-table.tsx`, replace local flag text with:

```ts
import {
  financeRiskActionHref,
  financeRiskLabel,
  financeRiskVariant,
  summarizeFinanceRiskReasons,
} from "@/components/finance/finance-risk-display";
```

In risk cell:

```tsx
const level = riskLevel(row.original);
const reasonText = summarizeFinanceRiskReasons(row.original.risk_reasons || []);
return (
  <div className="max-w-[12rem]">
    <Badge variant={financeRiskVariant(level)}>{financeRiskLabel(level)}</Badge>
    {reasonText ? (
      <div className="mt-1 truncate text-xs text-muted-foreground">
        {reasonText}
      </div>
    ) : null}
  </div>
);
```

Add an unallocated amount column:

```tsx
{
  accessorKey: "unallocated_expense_amount",
  header: "未归集",
  cell: ({ row }) => row.original.unallocated_expense_amount > 0
    ? formatFinanceMoney(row.original.unallocated_expense_amount)
    : "-",
  meta: {
    headerClassName: "text-right",
    cellClassName: "whitespace-nowrap text-right tabular-nums text-muted-foreground",
  },
}
```

In the action cell, add compact links for the first actionable reason:

```tsx
const action = row.original.risk_reasons
  ?.map((reason) => reason.action)
  .find((item) => financeRiskActionHref(item));
const href = financeRiskActionHref(action);
```

Render an extra `Button` with `href` and `action.label` when present.

- [ ] **Step 6: Run Admin check**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add 'apps/admin/app/(console)/finance/page.tsx' apps/admin/components/finance/finance-project-summary-table.tsx apps/admin/components/finance/finance-requests.ts
git commit -m "feat(admin): 增加财务风险筛选"
```

---

## Task 7: Project Detail Risk Explanation

**Files:**

- Modify: `apps/admin/components/projects/project-finance-operating-summary-panel.tsx`
- Modify: `apps/admin/components/projects/project-cost-budget-panel.tsx`

- [ ] **Step 1: Render risk reason cards in project finance summary**

In `project-finance-operating-summary-panel.tsx`, import:

```ts
import {
  financeRiskActionHref,
  financeRiskLabel,
  financeRiskVariant,
} from "@/components/finance/finance-risk-display";
```

Replace local `riskLabel`, `riskVariant`, and `riskFlagText` usage with shared helpers.

After metrics, render:

```tsx
{!loading && summary.risk_reasons.length ? (
  <div className="mt-3 grid gap-2">
    {summary.risk_reasons.map((reason) => {
      const href = financeRiskActionHref(reason.action);
      return (
        <div
          key={reason.code}
          className="rounded-md border bg-background px-3 py-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Badge variant={financeRiskVariant(reason.level)}>
                {financeRiskLabel(reason.level)}
              </Badge>
              <span className="truncate text-sm font-medium">
                {reason.title}
              </span>
            </div>
            {href ? (
              <Button asChild type="button" variant="outline" size="sm">
                <Link href={href}>{reason.action?.label || "处理"}</Link>
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {reason.description}
          </p>
        </div>
      );
    })}
  </div>
) : null}
```

Ensure `emptySummary` includes:

```ts
    unallocated_expense_amount: 0,
    risk_reasons: [],
```

- [ ] **Step 2: Show category risk reasons in budget panel**

If backend adds `risk_reasons` to cost budget rows, extend `ProjectCostBudgetListItem` in `finance-cost-budget-requests.ts`:

```ts
  risk_reasons?: FinanceProjectRiskReason[];
```

In `ProjectCostBudgetPanel`, under each non-editing row risk badge, render the first reason title if present:

```tsx
{row.risk_reasons?.[0]?.title ? (
  <div className="mt-1 truncate text-xs text-muted-foreground">
    {row.risk_reasons[0].title}
  </div>
) : null}
```

- [ ] **Step 3: Run Admin check**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/components/projects/project-finance-operating-summary-panel.tsx apps/admin/components/projects/project-cost-budget-panel.tsx apps/admin/components/finance/finance-cost-budget-requests.ts
git commit -m "feat(admin): 展示项目财务风险原因"
```

---

## Task 8: Ledger Page Unallocated Filter And Risk Links

**Files:**

- Modify: `apps/admin/app/(console)/finance/ledger/page.tsx`
- Modify: `apps/admin/components/finance/finance-requests.ts`

- [ ] **Step 1: Extend ledger page params**

In `FinanceLedgerPageSearchParams`, add:

```ts
  project_id?: string;
  direction?: string;
  unallocated_only?: string;
```

Update `ledgerPageHref` to preserve `project_id`, `direction`, and `unallocated_only`.

- [ ] **Step 2: Pass filters to fetch**

Update `fetchFinanceLedger` call:

```ts
fetchFinanceLedger({
  page,
  pageSize: 20,
  project_id: clean(params.project_id),
  direction: clean(params.direction),
  cost_category_id: costCategoryId,
  unallocated_only: clean(params.unallocated_only),
})
```

- [ ] **Step 3: Add compact controls**

Add two selects before cost category:

- `direction`: 全部方向 / 收入 / 支出
- `unallocated_only`: 全部归集状态 / 仅未归集

Keep `project_id` as a hidden input when present so risk links preserve project context:

```tsx
{clean(params.project_id) ? (
  <input type="hidden" name="project_id" value={clean(params.project_id)} />
) : null}
```

- [ ] **Step 4: Run Admin check**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'apps/admin/app/(console)/finance/ledger/page.tsx' apps/admin/components/finance/finance-requests.ts
git commit -m "feat(admin): 支持未归集台账入口"
```

---

## Task 9: Handoff And Smoke Docs

**Files:**

- Create: `docs/decoration-finance/2026-06-24-phase5-finance-analysis-warning-miniprogram-handoff.md`
- Create: `docs/decoration-finance/2026-06-24-phase5-finance-analysis-warning-smoke.md`
- Modify: `docs/decoration-finance/README.md`

- [ ] **Step 1: Create mini-program handoff**

Create `docs/decoration-finance/2026-06-24-phase5-finance-analysis-warning-miniprogram-handoff.md`:

```md
# 阶段 5：经营分析与预算预警小程序对接说明

日期：2026-06-24

## 结论

本阶段小程序端暂无必改。

后端和 Admin 新增的是经营风险分析、风险筛选和处理入口，不改变 workflow v2，不改变收款 complete payload，不改变费用申请必填字段。

## 小程序继续保持

- 不计算预算。
- 不计算利润。
- 不计算风险等级。
- 不维护风险枚举。
- 不维护成本分类枚举。
- 不根据项目状态、workflow 节点名或本地规则推导财务风险。

## 后续可选展示契约

如产品后续要求员工侧展示项目经营风险，需要后端另行确认权限范围。小程序只读消费：

- `risk_level`
- `risk_reasons[]`
- `budget_usage_ratio`
- `unallocated_expense_amount`

默认不展示利润金额和毛利率。

## 只读 Smoke 建议

- 员工登录。
- 项目详情 workflow v2 仍正常。
- 费用申请入口仍正常。
- 收款 workflow task 仍正常。
- 不执行 workflow complete。
```

- [ ] **Step 2: Create smoke checklist**

Create `docs/decoration-finance/2026-06-24-phase5-finance-analysis-warning-smoke.md` with sections:

```md
# 阶段 5：经营分析与预算预警 Smoke 记录

日期：2026-06-24

## API 验收

- [ ] `GET /finance/project-summary?page=1&pageSize=20&risk_level=warning`
- [ ] `GET /finance/project-summary?risk_flag=project_over_budget`
- [ ] `GET /finance/project-summary?budget_configured=false`
- [ ] `GET /finance/project-summary?has_unallocated_expense=true`
- [ ] `GET /projects/:id/finance-summary`
- [ ] `GET /finance/ledger?project_id=:id&direction=out&unallocated_only=true`

## Admin 验收

- [ ] 财务总览风险等级筛选。
- [ ] 财务总览风险原因筛选。
- [ ] 财务总览风险汇总卡片。
- [ ] 项目详情风险解释区。
- [ ] 未归集成本入口跳转财务台账。
- [ ] 成本分类归集后风险刷新。

## 小程序影响

- [ ] 本阶段无必改。
- [ ] 只读 smoke 不推进 workflow。

## 结果

待执行。
```

- [ ] **Step 3: Update README index**

Add both new docs to `docs/decoration-finance/README.md` after the Phase 5 PRD entry.

- [ ] **Step 4: Verify docs**

Run:

```bash
test -f docs/decoration-finance/2026-06-24-phase5-finance-analysis-warning-miniprogram-handoff.md
test -f docs/decoration-finance/2026-06-24-phase5-finance-analysis-warning-smoke.md
git diff --check
```

Expected:

- Both docs exist.
- `git diff --check` exits 0.

- [ ] **Step 5: Commit**

```bash
git add docs/decoration-finance/2026-06-24-phase5-finance-analysis-warning-miniprogram-handoff.md docs/decoration-finance/2026-06-24-phase5-finance-analysis-warning-smoke.md docs/decoration-finance/README.md
git commit -m "docs(finance): 补充经营预警联调文档"
```

---

## Task 10: Final Verification And Release Smoke

**Files:**

- Modify after smoke: `docs/decoration-finance/2026-06-24-phase5-finance-analysis-warning-smoke.md`

- [ ] **Step 1: Run backend verification**

Run:

```bash
cd apps/api
bun test ./src/services/finance-project-risk.test.ts ./src/repositories/finance-project-summary-risk-search.test.ts ./src/services/finance-project-summary.test.ts ./src/services/finance-ledger.test.ts
bun run typecheck
cd ../..
```

Expected:

- All focused tests pass.
- API typecheck exits 0.

- [ ] **Step 2: Run Admin verification**

Run:

```bash
cd apps/admin
bun test components/finance/finance-risk-display.test.ts components/finance/finance-ledger-utils.test.ts
cd ../..
pnpm --dir apps/admin check
git diff --check
```

Expected:

- Focused Admin tests pass.
- Admin file size and typecheck pass.
- `git diff --check` exits 0.

- [ ] **Step 3: Apply database migration**

Only after reviewing the SQL:

```bash
set -a
source /Users/leefo/Public/work/gooes/.env.local
set +a
supabase db push --yes
supabase migration list | tail -12
```

Expected:

- Remote includes `20260624160000`.
- Local and Remote are aligned.

- [ ] **Step 4: Restart local services**

```bash
launchctl kickstart -k gui/$(id -u)/local.gooes.api
launchctl kickstart -k gui/$(id -u)/local.gooes.admin
```

Verify:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:3010 -sTCP:LISTEN
```

Expected:

- API listens on `3000`.
- Admin listens on `3010`.

- [ ] **Step 5: Run API smoke**

Use account `18800005001 / 小龙女`.

Smoke requests:

```bash
POST /admin/auth/login
GET /finance/project-summary?page=1&pageSize=20&risk_level=warning
GET /finance/project-summary?risk_flag=project_over_budget
GET /finance/project-summary?budget_configured=false
GET /finance/project-summary?has_unallocated_expense=true
GET /projects/:id/finance-summary
GET /finance/ledger?project_id=:id&direction=out&unallocated_only=true
```

Record in the smoke doc:

- HTTP status.
- `pagination.total`.
- first project ID.
- `risk_level`.
- `risk_flags`.
- `risk_reasons`.
- `unallocated_expense_amount`.

- [ ] **Step 6: Run Admin smoke**

Open:

- `http://127.0.0.1:3010/finance`
- `http://127.0.0.1:3010/finance?risk_level=warning`
- `http://127.0.0.1:3010/finance?risk_flag=unallocated_expense`
- `http://127.0.0.1:3010/projects/:projectId?tab=overview`
- `http://127.0.0.1:3010/finance/ledger?project_id=:projectId&direction=out&unallocated_only=true`

Record:

- visible risk filters.
- visible risk summary cards.
- visible risk reason text.
- risk action links.
- console errors.
- failed responses.

- [ ] **Step 7: Commit smoke results**

```bash
git add docs/decoration-finance/2026-06-24-phase5-finance-analysis-warning-smoke.md
git commit -m "docs(finance): 记录经营预警验收"
```

- [ ] **Step 8: Merge and push**

After all verification passes:

```bash
git push origin feat/finance-phase5-risk-warning
```

Then choose the branch completion flow:

- merge locally to `main`, or
- create a PR, or
- keep branch for review.

## Self-Review

Spec coverage:

- Risk levels and risk flags are covered by Tasks 1 and 3.
- Backend server-side risk filtering and correct pagination are covered by Task 2.
- `risk_reasons[]` and action metadata are covered by Tasks 1, 3, 5, 6, and 7.
- Unallocated ledger filtering is covered by Tasks 4 and 8.
- Admin finance dashboard filters, summary cards, table and project detail are covered by Tasks 6 and 7.
- Mini-program no-change boundary and smoke guidance are covered by Task 9.
- Release verification and migration alignment are covered by Task 10.

Placeholder scan:

- This plan intentionally avoids unresolved markers and unspecified file paths.
- Each task includes concrete files, commands, expected results, and commit command.

Type consistency:

- Backend `FinanceProjectRiskFlag` values match Admin `FinanceProjectRiskFlag`.
- `risk_reasons[]` uses the same fields in API and Admin.
- `unallocated_expense_amount` is returned from backend summary and used by Admin cards/table/detail.
