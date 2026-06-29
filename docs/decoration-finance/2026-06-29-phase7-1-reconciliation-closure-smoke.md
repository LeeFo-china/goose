# Phase 7.1 对账异常闭环验收记录

日期：2026-06-29

分支：`feat/finance-reconciliation-closure`

## 范围

本轮完成对账异常闭环动作能力：

- 新增 `finance_reconciliation_exception_actions` 审计动作表 migration。
- 新增 `finance.reconciliation.manage` 权限。
- 对账异常列表返回稳定 `exception_fingerprint`、`subject_type`、`subject_id`、处理状态和最近处理信息。
- 支持 `POST /finance/reconciliation/exceptions/:fingerprint/actions` 写入闭环动作。
- 支持按 `status` 和 `actor_employee_id` 筛选异常列表。
- 项目对账摘要新增 open/acknowledged/ignored/resolved 分桶和最近处理信息。
- Admin 对账异常页新增处理状态、处理人筛选、行内处理弹窗。
- Admin 项目详情对账摘要展示最近处理记录。

## 关键契约

- 闭环动作只写入 `finance_reconciliation_exception_actions`。
- 不修改 `payments`、`project_receivable_plans`、`project_receivable_allocations`、`finance_ledger_entries`。
- `exception_fingerprint` 由后端生成，格式为 `exception_code:subject_id`。
- 客户端提交 action 时必须 URL encode fingerprint。
- 处理人筛选在后端合并“每个异常最新动作”之后执行。

## 已验证

API：

```bash
bun test src/services/finance-reconciliation.test.ts
pnpm --dir apps/api check
```

结果：

- `financeReconciliationService` 9 个用例通过。
- API typecheck 通过。
- API build 通过。
- API file size check 通过。

Admin：

```bash
bun test components/finance/finance-reconciliation-utils.test.ts components/projects/project-finance-reconciliation-summary-utils.test.ts
pnpm --dir apps/admin check
```

结果：

- Admin helper 5 个用例通过。
- Admin file size check 通过。
- Admin typecheck 通过。

通用：

```bash
git diff --check
```

结果：通过。

## Migration 执行

时间：2026-06-29 15:08-15:12 Asia/Shanghai

执行对象：

- migration：`20260629143000_finance_reconciliation_exception_actions`
- 数据库：`.env.local` 中 `SUPABASE_DB_URL`
- 连接方式：`pg` 客户端，`ssl=false`

说明：

- 本机 `/opt/homebrew/bin/supabase` 和 `bunx supabase` 均命中 Bun JSON parse 异常。
- `pnpm dlx supabase migration list --db-url ...` 可运行，但当前 DB URL 与 Supabase CLI TLS 探测不匹配，返回 `server refused TLS connection`。
- 因 `.env.local` 的 `SUPABASE_DB_URL` 明确带 `sslmode=disable`，本轮改用 `pg` 连接执行 migration，并直接查询 `supabase_migrations.schema_migrations` 验证对齐。

执行前：

```json
{
  "local_count": 267,
  "remote_count": 266,
  "local_latest": "20260629143000",
  "remote_latest": "20260628110000",
  "target_remote_present": false,
  "missing_tail": ["20260629143000"]
}
```

执行结果：

```json
{
  "applied": true,
  "version": "20260629143000",
  "name": "finance_reconciliation_exception_actions"
}
```

执行后：

```json
{
  "local_count": 267,
  "remote_count": 267,
  "local_latest": "20260629143000",
  "remote_latest": "20260629143000",
  "target_remote_present": true,
  "missing_tail": []
}
```

对象核验：

```json
{
  "action_table": "finance_reconciliation_exception_actions",
  "latest_rpc": "list_latest_finance_reconciliation_exception_actions(uuid,text[])",
  "permission_exists": true
}
```

## 真实 Admin Smoke

时间：2026-06-29 15:18 Asia/Shanghai

临时服务：

- API：`http://127.0.0.1:3300`
- Admin：`http://127.0.0.1:3310`
- 均从 worktree `/Users/leefo/Public/work/gooes/.worktrees/finance-reconciliation-closure` 启动，未触碰 main 工作区服务。

登录账号：

- 手机号：`18800005001`
- 员工：小龙女
- employee ID：`bbab0193-43ae-4b7a-a7f3-24314e0f2e0d`
- 租户：固始晴天装饰工程有限公司
- 权限：已具备 `finance.reconciliation.manage`

执行链路：

