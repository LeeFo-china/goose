# Project Cost Budget Profit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build phase 4 project cost budgets, cost category allocation, and budget-aware profit variance for the decoration finance module.

**Architecture:** Add tenant-level cost categories and project-level cost budgets through Supabase migrations, then extend existing finance services so project operating summaries combine receivables, ledger entries, and budget data. Admin remains the first write surface for budgets; mini-program impact is limited to optional cost category selection for expense requests.

**Tech Stack:** Bun + TypeScript + Fastify API, Supabase migrations, Next.js Admin, shadcn/ui, existing finance workflow and ledger services.

---

## Scope

This plan implements the PRD in [2026-06-24-phase4-cost-budget-profit-prd.md](./2026-06-24-phase4-cost-budget-profit-prd.md).

Do not change workflow runtime progression rules in this phase. Do not introduce Redis, queues, cache layers, or new dependencies.

## File Map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20260624100000_finance_cost_budget.sql` | Create tables, indexes, constraints, permissions seed data, default cost categories |
| `apps/api/src/schema/finance-costs.ts` | Zod schemas for cost categories, project budgets, ledger allocation updates |
| `apps/api/src/repositories/finance-cost-categories.ts` | Supabase access for tenant cost categories |
| `apps/api/src/repositories/project-cost-budgets.ts` | Supabase access for project cost budgets and category expense totals |
| `apps/api/src/services/project-cost-budgets.ts` | Budget business rules, summaries, risk flags |
| `apps/api/src/services/finance-project-summary.ts` | Include budget totals and risk flags in existing phase 3 summary |
| `apps/api/src/controllers/finance/index.ts` | Add cost category and budget routes |
| `apps/api/src/services/expense-requests/legacy/payment.ts` | Carry cost category into paid ledger entries |
| `apps/api/src/services/finance-ledger.ts` | Expose cost category filters/fields and allocation update |
| `apps/admin/components/finance/finance-requests.ts` | Add Admin request helpers and shared types |
| `apps/admin/app/(console)/finance/page.tsx` | Show budget-aware columns and filters |
| `apps/admin/components/projects/project-finance-operating-summary-panel.tsx` | Show budget metrics and risks |
| `apps/admin/components/projects/project-cost-budget-panel.tsx` | New project budget read/edit panel |
| `apps/admin/components/expenses/expense-mutation-types.ts` | Add cost category types to expense records/forms |
| `apps/admin/components/expenses/expense-mutation-shared.ts` | Add cost category field handling in expense forms |
| `apps/admin/components/expenses/expense-mutations.tsx` | Render cost category selection in expense create/edit UI |
| `apps/admin/components/expenses/expense-detail-dialog.tsx` | Display cost category in expense details |
| `apps/admin/components/expenses/expenses-table.tsx` | Display cost category in expense list |
| `docs/decoration-finance/2026-06-24-phase4-cost-budget-profit-smoke.md` | Record verification and smoke results |

## Task 0: Baseline

**Files:**
- Read: `docs/decoration-finance/2026-06-24-phase4-cost-budget-profit-prd.md`
- Read: `apps/api/src/services/finance-project-summary.ts`
- Read: `apps/api/src/services/expense-requests/legacy/payment.ts`
- Read: `apps/admin/app/(console)/finance/page.tsx`

- [ ] **Step 1: Confirm clean branch**

Run:

```bash
git status --short --branch
```

Expected:

```text
## main...origin/main
```

- [ ] **Step 2: Create feature worktree**

Run:

```bash
git worktree add .worktrees/finance-phase4-cost-budget -b feat/finance-phase4-cost-budget main
cd .worktrees/finance-phase4-cost-budget
```

Expected: new worktree on `feat/finance-phase4-cost-budget`.

- [ ] **Step 3: Run baseline checks**

Run:

```bash
bun run api:check
pnpm --dir apps/admin check
supabase migration list --linked --password "$SUPABASE_DB_PASSWORD"
```

