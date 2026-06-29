# Phase 7.4 单据级人工修正闭环计划

日期：2026-06-29

关联文档：

- [2026-06-28-phase7-finance-reconciliation-dashboard-plan.md](./2026-06-28-phase7-finance-reconciliation-dashboard-plan.md)
- [2026-06-29-phase7-3-reconciliation-correction-entry-plan.md](./2026-06-29-phase7-3-reconciliation-correction-entry-plan.md)
- [2026-06-29-phase7-3-post-release-smoke.md](./2026-06-29-phase7-3-post-release-smoke.md)

## 背景

Phase 7.3 已把对账异常列表收敛为“去处理”入口，Admin 能按后端返回的 `action.target` 跳到应收计划或财务台账筛选页。

下一阶段不建议直接做自动修账。对账异常只是识别差异，真正修正必须回到对应业务单据，由具备权限的财务人员人工核对后受控修改，并留下审计记录。

## 目标

1. 针对当前对账异常类型，提供单据级人工修正入口，而不是只停留在列表筛选。
2. 每个修正动作都必须校验权限、校验当前数据状态、写入审计事件。
3. 修正后不直接标记异常“系统已修复”，而是由对账异常重新计算；人工闭环记录只表达人工判断。
4. 保持小程序不参与财务修账，小程序最多展示只读异常提示。

## 非目标

- 不自动生成或修改收款、核销、应收、台账。
- 不做会计凭证、总账、科目余额。
- 不绕过现有应收、收款、台账、费用权限。
- 不把 `resolved` 语义改成“系统自动修复成功”。
- 不把修正入口开放到小程序端。

## 建议任务拆分

### Task 1：应收逾期处理增强

覆盖异常：

- `receivable_overdue`

能力：

- 在应收计划页支持单条应收的跟进记录。
- 支持调整到期日，要求填写原因。
- 支持取消无效应收，要求填写原因。
- 支持从应收计划进入确认收款 workflow 或现有收款确认入口。

审计：

- 记录操作人、操作时间、旧值、新值、原因。
- 事件类型建议：`follow_up`、`adjust_due_date`、`cancel_receivable`。

### Task 2：收款核销分配入口

覆盖异常：

- `payment_unallocated`
- `allocation_amount_mismatch`
- `receivable_paid_amount_mismatch`

能力：

- 在项目应收页展示项目收款、应收计划、已核销金额和剩余可分配金额。
- 支持把已确认收款分配到应收计划。
- 支持调整已有核销分配。
- 调整前必须校验 payment 已确认、未作废、分配合计不能超过收款金额。

审计：

- 记录每次核销分配变化。
- 事件类型建议：`allocate_payment`、`adjust_allocation`、`reverse_allocation`。

### Task 3：收款台账补生成

覆盖异常：

- `payment_without_ledger`

能力：

- 在收款详情或台账页提供“补生成项目收款台账”动作。
- 仅允许 payment 状态为 `confirmed` 且没有项目收款入账流水时执行。
- 幂等校验必须以 payment ID 或业务唯一键为准，避免重复入账。

审计：

- 记录补生成的 ledger ID、payment ID、操作人和原因。
- 事件类型建议：`generate_missing_project_payment_ledger`。

### Task 4：历史台账关联与标记

覆盖异常：

- `ledger_without_payment`

能力：

- 对历史导入或人工流水，允许标记为历史收款流水。
- 如能确认来源 payment，允许补关联 payment。
- 不允许无审计地删除台账或静默改金额。

审计：

- 记录旧关联、新关联、标记类型和原因。
- 事件类型建议：`link_ledger_payment`、`mark_legacy_ledger`。

### Task 5：对账异常详情抽屉

能力：

- 在 `/finance/reconciliation` 增加异常详情抽屉。
- 展示异常源数据、推荐处理入口、最近人工处理记录。
- 展示“重新计算后仍存在/已消失”的状态提示。
- 只读展示源数据，不在抽屉里直接绕过业务页面修账。

## 后端原则

- 修正接口必须进入对应领域 service，不在 reconciliation service 里直接改源表。
- 所有列表接口继续分页，`pageSize <= 100`。
- 涉及新增表、索引、审计事件类型、约束或 RPC 必须走 migration。
- 金额类操作必须以整数分为准，避免浮点误差。
- 幂等键必须覆盖补生成台账和核销调整。

## Admin 对接

Admin 侧按“业务页面修正，异常页引导”的模式实现：

- 对账异常页：展示异常、详情、推荐处理入口和历史处理记录。
- 应收计划页：承接逾期跟进、到期日调整、取消应收、核销分配。
- 财务台账页：承接项目收款台账筛选、补生成、历史流水关联或标记。
- 所有修正动作必须有二次确认和原因输入。

## 小程序对接

小程序端本阶段仍无必改。

约束：

- 不调用 `/finance/reconciliation/*` 写接口。
- 不执行应收调整、核销调整、补生成台账或历史台账标记。
- 不本地计算对账异常。

后续可选只读展示：

```json
{
  "finance_reconciliation_summary": {
    "exception_count": 1,
    "highest_level": "warning",
    "latest_exception_title": "存在未核销收款"
  }
}
```

该字段只用于项目经理或施工负责人知情，不提供修账入口。

## 验收口径

1. 每类异常都有明确的单据级人工处理路径。
2. 每个修正动作都有权限校验、状态校验、原因和审计事件。
3. 修正动作执行后，对账异常重新计算能反映最新源数据。
4. 异常处理记录和源数据修正记录可以互相追溯。
5. 小程序不出现财务修账入口。

## 推荐执行顺序

1. 先做 Task 2 收款核销分配入口，因为它覆盖当前现场最多的 `payment_unallocated`。
2. 再做 Task 1 应收逾期处理增强，承接 `receivable_overdue`。
3. 然后做 Task 3 补生成项目收款台账。
4. 最后做 Task 4 历史台账关联与标记，以及 Task 5 异常详情抽屉。

优先级依据：先解决当前可见异常和真实财务操作频率，再补低频历史数据治理。
