# Finance Generated Ledger Audit Design

**Date:** 2026-06-30

## Goal

把 `POST /payments/:id/generate-ledger` 产生的补生成项目收款台账纳入
`GET /finance/correction-audits` 和 Admin `/finance/audits` 的统一只读修正审计。

## Current State

Phase 7.5 已经提供统一修正审计列表，覆盖：

- `manual_allocation`
- `adjust_allocation`
- `reverse_allocation`
- `link_ledger_payment`
- `mark_legacy_ledger`

代码里已经预留 `generate_payment_ledger` enum 和 Admin label，但 repository 只查询
`payment_linked_at` 和 `legacy_payment_ledger_marked_at` 两类 ledger 修正记录，没有查询
补生成台账记录。

`paymentService.generateProjectPaymentLedger()` 已经写入稳定 metadata：

```json
{
  "operation": "generate_missing_project_payment_ledger",
  "repair_reason": "修正原因",
  "repaired_by": "employee-id"
}
```

同时 ledger 自身已有 `id`、`tenant_id`、`project_id`、`payment_id`、`handled_by`、
`occurred_at`、`amount` 和 `metadata`，足以支撑第一版只读审计，不需要新增 migration。

## Design

### API

`financeCorrectionAuditRepository.listLedgerCorrectionAudits()` 新增第三类 ledger 查询：

- 来源：`finance_ledger_entries`
- 条件：
  - `tenant_id = auth tenant`
  - `entry_type = project_payment`
  - `metadata->>operation = generate_missing_project_payment_ledger`
- 排序：`occurred_at desc`
- actor：使用 `handled_by` 关联员工名称；补生成接口写入时 `handled_by` 和
  `metadata.repaired_by` 一致
- reason：`metadata.repair_reason`
- operation：统一映射为 `generate_payment_ledger`
- target：`/finance/ledger?ledger_id=<ledger_id>`

筛选规则：

- `operation=generate_payment_ledger` 只返回补生成台账审计。
- `project_id` 过滤 ledger `project_id`。
- `actor_employee_id` 过滤 ledger `handled_by`。
- `date_from/date_to` 过滤 ledger `occurred_at`。
- 不改变分页和 summary 结构，`ledger_repair` 包含补生成、关联收款、标记历史三类 ledger 修正。

### Admin

Admin `/finance/audits` 已能展示 `generate_payment_ledger` label，但筛选下拉缺少该选项。

本次只补：

- 修正类型下拉增加 `补生成收款台账`。
- 工具函数测试覆盖 label。

不新增页面、不新增写操作、不改变表格结构。

### Small Program Boundary

小程序无必改：

- 不调用 `/finance/correction-audits`。
- 不执行补生成台账。
- 不展示 Admin 修账审计。

## Verification

必须验证：

- API 单测覆盖补生成台账审计映射和 operation 筛选。
- Admin 单测覆盖修正类型 label。
- `apps/api` TypeScript 检查通过。
- `apps/admin` check 通过。
- `git diff --check` 通过。