Expected: API/Admin checks pass, local and remote migrations are aligned.

Commit: no commit for Task 0.

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260624100000_finance_cost_budget.sql`
- Check: `apps/api/src/types/database.ts`

- [ ] **Step 1: Write migration**

Create a migration with these objects:

```sql
create table if not exists public.finance_cost_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'active',
  sort_order integer not null default 100,
  is_system boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references public.employees(id) on delete set null,
  updated_by uuid null references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_cost_categories_status_check
    check (status in ('active', 'inactive')),
  constraint finance_cost_categories_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint finance_cost_categories_code_not_blank_check
    check (length(trim(code)) > 0),
  constraint finance_cost_categories_name_not_blank_check
    check (length(trim(name)) > 0)
);

create unique index if not exists finance_cost_categories_tenant_code_uidx
  on public.finance_cost_categories(tenant_id, code);

create index if not exists finance_cost_categories_tenant_status_sort_idx
  on public.finance_cost_categories(tenant_id, status, sort_order);

create table if not exists public.project_cost_budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  cost_category_id uuid not null references public.finance_cost_categories(id),
  budget_amount numeric(12,2) not null default 0,
  warning_threshold_percent numeric(6,2) not null default 100,
  status text not null default 'active',
  remark text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references public.employees(id) on delete set null,
  updated_by uuid null references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_cost_budgets_amount_check check (budget_amount >= 0),
  constraint project_cost_budgets_threshold_check
    check (warning_threshold_percent > 0),
  constraint project_cost_budgets_status_check
    check (status in ('active', 'inactive')),
  constraint project_cost_budgets_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists project_cost_budgets_active_category_uidx
  on public.project_cost_budgets(tenant_id, project_id, cost_category_id)
  where status = 'active';

create index if not exists project_cost_budgets_project_status_idx
  on public.project_cost_budgets(project_id, status);

alter table public.expense_requests
  add column if not exists cost_category_id uuid null
    references public.finance_cost_categories(id);

alter table public.finance_ledger_entries
  add column if not exists cost_category_id uuid null
    references public.finance_cost_categories(id),
  add column if not exists cost_category_updated_by uuid null
    references public.employees(id) on delete set null,
  add column if not exists cost_category_updated_at timestamptz null;

create index if not exists expense_requests_cost_category_idx
  on public.expense_requests(cost_category_id);

create index if not exists finance_ledger_entries_cost_category_idx
  on public.finance_ledger_entries(tenant_id, cost_category_id, occurred_at desc);
```

Also seed default categories for every tenant:

```sql
insert into public.finance_cost_categories
  (tenant_id, code, name, sort_order, is_system)
select t.id, v.code, v.name, v.sort_order, true
from public.tenants t
cross join (
  values
    ('labor', '人工', 10),
    ('main_material', '主材', 20),
    ('auxiliary_material', '辅材', 30),
    ('outsourcing', '外包', 40),
    ('design', '设计', 50),
    ('management', '管理费', 60),
    ('after_sales', '售后', 70),
    ('other', '其他', 100)
) as v(code, name, sort_order)
on conflict (tenant_id, code) do nothing;
```

Seed permissions:

```sql
insert into public.permissions
  (code, name, module, resource, action, description, status)
