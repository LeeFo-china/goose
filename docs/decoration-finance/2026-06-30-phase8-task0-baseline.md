# Phase 8 Task 0 财务报表与结账基线核查

日期：2026-06-30
工作区：`.worktrees/phase8-finance-reporting-closing`

## 结论

Phase 8 可以在现有财务链路上继续推进，不需要重建财务 source of truth：

- 收入和支出以 `finance_ledger_entries` 为准。
- 应收以 `project_receivable_plans` 为准，核销以 `project_receivable_allocations` 为准。
- 成本分类以 `finance_ledger_entries.cost_category_id` 和 `project_cost_budgets` 为准。
- 对账异常仍以现有 `/finance/reconciliation/*` 计算和 action 记录为准。
- Admin 已有 `/finance/reports` 运营报表页，可在此页面扩展月度总览和结账，不另起一套孤立入口。

## Migration 基线

本次按 `.env.local` 中的真实 Supabase 连接信息执行核查。注意：`POOLER_TENANT_ID=your-tenant-id` 是当前环境真实租户 ID，不是占位符。

Supabase CLI 2.99.0 对本地连接需要同时满足：

- DB URL 带 `sslmode=disable`。
- 执行环境带 `PGSSLMODE=disable`。
- 使用显式 `--db-url`，不依赖当前 linked project 的旧连接信息。

核查命令模式：

```bash
PGSSLMODE=disable supabase migration list --db-url "${SUPABASE_DB_DIRECT_URL}?sslmode=disable"
```

执行前发现远端缺少：

```text
20260630190000_finance_reconciliation_expense_correction_actions.sql
```

已执行：

```bash
PGSSLMODE=disable supabase db push --db-url "${SUPABASE_DB_DIRECT_URL}?sslmode=disable"
```

验证结果：`20260630190000` 已显示为 `Local=20260630190000`、`Remote=20260630190000`。当前 Phase 8 开发可基于已闭合 migration 基线继续。

## 现有 API

### 已有报表接口

```http
GET /finance/reports/operating
```

现有能力：

- 按日期范围聚合收入、支出、实际利润、待收、逾期、未归集支出。
- 支持 `group_by=day|month|project|payment_type|cost_category`。
- 支持 `project_id`、`project_status` 筛选。
- 默认源数据上限 `10000`，日期范围最大 `366` 天。

局限：

- 不是明确的月度经营总览接口。
- 不返回毛利率。
- 不返回结账状态和结账快照。
- 不返回对账异常数量。

### 已有项目经营接口

```http
GET /finance/project-summary
```

现有能力：

- 后端分页。
- 按项目汇总收入、支出、预算、风险。
- 可作为后续项目经营排行 API 的基础，不应由 Admin 本地扫描报表数据拼排行。

### 已有对账接口

```http
GET /finance/reconciliation/exceptions
GET /finance/reconciliation/operating-stats
GET /finance/correction-audits
```

现有能力：

- 已覆盖对账异常、异常 action、运营统计和修正审计。
- Phase 8 月度总览第一版可统计当前范围内异常数量；后续可扩展到按月异常趋势。

## 现有 Admin 页面

```text
apps/admin/app/(console)/finance/reports/page.tsx
```

现状：

- 页面标题为“运营报表”。
- 已接入 `/finance/reports/operating`。
- 已有日期、分组、项目 ID、项目状态筛选。
- 已展示收入、支出、实际利润、待收/逾期、未归集支出。

Phase 8 Admin 改造方向：

- 在现有页面接入 `monthly-overview`，默认用月份作为主筛选。
- 保留 operating 分组表作为明细聚合。
- 增加结账状态、快照摘要和结账操作区。
- 不在 Admin 本地推导收入、利润、逾期和异常口径。

## 索引核查

### `finance_ledger_entries`

已存在：

- `finance_ledger_entries_tenant_occurred_idx`：`(tenant_id, occurred_at DESC)`。
- `finance_ledger_entries_project_occurred_idx`：`(project_id, occurred_at DESC)`。
- `finance_ledger_entries_tenant_type_occurred_idx`：`(tenant_id, entry_type, occurred_at DESC)`。
- `finance_ledger_entries_cost_category_idx`：`(tenant_id, cost_category_id, occurred_at DESC)`，仅 `cost_category_id IS NOT NULL`。

结论：支持 Phase 8 第一版按租户、日期、类型、项目和成本分类聚合。

### `project_receivable_plans`

已存在：

- `project_receivable_plans_tenant_status_due_idx`：`(tenant_id, status, due_date)`。
- `project_receivable_plans_project_due_idx`：`(project_id, due_date)`。
- `project_receivable_plans_tenant_type_due_idx`：`(tenant_id, payment_type, due_date)`。
- `project_receivable_plans_tenant_owner_due_idx`：`(tenant_id, owner_employee_id, due_date)`。

结论：支持 Phase 8 第一版按租户、到期日、状态和回款类型统计应收与逾期。

### `project_receivable_allocations`

已存在：

- `project_receivable_allocations_tenant_allocated_idx`：`(tenant_id, allocated_at DESC)`。
- `project_receivable_allocations_project_active_idx`：`(tenant_id, project_id, allocated_at DESC)`，仅 active allocation。
- `project_receivable_allocations_active_plan_idx` / `active_payment_idx`。

结论：支持核销记录追溯；月度总览第一版仍优先使用 receivable plan 的 `paid_amount` 和 ledger 收入，不重复按 allocation 计算收入。

### `project_cost_budgets`

已存在：

- `project_cost_budgets_active_category_uidx`：`(tenant_id, project_id, cost_category_id)`，仅 active。
- `project_cost_budgets_project_status_idx`：`(project_id, status)`。
- `project_cost_budgets_tenant_project_idx`：`(tenant_id, project_id)`。

结论：支持后续预算偏差和项目排行；月度总览第一版可先返回未归集支出，预算偏差沿用项目汇总/风险计算继续迭代。

## 权限核查

已有财务权限：

- `finance.view`
- `finance.ledger.view`
- `finance.receivable.view`
- `finance.receivable.manage`
- `finance.budget.view`
- `finance.budget.manage`
- `finance.cost-category.view`
- `finance.cost-category.manage`
- `finance.cost-allocation.manage`
- `finance.reconciliation.manage`
- `finance.dashboard.view`

Phase 8 需要新增权限：

- `finance.reports.read`
- `finance.reports.export`
- `finance.closing.read`
- `finance.closing.manage`

兼容策略：

- 新报表读取优先判断 `finance.reports.read`。
- 过渡期可继续允许 `finance.view`、`finance.ledger.view`、`finance.dashboard.view` 读取报表，避免发布后已有财务账号突然不可见。
- 结账写操作必须要求 `finance.closing.manage`，不复用宽泛的 `finance.view`。

## Phase 8 Task 1-5 实施边界

本轮先做：

1. `GET /finance/reports/monthly-overview?month=YYYY-MM`。
2. Admin 财务报表页展示月度经营总览和结账状态。
3. `finance_closing_periods` migration。
4. 结账快照基础 API：查看当前月份结账状态、生成/关闭快照、反结账。
5. 受控 smoke 和文档回填。

本轮不做：

- CSV/XLSX 导出。
- 完整项目排行新接口。
- 成本分类独立报表和应收账龄独立页面。
- 小程序财务指标计算。
