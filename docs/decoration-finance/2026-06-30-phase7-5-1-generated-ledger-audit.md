# Phase 7.5.1 补生成台账审计闭环

日期：2026-06-30

## 目标

把 Phase 7.4 已上线的“缺失项目收款台账补生成”纳入 Phase 7.5 统一修正审计视图。

补生成入口仍是：

```text
POST /payments/:id/generate-ledger
```

审计读取入口仍是：

```text
GET /finance/correction-audits
```

## 本次补齐内容

新增审计 operation：

```text
generate_payment_ledger
```

业务含义：财务人员对 confirmed project payment 补生成 `project_payment` 入账流水。

审计来源：

- `finance_ledger_entries.entry_type = project_payment`
- `finance_ledger_entries.metadata.operation = generate_missing_project_payment_ledger`

审计展示字段：

- 操作类型：补生成收款台账
- 操作人：ledger `handled_by`
- 操作时间：ledger `occurred_at`
- 原因：ledger `metadata.repair_reason`
- payment ID：ledger `payment_id`
- ledger ID：ledger `id`
- 项目：ledger `project_id` / project name
- 跳转：`/finance/ledger?ledger_id=<ledger_id>`

## 为什么不新增 migration

`paymentService.generateProjectPaymentLedger()` 已稳定写入：

```json
{
  "operation": "generate_missing_project_payment_ledger",
  "repair_reason": "修正原因",
  "repaired_by": "employee-id"
}
```

同时 `finance_ledger_entries` 已有：

- `handled_by`
- `occurred_at`
- `payment_id`
- `project_id`
- `amount`

这些字段足够支撑只读审计追溯。本次不新增数据库字段、不新增表、不改变补生成写接口。

## API 行为

`GET /finance/correction-audits` 现在覆盖六类记录：

- `manual_allocation`
- `adjust_allocation`
- `reverse_allocation`
- `generate_payment_ledger`
- `link_ledger_payment`
- `mark_legacy_ledger`

筛选行为：

- `operation=generate_payment_ledger` 只返回补生成台账审计。
- `project_id` 按 ledger 项目过滤。
- `actor_employee_id` 按 ledger `handled_by` 过滤。
- `date_from/date_to` 按 ledger `occurred_at` 过滤。
- `summary.ledger_repair` 统计补生成、关联收款、标记历史三类台账修正。

## Admin 行为

Admin `/finance/audits` 修正类型筛选新增：

```text
补生成收款台账
```

表格仍为只读，不提供写操作。点击目标仍跳转到财务台账详情。

## 小程序边界

小程序无必改。

小程序继续保持：

- 不调用 `/finance/correction-audits`。
- 不执行 `/payments/:id/generate-ledger`。
- 不展示或操作 Admin 财务修正审计。

## 验证命令

```bash
cd apps/api
bun test src/services/finance-correction-audits.test.ts
pnpm exec tsc -p tsconfig.json --noEmit

cd ../admin
bun test components/finance/finance-correction-audit-utils.test.ts components/finance/finance-module-tabs.test.ts
pnpm run check

cd ../..
git diff --check
```

## Worktree API Smoke

临时服务：

- API：`http://127.0.0.1:3101`
- env：只读加载 `/Users/leefo/Public/work/gooes/apps/api/.env`
- 未影响 main 的 launchctl `local.gooes.api` 3000 服务

只读验证结果：

1. `GET /finance/correction-audits?page=1&pageSize=20`
   - HTTP `200`
   - `pagination.total=7`
   - `summary.ledger_repair=3`
   - `summary.receivable_allocation=4`
   - 返回操作包含 `generate_payment_ledger`
2. `GET /finance/correction-audits?page=1&pageSize=5&operation=generate_payment_ledger`
   - HTTP `200`
   - `pagination.total=1`
   - `summary.ledger_repair=1`
   - 返回记录 operation 全部为 `generate_payment_ledger`
   - 首条记录：
     - `operation_label=补生成收款台账`
     - `domain=ledger`
     - `actor_employee_name=风清扬`
     - `payment_id=b1a5f030-1600-4410-bfd2-43ba44091d69`
     - `ledger_id=4775f25e-20ed-4c07-86f7-50e5b3c11d6d`
     - `target.href=/finance/ledger?ledger_id=4775f25e-20ed-4c07-86f7-50e5b3c11d6d`

本次 smoke 未执行任何写操作。