values
  (
    'finance.budget.view',
    '查看项目预算',
    'finance',
    'budget',
    'view',
    '查看项目预算和利润偏差',
    'active'
  ),
  (
    'finance.budget.manage',
    '管理项目预算',
    'finance',
    'budget',
    'manage',
    '维护项目预算',
    'active'
  ),
  (
    'finance.cost-category.view',
    '查看成本分类',
    'finance',
    'cost-category',
    'view',
    '查看租户成本分类',
    'active'
  ),
  (
    'finance.cost-category.manage',
    '管理成本分类',
    'finance',
    'cost-category',
    'manage',
    '维护租户成本分类',
    'active'
  ),
  (
    'finance.cost-allocation.manage',
    '管理成本归集',
    'finance',
    'cost-allocation',
    'manage',
    '调整费用和台账成本分类',
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
join public.permissions
  on permissions.code in (
    'finance.budget.view',
    'finance.budget.manage',
    'finance.cost-category.view',
    'finance.cost-category.manage',
    'finance.cost-allocation.manage'
  )
where roles.code in ('system_admin', 'finance_base')
on conflict (role_id, permission_id) do update set
  access_scope = excluded.access_scope;
```

- [ ] **Step 2: Apply migration**

Run:

```bash
supabase db push --linked --password "$SUPABASE_DB_PASSWORD"
supabase migration list --linked --password "$SUPABASE_DB_PASSWORD"
```

Expected: new migration is present in both Local and Remote columns.

- [ ] **Step 3: Regenerate database types**

Run:

```bash
supabase gen types typescript --linked > apps/api/src/types/database.ts
```

Expected: generated types include `finance_cost_categories`, `project_cost_budgets`, and new `cost_category_id` columns.

- [ ] **Step 4: Commit**

Run:

```bash
git add supabase/migrations apps/api/src/types/database.ts
git commit -m "feat(finance): 增加项目成本预算数据模型"
```

## Task 2: Backend Cost Categories

**Files:**
- Create: `apps/api/src/schema/finance-costs.ts`
- Create: `apps/api/src/repositories/finance-cost-categories.ts`
- Modify: `apps/api/src/controllers/finance/index.ts`
- Test: `apps/api/src/services/finance-cost-categories.test.ts`

- [ ] **Step 1: Write service test**

Create `apps/api/src/services/finance-cost-categories.test.ts` with tests that prove:

```ts
test("lists active cost categories for finance viewers", async () => {
  const result = await financeCostCategoryService.list(authContext, {
    page: 1,
    pageSize: 20,
    status: "active",
  });
  expect(result.list[0]).toMatchObject({
    code: "labor",
    name: "人工",
    status: "active",
  });
  expect(result.pagination.total).toBe(1);
});

test("rejects category creation without manage permission", async () => {
  await expect(
    financeCostCategoryService.create(viewOnlyContext, {
      code: "cleaning",
      name: "保洁",
      sort_order: 90,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
```

- [ ] **Step 2: Verify test fails**

Run:

```bash
bun test ./src/services/finance-cost-categories.test.ts
```

Expected: fail because service module does not exist.

- [ ] **Step 3: Implement schema/repository/service/controller**

Implement:

- `GET /finance/cost-categories`
- `POST /finance/cost-categories`
- `PATCH /finance/cost-categories/:id`

Rules:

- Lists must use `.range(from, to)`.
- Category list pageSize max is 100.
- `code` can only contain lowercase letters, digits, hyphen, underscore.
- Creation requires `finance.cost-category.manage`.
- List requires `finance.cost-category.view`, `finance.budget.view`, or `finance.view`.
- Errors must use `Errors.*` from `error-factory.ts`.

- [ ] **Step 4: Verify**

Run:

```bash
bun test ./src/services/finance-cost-categories.test.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/schema/finance-costs.ts apps/api/src/repositories/finance-cost-categories.ts apps/api/src/services/finance-cost-categories.ts apps/api/src/services/finance-cost-categories.test.ts apps/api/src/controllers/finance/index.ts
git commit -m "feat(finance): 增加成本分类接口"
```

## Task 3: Backend Project Cost Budgets

**Files:**
- Create: `apps/api/src/repositories/project-cost-budgets.ts`
- Create: `apps/api/src/services/project-cost-budgets.ts`
- Modify: `apps/api/src/schema/finance-costs.ts`
- Modify: `apps/api/src/controllers/finance/index.ts`
- Test: `apps/api/src/services/project-cost-budgets.test.ts`

- [ ] **Step 1: Write service tests**

Create tests for:

```ts
test("returns project budget summary with category expense totals", async () => {
  const result = await projectCostBudgetService.listProjectBudgets(
    financeContext,
    "project-1",
  );
  expect(result.summary).toMatchObject({
    budget_configured: true,
    budget_amount: 80000,
    expense_amount: 36000,
    remaining_amount: 44000,
    usage_ratio: 0.45,
  });
  expect(result.list[0]).toMatchObject({
    category_code: "labor",
    budget_amount: 30000,
    expense_amount: 12000,
    remaining_amount: 18000,
  });
});

test("upserts project budgets for finance budget managers", async () => {
  const result = await projectCostBudgetService.saveProjectBudgets(
    managerContext,
    "project-1",
    {
      items: [
        {
          cost_category_id: "category-1",
          budget_amount: 30000,
          warning_threshold_percent: 100,
          remark: "人工预算",
        },
      ],
    },
  );
  expect(result.list).toHaveLength(1);
});
```

- [ ] **Step 2: Verify test fails**

Run:

```bash
bun test ./src/services/project-cost-budgets.test.ts
```

Expected: fail because service module does not exist.

- [ ] **Step 3: Implement budget service**

Add:

- `GET /projects/:id/cost-budgets`
- `PUT /projects/:id/cost-budgets`

Rules:

- Read allowed by `finance.budget.view`, `finance.view`, or project read access.
- Write requires `finance.budget.manage`.
- Verify project belongs to tenant before reading or writing budgets.
- Expense totals come from `finance_ledger_entries` with `direction='out'`, same tenant, same project, grouped by `cost_category_id`.
- Missing category expenses should be included in summary as unallocated expense.
- Round money to 2 decimals and ratios to 4 decimals.

- [ ] **Step 4: Verify**

Run:

```bash
bun test ./src/services/project-cost-budgets.test.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/project-cost-budgets.ts apps/api/src/services/project-cost-budgets.ts apps/api/src/services/project-cost-budgets.test.ts apps/api/src/schema/finance-costs.ts apps/api/src/controllers/finance/index.ts
git commit -m "feat(finance): 增加项目成本预算接口"
```

## Task 4: Cost Allocation Through Expense and Ledger

**Files:**
- Modify: `apps/api/src/schema/expense-requests.ts`
- Modify: `apps/api/src/services/expense-requests/legacy/payment.ts`
- Modify: `apps/api/src/services/expense-requests/legacy/drafts.ts`
- Modify: `apps/api/src/services/finance-ledger.ts`
- Modify: `apps/api/src/repositories/finance-ledger.ts`
- Test: `apps/api/src/services/expense-requests/legacy/payment.test.ts`
- Test: `apps/api/src/services/finance-ledger.test.ts`

- [ ] **Step 1: Add failing tests**

Add assertions:

```ts
test("writes cost category to expense settlement ledger", async () => {
  const result = await payExpenseRequest(context, {
    expense_request_id: "expense-1",
    amount: 1000,
    paid_at: "2026-06-24",
    evidence_images: [],
  });
  expect(result.ledger_entry.cost_category_id).toBe("category-1");
});

test("updates ledger cost category with audit fields", async () => {
  const result = await financeLedgerService.updateCostCategory(context, "ledger-1", {
    cost_category_id: "category-2",
  });
  expect(result.cost_category_id).toBe("category-2");
  expect(result.cost_category_updated_by).toBe(context.employeeId);
});
```

- [ ] **Step 2: Verify test fails**

Run:

```bash
bun test ./src/services/expense-requests/legacy/payment.test.ts ./src/services/finance-ledger.test.ts
```

Expected: fail because cost category is not carried into ledger yet.

- [ ] **Step 3: Implement allocation**

Rules:

- Expense creation accepts optional `cost_category_id`.
- If provided, category must belong to tenant and be active.
- Payment ledger copies `expense_requests.cost_category_id`.
- Ledger list returns category fields.
- Add `PATCH /finance/ledger/:id/cost-category`.
- Ledger category update requires `finance.cost-allocation.manage`.

- [ ] **Step 4: Verify**

Run:

```bash
bun test ./src/services/expense-requests/legacy/payment.test.ts ./src/services/finance-ledger.test.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/schema/expense-requests.ts apps/api/src/services/expense-requests apps/api/src/services/finance-ledger.ts apps/api/src/repositories/finance-ledger.ts apps/api/src/controllers/finance/index.ts
git commit -m "feat(finance): 打通费用成本归集"
```

## Task 5: Budget-Aware Project Summary

**Files:**
- Modify: `apps/api/src/services/finance-project-summary.ts`
- Modify: `apps/api/src/repositories/finance-project-summary.ts`
- Test: `apps/api/src/services/finance-project-summary.test.ts`

- [ ] **Step 1: Extend tests**

Add expected fields:

```ts
expect(first).toMatchObject({
  budget_configured: true,
  budget_cost_amount: 80000,
  budget_remaining_amount: 68000,
  budget_usage_ratio: 0.15,
  projected_budget_profit_amount: 20000,
  profit_variance_amount: 18000,
  projected_budget_gross_margin: 0.2,
  risk_level: "normal",
  risk_flags: [],
});
```

Add an over-budget test:

```ts
expect(overBudget.risk_level).toBe("danger");
expect(overBudget.risk_flags).toContain("project_over_budget");
```

- [ ] **Step 2: Verify test fails**

Run:

```bash
bun test ./src/services/finance-project-summary.test.ts
```

Expected: fail because budget fields are missing.

- [ ] **Step 3: Implement summary extension**

Rules:

- Read active project budgets for current page project IDs only.
- Avoid N+1 queries.
- Keep existing fields backward compatible.
- Risk flags:
  - `budget_missing`
  - `category_over_budget`
  - `project_over_budget`
  - `low_projected_margin`
  - `receivable_overdue`

- [ ] **Step 4: Verify**

Run:

```bash
bun test ./src/services/finance-project-summary.test.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/finance-project-summary.ts apps/api/src/repositories/finance-project-summary.ts apps/api/src/services/finance-project-summary.test.ts
git commit -m "feat(finance): 项目经营汇总接入预算偏差"
```

## Task 6: Admin Budget UI

**Files:**
- Modify: `apps/admin/components/finance/finance-requests.ts`
- Modify: `apps/admin/components/finance/finance-project-summary-table.tsx`
- Modify: `apps/admin/app/(console)/finance/page.tsx`
- Modify: `apps/admin/components/projects/project-finance-operating-summary-panel.tsx`
- Create: `apps/admin/components/projects/project-cost-budget-panel.tsx`
- Modify: `apps/admin/components/projects/project-detail-page-client.tsx`

- [ ] **Step 1: Extend Admin types and fetchers**

Update `FinanceProjectOperatingSummary` with:

```ts
budget_configured: boolean;
budget_cost_amount: number;
budget_remaining_amount: number;
budget_usage_ratio: number | null;
projected_budget_profit_amount: number;
profit_variance_amount: number;
projected_budget_gross_margin: number | null;
risk_level: "normal" | "info" | "warning" | "danger";
risk_flags: string[];
```

Add `fetchProjectCostBudgets(projectId)` and `saveProjectCostBudgets(projectId, items)`.

- [ ] **Step 2: Implement finance summary table columns**

Add columns:

- 预算成本
- 预算剩余
- 使用率
- 预算利润
- 风险

The table should still render if budget fields are missing during local development; use defaults only in display helpers, not in backend data contracts.

- [ ] **Step 3: Implement project budget panel**

Create `ProjectCostBudgetPanel`:

- read `GET /projects/:projectId/cost-budgets`
- display category rows
- edit mode for budget amount and warning threshold
- save with `PUT /projects/:projectId/cost-budgets`
- show `StatusAlert` for errors

- [ ] **Step 4: Mount project panel**

In project overview tab, render:

1. `ProjectFinanceOperatingSummaryPanel`
2. `ProjectCostBudgetPanel`
3. `ProjectFinanceReceivableSummaryPanel`

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app apps/admin/components/finance apps/admin/components/projects
git commit -m "feat(admin): 展示项目成本预算和利润偏差"
```

## Task 7: Admin Expense and Ledger Allocation UI

**Files:**
- Modify: `apps/admin/components/expenses/expense-mutation-types.ts`
- Modify: `apps/admin/components/expenses/expense-mutation-shared.ts`
- Modify: `apps/admin/components/expenses/expense-mutations.tsx`
- Modify: `apps/admin/components/expenses/expense-detail-dialog.tsx`
- Modify: `apps/admin/components/expenses/expenses-table.tsx`
- Modify: `apps/admin/components/finance/finance-ledger-table.tsx`
- Modify: `apps/admin/app/(console)/finance/ledger/page.tsx`
- Modify: `apps/admin/components/finance/finance-requests.ts`

- [ ] **Step 1: Add cost category selection to expense form**

When expense is bound to a project, load active cost categories and show a select.

Submit:

```json
{
  "project_id": "project-id",
  "cost_category_id": "category-id"
}
```

- [ ] **Step 2: Show category in expense detail**

Display:

- 已归集：category name
- 未归集：`待归集`

- [ ] **Step 3: Show and filter category in ledger**

Add:

- cost category column
- `cost_category_id` filter
- edit action for users with allocation permission

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/components/expenses apps/admin/components/finance 'apps/admin/app/(console)/finance/ledger/page.tsx'
git commit -m "feat(admin): 支持费用成本归集"
```

## Task 8: Smoke and Handoff Docs

**Files:**
- Create: `docs/decoration-finance/2026-06-24-phase4-cost-budget-profit-smoke.md`
- Create: `docs/decoration-finance/2026-06-24-phase4-cost-budget-profit-miniprogram-handoff.md`
- Modify: `docs/decoration-finance/README.md`

- [ ] **Step 1: API smoke**

Run with `18800005001 / 小龙女`:

```bash
POST /admin/auth/login
GET /finance/cost-categories?page=1&pageSize=20&status=active
PUT /projects/:projectId/cost-budgets
GET /projects/:projectId/cost-budgets
GET /finance/project-summary?keyword=:projectId
GET /projects/:projectId/finance-summary
```

Expected:

- active categories returned
- budget save returns updated rows
- project summary includes budget fields
- risk flags are correct

- [ ] **Step 2: Admin smoke**

Use Playwright:

- login Admin
- visit `/finance`
- verify budget columns render
- visit project overview
- verify cost budget panel renders
- edit one budget item
- verify summary refreshes
- ensure no console error and no 4xx/5xx

- [ ] **Step 3: Mini-program handoff**

Document:

- current mini-program can remain unchanged if it does not submit expense cost category
- if product wants cost classification at application time, add `GET /finance/cost-categories` and submit `cost_category_id`
- mini-program must not calculate profit or risk locally

- [ ] **Step 4: Final verification**

Run:

```bash
bun test ./src/services/finance-cost-categories.test.ts ./src/services/project-cost-budgets.test.ts ./src/services/finance-project-summary.test.ts ./src/services/expense-requests/legacy/payment.test.ts ./src/services/finance-ledger.test.ts
bun run typecheck
pnpm --dir apps/admin check
git diff --check
```

Expected: all pass.

- [ ] **Step 5: Commit docs**

```bash
git add docs/decoration-finance
git commit -m "docs(finance): 记录成本预算阶段验收"
```

## Rollback

If phase 4 must roll back before production use:

1. Revert application commits first.
2. Keep new nullable columns and tables in place if data has been written.
3. Hide Admin budget UI behind route/page removal or permission removal.
4. Do not delete historical cost category or budget data without an explicit data-retention decision.

If a destructive database rollback is required, create a new migration that:

- drops only empty phase 4 tables after verifying no rows exist,
- removes nullable columns only after confirming they are unused,
- preserves audit evidence in the smoke document.