1. `POST /api/auth/login` 通过 Admin 登录。
2. `GET /api/backend/admin/auth/me` 确认员工、租户和权限。
3. `GET /api/backend/finance/reconciliation/exceptions?page=1&pageSize=50&status=open` 返回 open 异常 `10` 条。
4. 选择异常并通过 Admin 代理提交：

```http
POST /api/backend/finance/reconciliation/exceptions/payment_unallocated%3A2595309b-662a-4a4c-972c-14bc2bc2be8f/actions
```

请求体：

```json
{
  "action": "acknowledge",
  "remark": "Phase 7.1 smoke acknowledge 2026-06-29T07:18:23.980Z"
}
```

样本异常：

```json
{
  "fingerprint": "payment_unallocated:2595309b-662a-4a4c-972c-14bc2bc2be8f",
  "exception_code": "payment_unallocated",
  "subject_type": "payment",
  "subject_id": "2595309b-662a-4a4c-972c-14bc2bc2be8f",
  "project_id": "fa32f6dd-b2d0-4efc-a810-347dfe90ec4c",
  "project_name": "郭富城 - 日出东方卓悦3期 1栋305设计项目",
  "level": "warning",
  "direction": "payment",
  "status_before": "open",
  "amount": 130000
}
```

动作写入结果：

```json
{
  "id": "248b8f09-5667-4988-bc6d-31219d5eed34",
  "action": "acknowledge",
  "actor_employee_id": "bbab0193-43ae-4b7a-a7f3-24314e0f2e0d",
  "actor_employee_name": "小龙女",
  "created_at": "2026-06-29T07:18:27.472824+00:00"
}
```

回查结果：

- `status=acknowledged&actor_employee_id=bbab0193-43ae-4b7a-a7f3-24314e0f2e0d` 能查到该异常。
- 回查状态：`acknowledged`
- 回查最近动作：`acknowledge`
- 项目对账摘要：
  - `open_exception_count = 1`
  - `acknowledged_exception_count = 1`
  - `latest_actor_employee_name = 小龙女`
  - `latest_action_remark = Phase 7.1 smoke acknowledge 2026-06-29T07:18:23.980Z`
- DB 中 `finance_reconciliation_exception_actions.id = 248b8f09-5667-4988-bc6d-31219d5eed34` 存在。
- Admin 页面 `/finance/reconciliation?status=acknowledged&actor_employee_id=bbab0193-43ae-4b7a-a7f3-24314e0f2e0d` 返回 `200`，页面包含“对账异常”和“已确认”，未出现后端未连接或应用错误提示。

## 原始数据不变性核验

对样本项目 `fa32f6dd-b2d0-4efc-a810-347dfe90ec4c`，动作写入前后项目维度源表统计一致。

写入前：

```json
[
  { "table": "payments", "count": 2, "sum_amount": "190000" },
  { "table": "project_receivable_plans", "count": 0, "sum_amount": "0", "sum_paid_amount": "0" },
  { "table": "project_receivable_allocations", "count": 0, "sum_amount": "0" },
  { "table": "finance_ledger_entries", "count": 2, "sum_amount": "190000.00" }
]
```

写入后：

```json
[
  { "table": "payments", "count": 2, "sum_amount": "190000" },
  { "table": "project_receivable_plans", "count": 0, "sum_amount": "0", "sum_paid_amount": "0" },
  { "table": "project_receivable_allocations", "count": 0, "sum_amount": "0" },
  { "table": "finance_ledger_entries", "count": 2, "sum_amount": "190000.00" }
]
```

结论：本次 `acknowledge` 只写入 `finance_reconciliation_exception_actions`，未修改 `payments`、`project_receivable_plans`、`project_receivable_allocations`、`finance_ledger_entries`。

## 验收结论

- migration 已应用到当前 dev 数据库，`schema_migrations` 与本地 migration 对齐。
- API/Admin 临时服务真实 smoke 通过。
- Admin 代理链路、后端权限、action 写入、状态回查、项目摘要和页面渲染均可用。
- 对账异常闭环动作仍是审计和人工标记，不自动修账。

## 风险与后续

- 如果生产角色中没有 `finance_base`，migration 只会给存在的 `system_admin` 和 `finance_base` 授权；缺失角色需要由租户管理员在角色权限页分配 `finance.reconciliation.manage`。
- 当前处理人筛选使用员工 ID 精确筛选；后续可独立优化为员工选择器。
- `resolved` 表示人工闭环已记录，不代表后端已经修复财务原始数据。
