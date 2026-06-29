# Phase 7 发布后 Smoke 与对接回执

日期：2026-06-29

关联提交：

- `74ad7672 merge: finance phase7 reconciliation`

关联文档：

- [2026-06-28-phase7-finance-reconciliation-dashboard-plan.md](./2026-06-28-phase7-finance-reconciliation-dashboard-plan.md)
- [2026-06-29-phase7-reconciliation-operating-report-smoke.md](./2026-06-29-phase7-reconciliation-operating-report-smoke.md)

## 发布状态

- main 已推送到远端 `origin/main`。
- API/Admin 已通过 `launchctl` 重启正式服务。
- API：`http://127.0.0.1:3000`
- Admin：`http://127.0.0.1:3010`
- 登录账号：`18800005001 / 小龙女`
- 租户：`固始晴天装饰工程有限公司`

本次发布后 smoke 只读执行，没有进行 workflow 推进、收款确认、费用审批、台账修正、应收调整或数据库手工修改。

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

Playwright 登录 Admin 后只读访问：

| 页面 | 结果 |
| --- | --- |
| `/finance/reconciliation` | 200，页面包含“对账异常” |
| `/finance/reports` | 200，页面包含“运营报表” |
| `/projects/b95f6b51-6b9c-4970-948e-b369106545d8?tab=overview` | 200，页面包含“对账摘要” |

浏览器 console：

- error count：0

## Admin 同步口径

可同步给 Admin/后端同学：

```text
Phase 7 财务对账与运营报表已合并 main 并发布到本地正式服务。

本次新增：
1. 财务对账异常页：/finance/reconciliation
2. 财务运营报表页：/finance/reports
3. 项目详情总览页的对账摘要：/projects/:id?tab=overview

发布后只读 smoke 已通过：
- /finance/reconciliation 200，可见“对账异常”
- /finance/reports 200，可见“运营报表”
- 项目详情总览 200，可见“对账摘要”
- API 对账异常分页、pageSize<=100 guard、运营报表日期范围 guard、项目对账摘要均正常
- 浏览器 console error 为 0

本阶段能力定位是只读对账和运营分析：
- 不做异常处理/忽略闭环
- 不做自动修账
- 不调整 workflow 推进规则
- 不手工修改数据库

后续如要做异常处理闭环，会进入 Phase 7.1 单独设计处理记录表、权限、审计和 Admin 操作入口。
```

## 小程序同步口径

可同步给小程序团队：

```text
Phase 7 财务对账与运营报表已经发布并完成只读 smoke。本阶段 orange 无必改。

小程序继续保持当前契约：
1. workflow 推进只消费 workflow_state.actions、timeline_nodes[].actions 和 /workflow-tasks.actions。
2. 收款确认仍只调用 POST /workflow-tasks/:taskId/complete。
3. 不调用 /finance/reconciliation/* 做任何写操作。
4. 不在小程序本地计算利润、预算、逾期、对账异常或风险等级。
5. 如果后续需要项目经理侧展示财务对账摘要，请等后端另行提供员工侧只读字段，小程序只做展示，不推导规则。

本次后端/Admin 新增的是管理端只读能力：
- /finance/reconciliation 对账异常页
- /finance/reports 运营报表页
- 项目详情总览里的对账摘要

当前无需改代码，也不需要重新执行收款 complete smoke。
```

## 观察点

- 对账异常列表是否存在大量历史人工流水导致的 `ledger_without_payment`。
- 运营报表金额是否符合财务人员口径，尤其是未归集支出和逾期应收。
- 项目详情对账摘要是否能帮助定位收款、核销、入账三者不一致。
- 后续是否需要异常“已处理/忽略/备注”闭环。
