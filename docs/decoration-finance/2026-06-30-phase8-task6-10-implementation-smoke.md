# Phase 8 Task 6-10 财务报表与结账后半段执行记录

日期：2026-06-30
工作分支：`feat/phase8-reporting-export-closure`
工作目录：`.worktrees/phase8-reporting-export-closure`

## 范围

本轮承接 Phase 8 Task 6-10，目标是补齐财务报表后半段：

1. 结账写操作受控 smoke。
2. 月度经营总览 CSV 导出。
3. 项目经营排行。
4. 成本分类报表。
5. 应收账龄报表。
6. Admin 财务报表页承载专项报表。
7. 小程序边界说明。

本轮没有新增 migration。

## 业务口径

结账不是硬锁账。

```text
closed 后不阻止业务单据修正；
报表展示实时数据和结账快照状态；
反结账必须有权限和原因；
所有写操作均走后端接口留痕；
Admin 和小程序不得本地计算财务报表。
```

## API 实现

新增接口：

```http
GET /finance/reports/monthly-overview/export?month=YYYY-MM&format=csv
GET /finance/reports/project-ranking?month=YYYY-MM&page=1&pageSize=20
GET /finance/reports/cost-category-summary?month=YYYY-MM&page=1&pageSize=20
GET /finance/reports/receivable-aging?as_of=YYYY-MM-DD&page=1&pageSize=20
```

接口约束：

- 所有列表接口分页，`pageSize` 最大 `100`。
- 源数据读取使用 `SOURCE_LIMIT=10000`，避免无限制扫描。
- 专项报表排序和筛选由后端完成。
- CSV 导出需要 `finance.reports.export` 权限。
- 专项报表读取需要 `finance.reports.read` 相关权限。

## Admin 实现

页面：

```text
/finance/reports
```

新增内容：

- 导出 CSV 按钮。
- 报表内 tabs：
  - 运营报表
  - 项目排行
  - 成本分类
  - 应收账龄

Admin 只渲染后端结果：

- 不本地计算毛利、账龄、未归集或异常数量。
- 不从台账列表本地拼专项报表。
- 导出链接直接指向后端导出接口。

## API Smoke

临时 API：

```text
http://127.0.0.1:3102
```

执行账号：

```text
18800005001 / 小龙女
租户：固始晴天装饰工程有限公司
```

只读接口：

```text
POST /admin/auth/login -> 200
GET /admin/auth/me -> 200
GET /finance/reports/monthly-overview?month=2026-06 -> 200
GET /finance/reports/project-ranking?month=2026-06&page=1&pageSize=5 -> 200
GET /finance/reports/cost-category-summary?month=2026-06&page=1&pageSize=5 -> 200
GET /finance/reports/receivable-aging?as_of=2026-06-30&page=1&pageSize=5 -> 200
GET /finance/reports/monthly-overview/export?month=2026-06&format=csv -> 200
```

核心结果：

```json
{
  "monthly": {
    "closing_status": "not_started",
    "income_amount": 446271.35
  },
  "project_ranking": {
    "count": 5,
    "total": 9,
    "first_project": "郭富城 - 日出东方卓悦3期 1栋305设计项目"
  },
  "cost_category_summary": {
    "count": 1,
    "total": 1,
    "expense_amount": 1000
  },
  "receivable_aging": {
    "count": 1,
    "total": 1
  },
  "csv": {
    "content_type": "text/csv; charset=utf-8",
    "content_disposition": "attachment; filename=\"finance-monthly-overview-2026-06.csv\"",
    "bytes": 230,
    "first_line": "月份,结账状态,本月收入,本月支出,毛利,毛利率,应收总额,已收总额,未收总额,逾期应收,对账异常数,未归集支出"
  }
}
```

## 结账受控写 Smoke

为了避免污染真实经营月份，本轮选择不存在的远未来月份：

```text
month: 2099-12
period_id: 74a1cba8-b244-41f1-b976-363d82a25736
```

执行链路：

```text
POST /finance/closing-periods -> draft
POST /finance/closing-periods/:id/close -> closed
POST /finance/closing-periods/:id/reopen reason="" -> rejected
POST /finance/closing-periods/:id/reopen reason="Phase 8 controlled smoke reopen reason" -> reopened
GET /finance/reports/monthly-overview?month=2099-12 -> closing.status=reopened
```

结果：

```json
{
  "month": "2099-12",
  "period_id": "74a1cba8-b244-41f1-b976-363d82a25736",
  "created_status": "draft",
  "closed_status": "closed",
  "reopen_without_reason_rejected": true,
  "reopened_status": "reopened",
  "overview_closing_status": "reopened"
}
```

本轮写 smoke 没有修改：

- 收款。
- 费用。
- 财务台账。
- 对账异常。
- workflow。
- 项目状态。

## Admin Smoke

临时 Admin：

```text
http://localhost:3112
```

Admin 指向临时 API：

```text
GOOES_API_BASE_URL=http://127.0.0.1:3102
NEXT_PUBLIC_GOOES_API_BASE_URL=http://127.0.0.1:3102
```

页面：

```text
/finance/reports?month=2026-06
```

验证：

- 可登录后台。
- 可见页面标题“财务报表”。
- 可见导出 CSV 链接。
- 可见报表内 tabs：运营报表、项目排行、成本分类、应收账龄。
- 项目排行 tab 可见“收入”“毛利率”。
- 成本分类 tab 可见“成本分类”“占比”。
- 应收账龄 tab 可见“逾期 8-30 天”“未收”。
- `http_errors=[]`。
- `console_errors=[]`。

截图：

```text
/tmp/gooes-phase8-finance-reports-smoke.png
```

## 验证命令

已执行：

```bash
cd apps/api && bun test src/schema/finance-reports.test.ts src/services/finance-specialized-reports.test.ts src/schema/finance-closing.test.ts src/services/finance-monthly-overview.test.ts src/services/finance-closing-periods.test.ts
pnpm --dir apps/api check
bun test apps/admin/components/finance/finance-operating-report-utils.test.ts
pnpm --dir apps/admin check
```

最终提交前仍需重新执行完整验证。

## 小程序边界

本轮小程序无必改。

小程序不接入：

- 月度结账。
- 反结账。
- 财务报表导出。
- 项目排行。
- 成本分类报表。
- 应收账龄报表。
- 财务利润或账龄本地计算。

如果后续需要在小程序提示财务结账状态，必须由后端返回只读字段，小程序只展示，不推导。

## 后续

建议后续继续补：

1. `monthly-overview` 的快照摘要和实时差异字段。
2. 结账记录与修正审计的关联跳转。
3. CSV 导出扩展为 XLSX。
4. 专项报表 drill-down 到项目、应收计划、台账和对账异常详情。
