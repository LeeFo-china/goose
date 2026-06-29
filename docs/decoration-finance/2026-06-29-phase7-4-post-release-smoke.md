# Phase 7.4 人工核销发布后 Smoke

日期：2026-06-29

分支：`main`

提交：

- `b1c7538c merge: finance manual allocation`

## 范围

本记录覆盖 Phase 7.4 人工收款核销入口合入 `main` 后的发布后核验：

- main API/Admin 服务重启后核验。
- Supabase migration list 正式验证口径。
- API 只读复查人工核销样本。
- Admin 应收页和 backend proxy 只读复查。

本轮不再次执行人工核销写操作，不重复创建 receivable、allocation 或 event。

## 服务状态

launchctl 服务：

- API：`local.gooes.api`
- Admin：`local.gooes.admin`

端口：

- API：`http://127.0.0.1:3000`
- Admin：`http://127.0.0.1:3010`

处理记录：

- API 已通过 `launchctl kickstart -k gui/$(id -u)/local.gooes.api` 重启。
- Admin 3010 曾被旧 `next dev -p 3010` 进程占用，导致 launchctl 新进程反复报 `EADDRINUSE`。
- 已终止旧父进程后重新 `kickstart`，Admin 由 `local.gooes.admin` 正常接管。

## Migration 验证

根因：

- linked project 仍指向 Supabase 托管域名 `db.fclnkyatvfvmzgzdqlba.supabase.co`，当前 `SUPABASE_DB_PASSWORD` 对该 linked project 不匹配。
- 自建测试库 `api-dev.goodcms.cn` 不接受 TLS。
- Supabase CLI 2.99.0 仅依赖 URL query `sslmode=disable` 时仍会尝试 TLS。
- 使用 pooler 6543 时，增加 `PGSSLMODE=disable` 可以连通，但 `supabase migration list` 会触发 pooler prepared statement 冲突：`prepared statement "lrupsc_1_0" already exists`。

可用命令口径：

```bash
PGSSLMODE=disable supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL_WITH_SSLMODE_DISABLE"
```

其中 `SUPABASE_DB_DIRECT_URL_WITH_SSLMODE_DISABLE` 为 `.env.local` 的 `SUPABASE_DB_DIRECT_URL` 追加：

```text
?sslmode=disable
```

验证结果：

- exit code：`0`
- migration row count：`268`
- 最近 migration 对齐：

```text
20260625143000 | 20260625143000 | 2026-06-25 14:30:00
20260625150000 | 20260625150000 | 2026-06-25 15:00:00
20260625154500 | 20260625154500 | 2026-06-25 15:45:00
20260626112000 | 20260626112000 | 2026-06-26 11:20:00
20260627133000 | 20260627133000 | 2026-06-27 13:30:00
20260628110000 | 20260628110000 | 2026-06-28 11:00:00
20260629143000 | 20260629143000 | 2026-06-29 14:30:00
20260629193000 | 20260629193000 | 2026-06-29 19:30:00
```

结论：

- `20260629193000_receivable_manual_allocation_reversal.sql` 已在 Local/Remote migration list 中对齐。
- 后续正式 migration 验证建议优先使用 direct 5432，并显式设置 `PGSSLMODE=disable`。

## API 只读 Smoke

执行账号：

- 账号：`18800005001`
- 员工：小龙女
- employee ID：`bbab0193-43ae-4b7a-a7f3-24314e0f2e0d`
- tenant ID：`3eebca47-961f-4899-b976-a3d3208d326b`

样本：

- project ID：`d382cd45-9141-476e-a7a5-5bf88d0a3255`
- receivable plan ID：`ab6b42e0-6d99-4bdf-9f64-a42d93d5ee83`
- payment ID：`5859aec7-a8a8-474b-83d8-ba420bf1555d`

接口结果：

- `POST /admin/auth/login`：`200`
- `GET /admin/auth/me`：`200`
- `GET /finance/receivables?page=1&pageSize=20&project_id=:projectId`：`200`
- `GET /finance/receivables/:planId/allocation-context`：`200`
- `GET /finance/receivables/:planId/events?page=1&pageSize=20`：`200`
- `GET /finance/reconciliation/exceptions?page=1&pageSize=100&status=open&exception_code=payment_unallocated`：`200`

当前应收状态：

- title：`Phase 7.4 人工核销 smoke 应收`
- status：`paid`
- amount：`10000`
- paid_amount：`10000`
- remaining_amount：`0`

核销状态：

- allocation count：`1`
- active allocation ID：`4c7a828f-f650-41bb-baf7-4e5fb6a42e29`
- payment candidate count：`1`

事件追溯：

- `allocate_payment`
- `reverse_allocation`
- `adjust_allocation`
- `allocate_payment`
- `manual_created`

对账异常复查：

- open `payment_unallocated` total：`7`
- 目标 payment `5859aec7-a8a8-474b-83d8-ba420bf1555d` 在 open `payment_unallocated` 中出现次数：`0`

## Admin 只读 Smoke

接口和页面：

- `POST /api/auth/login`：`200`
- `GET /finance/receivables?project_id=d382cd45-9141-476e-a7a5-5bf88d0a3255`：`200`
- `GET /api/backend/finance/receivables/ab6b42e0-6d99-4bdf-9f64-a42d93d5ee83/allocation-context`：`200`

页面核验：

- 页面包含 `Phase 7.4 人工核销 smoke 应收`。
- 页面包含“核销”操作入口。
- 页面未出现 `Application error`。
- 页面未出现 `后端服务未连接`。

proxy 结果：

- `allocations.length = 1`
- `payments.length = 1`

## 结论

Phase 7.4 人工收款核销入口合入 `main` 后发布后 smoke 通过：

- main API/Admin 服务可用。
- migration list 已通过 direct DB URL + `PGSSLMODE=disable` 验证 Local/Remote 对齐。
- 人工核销样本在 API 和 Admin 均可见。
- 目标 `payment_unallocated` 异常已消失。
- 小程序仍无必改，不提供财务修账入口。

## 后续

按 Phase 7.4 原计划继续：

1. Task 1：应收逾期处理增强，覆盖 `receivable_overdue`。
2. Task 3：补生成项目收款台账，覆盖 `payment_without_ledger`。
3. Task 4：历史台账关联与标记，覆盖 `ledger_without_payment`。
4. Task 5：对账异常详情抽屉。
