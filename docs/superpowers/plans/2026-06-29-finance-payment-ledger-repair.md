# Phase 7.4 Task 3: 补生成项目收款台账

## 目标

为 `payment_without_ledger` 异常提供受控修正能力：财务人员在 Admin 异常入口进入项目收款台账页后，可以对已确认但缺少 `project_payment` 台账的收款记录补生成台账。修正必须可追溯、幂等防重，并继续以 workflow/finance runtime 数据为准。

## 执行状态

- 状态：已完成
- Smoke 记录：[2026-06-29-phase7-4-payment-ledger-repair-smoke.md](../../decoration-finance/2026-06-29-phase7-4-payment-ledger-repair-smoke.md)
- 真实 smoke：
  - payment ID：`b1a5f030-1600-4410-bfd2-43ba44091d69`
  - ledger ID：`4775f25e-20ed-4c07-86f7-50e5b3c11d6d`
  - 防重结果：重复补生成返回 `409 PAYMENT_LEDGER_ALREADY_EXISTS`

## 约束

- 只处理 `payment.status=confirmed` 的项目收款。
- 同一租户、同一 `payment_id` 已存在 `entry_type=project_payment` 台账时禁止重复生成。
- 操作权限使用现有 `finance.payment.confirm`，避免新增权限迁移。
- 补生成结果写入 `finance_ledger_entries`，并在 `metadata` 中记录 `operation=generate_missing_project_payment_ledger`、原因、操作者、收款来源。
- 不新增小程序入口；小程序无必改。
- 所有新增列表过滤必须分页、限定字段，并为 `payment_id` 查询补索引。

## 实施步骤

1. 测试先行
   - 新增 `PaymentService.generateProjectPaymentLedger` 单测：
     - 已确认收款且无台账时成功生成。
     - 未确认收款返回 409。
     - 已有项目收款台账返回 409。
     - 缺少 `finance.payment.confirm` 返回 403。
   - 更新 reconciliation 异常 action 测试，要求 `payment_without_ledger` 目标链接携带 `payment_id`。

2. API
   - 在 payment schema 增加补生成 body：
     ```ts
     {
       reason: string
     }
     ```
   - 在 `FinanceLedgerRepository` 增加：
     - `findProjectPaymentByPaymentId({ tenantId, paymentId })`
     - `list()` 支持 `payment_id` 过滤
   - 在 `PaymentService` 增加补生成方法：
     - 校验租户上下文和 `finance.payment.confirm`
     - 读取收款和项目租户
     - 校验 `confirmed`
     - 校验未存在项目收款台账
     - 复用 workflow bridge 的 ledger source 规则：
       - 优先 `payment.source_type/source_id`
       - 否则 `source_type=payment`、`source_id=payment.id`
     - 创建 `project_payment` 入账流水
   - 在 payment controller 暴露：
     `POST /payments/:id/generate-ledger`

3. Migration
   - 新增 `finance_ledger_entries` 按租户和 `payment_id` 查询的部分索引：
     - `tenant_id`
     - `payment_id`
     - `occurred_at DESC`
     - `WHERE payment_id IS NOT NULL AND entry_type = 'project_payment'`

4. Admin
   - `/finance/ledger` 支持 `payment_id` 查询参数。
   - `fetchFinanceLedger()` 透传 `payment_id`。
   - 当 URL 带 `payment_id` 且当前筛选无台账时，展示“补生成项目收款台账”操作面板。
   - 面板提交 `reason` 到 `POST /payments/:id/generate-ledger`，成功后刷新 ledger 页面。
   - 异常列表仍只负责跳转，不在异常页直接写修正。

5. 验证
   - `bun run api:typecheck`
   - 相关 API 单测
   - `pnpm --dir apps/admin check`
   - 应用 migration 后用 `supabase migration list` 核对
   - 用真实或测试 `payment_without_ledger` 样本 smoke：
     - 跳转带 `payment_id`
     - 补生成成功
     - 再次操作被防重
     - ledger 页能看到 `project_payment` 入账流水
