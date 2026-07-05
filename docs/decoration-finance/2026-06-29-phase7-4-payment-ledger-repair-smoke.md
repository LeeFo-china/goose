# Phase 7.4 收款台账补生成实施与 Smoke 记录

日期：2026-06-29

分支：`feat/finance-payment-ledger-repair`

## 范围

本轮实现 Phase 7.4 Task 3：`payment_without_ledger` 异常的单据级人工修正入口。

能力：

- 对账异常 `payment_without_ledger` 的 `action.target` 精确到 `payment_id`。
- 财务台账页支持按 `payment_id` 筛选。
- 当台账页带 `payment_id` 且无项目收款流水时，Admin 展示“补生成项目收款台账”入口。
- 后端新增 `POST /payments/:id/generate-ledger`。
- 仅允许已确认收款补生成 `project_payment` 入账流水。
- 同一租户、同一 `payment_id` 已存在项目收款流水时返回 409 防重。

非目标：

- 不自动修复历史异常。
- 不绕过收款确认或对账异常重算。
- 小程序不新增财务修账入口。

## Migration

新增 migration：

- `20260629233000_finance_payment_ledger_repair.sql`

内容：

- 为 `finance_ledger_entries` 增加部分索引：
  `tenant_id, payment_id, occurred_at DESC`
- 条件：
  `payment_id IS NOT NULL AND entry_type = 'project_payment'`

应用记录：

- `supabase db push` 通过 `SUPABASE_DB_URL` 执行。
- 由于当前连接走 pooler，需设置：
  - `PGSSLMODE=disable`
  - `statement_cache_capacity=0`
  - `description_cache_capacity=0`

验证结果：

```text
20260629233000 | 20260629233000 | 2026-06-29 23:30:00
```

## API Smoke

临时服务：

- worktree API：`http://127.0.0.1:3100`
- 未操作 main 工作区 API/Admin 服务。

执行账号：

- 账号：`18800000001`
- 员工：风清扬
- employee ID：`d8ecc522-e6a1-49d6-b7b7-aaa0f3084826`

测试项目：

- project ID：`b95f6b51-6b9c-4970-948e-b369106545d8`
- 项目：`应收小程序联调 Smoke项目 20260623125051`

写入样本：

- payment ID：`b1a5f030-1600-4410-bfd2-43ba44091d69`
- amount：`1`
- status：`confirmed`
- remark：`phase7.4 payment ledger repair smoke`

执行链路：

1. `POST /admin/auth/login`
   - 返回：`200`
2. `GET /projects/status?page=1&pageSize=5`
   - 返回：`200`
3. `POST /payments`
   - 返回：`200`
   - 创建 confirmed payment：`b1a5f030-1600-4410-bfd2-43ba44091d69`
4. `GET /finance/reconciliation/exceptions?page=1&pageSize=20&exception_code=payment_without_ledger`
   - 返回：`200`
   - 目标异常 action：
     `/finance/ledger?project_id=b95f6b51-6b9c-4970-948e-b369106545d8&direction=in&entry_type=project_payment&payment_id=b1a5f030-1600-4410-bfd2-43ba44091d69`
5. `POST /payments/b1a5f030-1600-4410-bfd2-43ba44091d69/generate-ledger`
   - body：
     ```json
     {
       "reason": "phase7.4 smoke: confirmed payment missing ledger repair"
     }
     ```
   - 返回：`200`
   - ledger ID：`4775f25e-20ed-4c07-86f7-50e5b3c11d6d`
   - ledger.payment_id：`b1a5f030-1600-4410-bfd2-43ba44091d69`
   - ledger.entry_type：`project_payment`
6. `GET /finance/ledger?page=1&pageSize=5&payment_id=b1a5f030-1600-4410-bfd2-43ba44091d69&direction=in&entry_type=project_payment`
   - 返回：`200`
   - total：`1`
7. 重复执行 `POST /payments/:id/generate-ledger`
   - 返回：`409`
   - code：`PAYMENT_LEDGER_ALREADY_EXISTS`

## Admin 对接

Admin 本轮改动：

- `/finance/ledger` 支持保留和透传 `payment_id`。
- 对账异常跳转到 ledger 页后，如当前 `payment_id` 无流水，展示“补生成台账”操作面板。
- 面板要求填写修正原因。
- 成功后刷新台账页。
- 正常已有台账时不展示补生成入口。

## 小程序边界

小程序本阶段无必改：

- 不调用 `/payments/:id/generate-ledger`。
- 不执行补台账、历史流水关联或异常处理写操作。
- 如果未来需要只读展示，仍应由后端返回项目财务摘要，不在小程序本地计算异常。

## 验证命令

```bash
bun test src/services/payments.test.ts src/services/finance-reconciliation.test.ts src/services/finance-reconciliation-action-targets.test.ts
bun test apps/admin/components/finance/finance-ledger-query-utils.test.ts
bun run api:typecheck
pnpm --dir apps/admin check
bun run api:check-file-size
git diff --check
```

验证结果：

- API 目标单测：`18 pass`
- Admin query 单测：`2 pass`
- API typecheck：通过
- Admin check：通过
- API file size check：通过
- `git diff --check`：通过

## 结论

Phase 7.4 Task 3 已完成实现和 worktree smoke：

- `payment_without_ledger` 已能精确引导到具体收款。
- Admin 财务台账页承接补生成入口。
- 后端补生成接口具备权限校验、状态校验、防重和原因记录。
- 真实 smoke 验证了成功补生成、台账可查、重复操作 409 防重。

后续继续 Phase 7.4：

1. Task 4：历史台账关联与标记，覆盖 `ledger_without_payment`。
2. Task 5：对账异常详情抽屉。

