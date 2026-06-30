# Phase 8 Task 1-5 财务报表与月度结账执行记录

日期：2026-06-30
工作区：`.worktrees/phase8-finance-reporting-closing`

## 范围

本次按 Phase 8 PRD 先执行 1-5 的基础闭环：

1. 修正并验证 Supabase migration 连接。
2. 完成 Task 0 基线核查。
3. 实现月度经营总览 API。
4. 实现 Admin 财务报表页月度总览和结账入口。
5. 实现月度结账快照基础闭环。

本次未做：

- CSV/XLSX 导出。
- 独立项目经营排行 API。
- 独立成本分类报表。
- 独立应收账龄报表。
- 小程序财务指标展示。

## Migration

### 连接口径

`.env.local` 中的 `POOLER_TENANT_ID=your-tenant-id` 是真实 Supabase Pooler tenant ID，不是占位符。

Supabase CLI 2.99.0 需要使用：

```bash
PGSSLMODE=disable supabase db push --db-url "${SUPABASE_DB_DIRECT_URL}?sslmode=disable"
```

### 已应用 migration

先补齐远端缺失的 Phase 7.9 migration：

```text
20260630190000_finance_reconciliation_expense_correction_actions.sql
```

再应用 Phase 8 migration：

```text
20260630210000_finance_closing_periods.sql
```

验证结果：

```text
20260630190000 | 20260630190000
20260630210000 | 20260630210000
```

## 后端变更

### 新增接口

```http
GET /finance/reports/monthly-overview?month=YYYY-MM
```

返回核心字段：

- `summary.income_amount`
- `summary.expense_amount`
- `summary.gross_profit_amount`
- `summary.gross_profit_rate`
- `summary.receivable_amount`
- `summary.received_amount`
- `summary.receivable_remaining_amount`
- `summary.overdue_receivable_amount`
- `summary.reconciliation_exception_count`
- `summary.unallocated_expense_amount`
- `closing.status`
- `closing.snapshot_summary`

```http
GET /finance/closing-periods?month=YYYY-MM&page=1&pageSize=5
POST /finance/closing-periods
POST /finance/closing-periods/:id/close
POST /finance/closing-periods/:id/reopen
```

结账规则：

- 生成草稿会固化当前月度总览 `scope + summary`。
- 已 `closed` 的月份不能被草稿静默覆盖。
- 确认结账时会重新读取实时月度总览并固化。
- 反结账必须填写原因，记录在 `reopen_reason`。

### 新增权限

- `finance.reports.read`
- `finance.reports.export`
- `finance.closing.read`
- `finance.closing.manage`

数据库 migration 已授予 `system_admin` 和 `finance_base`。

## Admin 变更

页面：

```text
/finance/reports
```

变更：

- 页面标题由“运营报表”调整为“财务报表”。
- 默认展示月度经营总览。
- 顶部指标改为：本月收入、本月支出、毛利/毛利率、未收/异常。
- 增加结账状态区：未结账、草稿、已结账、已反结账。
- 增加结账操作：生成草稿快照、确认结账、反结账。
- 原 operating 分组表保留为当前筛选范围明细聚合。

## 只读 Smoke

临时 API：

```text
http://127.0.0.1:3101
```

执行账号：

```text
18800005001 / 小龙女
role: finance_base
```

结果：

```text
POST /admin/auth/login -> 200
GET /finance/reports/monthly-overview?month=2026-06 -> 200
GET /finance/closing-periods?month=2026-06&page=1&pageSize=5 -> 200
```

月度总览样本：

```json
{
  "income_amount": 446271.35,
  "expense_amount": 1000,
  "gross_profit_amount": 445271.35,
  "gross_profit_rate": 0.9978,
  "receivable_amount": 33000,
  "received_amount": 446271.35,
  "receivable_remaining_amount": 3000,
  "overdue_receivable_amount": 3000,
  "reconciliation_exception_count": 12,
  "unallocated_expense_amount": 1000
}
```

当前 2026-06 无结账记录：

```json
{
  "closing": {
    "id": null,
    "status": "not_started"
  },
  "pagination": {
    "total": 0
  }
}
```

## 验证命令

```bash
bun test apps/admin/components/finance/finance-operating-report-utils.test.ts
cd apps/api && bun test src/schema/finance-closing.test.ts src/schema/finance-reports.test.ts src/services/finance-monthly-overview.test.ts src/services/finance-closing-periods.test.ts
cd packages/domain && bun test src/permission.test.ts
pnpm --dir apps/api check
pnpm --dir apps/admin check
git diff --check
```

结果均通过。

## 小程序边界

本次小程序无必改。

如果后续小程序需要展示项目经理只读经营摘要，应由后端提供授权后的只读字段；小程序不得本地计算利润、扫描台账、执行结账、反结账或导出。
