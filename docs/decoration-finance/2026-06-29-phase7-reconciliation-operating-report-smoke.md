# Phase 7 财务对账与运营报表 Smoke 记录

日期：2026-06-29

关联计划：

- [2026-06-28-phase7-finance-reconciliation-dashboard-plan.md](./2026-06-28-phase7-finance-reconciliation-dashboard-plan.md)
- [2026-06-29-phase7-task1-reconciliation-exceptions-handoff.md](./2026-06-29-phase7-task1-reconciliation-exceptions-handoff.md)

## 范围

本轮完成 Phase 7 Task 1-5 的只读验收：

1. 财务对账异常列表。
2. Admin 对账异常页。
3. 项目对账摘要。
4. 财务运营报表。
5. 发布前只读 smoke 和小程序交接说明。

本轮没有执行任何 workflow 推进、收款确认、费用审批、台账修正、应收调整或数据库手工修改。

## 临时服务

为避免影响 main 工作区服务，本轮在 worktree 中使用临时端口：

- API：`http://127.0.0.1:3001`
- Admin：`http://127.0.0.1:3011`
- Admin 指向 API：`GOOES_API_BASE_URL=http://127.0.0.1:3001`
- 登录账号：`18800005001 / 小龙女`
- 租户：`固始晴天装饰工程有限公司`

## API Smoke

### 登录

- `POST /admin/auth/login`：200
- `GET /admin/auth/me`：200
- employee：小龙女

### 对账异常列表

请求：

```http
GET /finance/reconciliation/exceptions?page=1&pageSize=5&date_from=2026-06-01&date_to=2026-06-29
```

结果：

- status：200
- pagination.pageSize：5
- pagination.total：10
- summary.total：10
- summary.warning：10
- summary.danger：0
- summary.info：0

分页上限验证：

```http
GET /finance/reconciliation/exceptions?page=1&pageSize=101&date_from=2026-06-01&date_to=2026-06-29
```

结果：

- status：400
- code：`VALIDATION_ERROR`
- message：`字段 [pageSize] 校验失败: 每页条数不能超过 100`

### 运营报表

请求：

```http
GET /finance/reports/operating?date_from=2026-06-01&date_to=2026-06-29&group_by=month
```

结果：

- status：200
- groups：1
- received_amount：446234.56
- expense_amount：1000
- actual_profit_amount：445234.56
- receivable_remaining_amount：3000
- overdue_amount：3000
- unallocated_expense_amount：1000
- scope.source_limit：10000
- scope.truncated：false

日期范围上限验证：

```http
GET /finance/reports/operating?date_from=2025-01-01&date_to=2026-06-29&group_by=month
```

结果：

- status：400
- code：`VALIDATION_ERROR`
- message：`报表日期范围不能超过 366 天`

### 项目对账摘要

请求：

```http
GET /finance/reconciliation/project/b95f6b51-6b9c-4970-948e-b369106545d8
```

结果：

- status：200
- project_id：`b95f6b51-6b9c-4970-948e-b369106545d8`
- received_amount：10000
- ledger_income_amount：10000
- exception_count：0

## Admin Smoke

使用 Playwright 登录 Admin 后只读访问：

| 页面 | 结果 |
| --- | --- |
| `/finance/reconciliation` | 200，页面包含“对账异常” |
| `/finance/reports` | 200，页面包含“运营报表” |
| `/projects/b95f6b51-6b9c-4970-948e-b369106545d8?tab=overview` | 200，页面包含“对账摘要”和“查看异常” |

浏览器 console：

- error count：0

## 验证命令

```bash
bun test ./src/services/finance-operating-report.test.ts ./src/services/finance-reconciliation.test.ts ./src/services/project-receivables.test.ts ./src/services/project-receivables-operations.test.ts ./src/services/finance-project-summary.test.ts ./src/services/finance-ledger.test.ts
bun run api:typecheck
pnpm --dir apps/admin run check
git diff --check
bun scripts/check-file-size.ts
```

结果：

- API 财务相关服务测试：31 pass
- API typecheck：通过
- Admin check：通过
- diff whitespace check：通过
- API/Admin file size check：通过

## 小程序交接口径

本阶段小程序无必改。

小程序继续保持：

- workflow 推进只消费 `workflow_state.actions`、`timeline_nodes[].actions` 和 `/workflow-tasks.actions`。
- 收款确认只调用 `POST /workflow-tasks/:taskId/complete`。
- 不调用 `/finance/reconciliation/*` 做任何写操作。
- 不本地计算利润、预算、逾期、对账异常或风险等级。
- 如后续需要项目经理侧展示对账摘要，应由后端另行提供员工侧只读字段，小程序只展示后端返回结果。

## 后续建议

1. 若需要“已处理/忽略异常”，再新增异常处理记录表，不要在当前只读计算结果上做前端本地状态。
2. 微信支付接入后，继续沿用本阶段的对账入口，补充 `payment_channel`、`external_trade_no`、`reconciliation_status` 等字段。
3. 报表如需导出，建议单独进入后续阶段，避免扩大 Phase 7 首版范围。
