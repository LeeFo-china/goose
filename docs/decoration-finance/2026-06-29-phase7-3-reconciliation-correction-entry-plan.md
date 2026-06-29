# Phase 7.3 对账异常修正入口计划

日期：2026-06-29

## 背景

Phase 7.1 已完成对账异常处理记录，Phase 7.2 收敛 Admin 对账 UX 后，财务人员可以确认、忽略、人工闭环或重新打开异常。

下一步不应做“自动修账”。对账异常的本质是提示数据链路存在差异，修正动作必须进入对应业务单据，由有权限的人员人工核对后修改应收、收款、核销或台账。

## 目标

1. 对账异常列表提供明确的“去处理”入口。
2. 入口根据异常类型跳到可修正的业务页面，并携带项目或单据筛选条件。
3. Admin 页面只做引导和人工操作，不自动改收款、应收、核销或台账。
4. 修正完成后由对账异常重新计算结果，处理记录只保留人工追溯。

## 非目标

- 不做自动生成收款、台账或核销记录。
- 不在小程序端增加财务修账能力。
- 不绕过现有应收、收款、台账、核销权限。
- 不用 `resolved` 表示系统修复成功；`resolved` 只表示人工确认闭环。

## 异常类型与建议入口

| 异常类型 | 当前含义 | 建议入口 | 建议处理 |
| --- | --- | --- | --- |
| `receivable_overdue` | 应收计划逾期未收 | `/finance/receivables?project_id=...&status=overdue` | 跟进、调整到期日、取消无效应收或确认收款 |
| `payment_without_ledger` | 已确认收款没有项目收款台账 | `/finance/ledger?project_id=...&entry_type=project_payment` | 核对收款记录，必要时补生成台账或重新确认收款 |
| `ledger_without_payment` | 项目收款台账缺少收款关联 | `/finance/ledger?project_id=...&direction=in` | 核对台账来源，补关联收款或人工标记历史流水 |
| `payment_unallocated` | 收款未核销到应收计划 | `/finance/receivables?project_id=...` | 进入应收核销或收款分配入口 |
| `allocation_amount_mismatch` | 收款核销金额和收款金额不一致 | `/finance/receivables?project_id=...` | 核对核销明细，调整核销分配 |
| `receivable_paid_amount_mismatch` | 应收已收金额和核销金额不一致 | `/finance/receivables?project_id=...` | 重算或修正应收已收金额，核对核销事件 |

## Admin 对接建议

### 对账异常列表

- 保留现有“查看”按钮，但文案改为更明确的“去处理”。
- 异常行的 `action.target` 由后端返回，Admin 只做跳转。
- 处理弹窗保留“确认、忽略、人工闭环、重新打开”，用于记录人工判断，不作为修账动作。
- 历史记录展示操作人、时间、动作和备注，便于追溯。

### 修正入口页面

- 应收计划页需要支持通过 `project_id`、`status` 定位。
- 财务台账页需要支持通过 `project_id`、`direction`、`entry_type` 定位。
- 后续如新增独立核销明细页，可将 `payment_unallocated`、`allocation_amount_mismatch`、`receivable_paid_amount_mismatch` 的入口收敛到该页。

### 权限

- 查看异常：沿用 `finance.view`、`finance.ledger.view`、`finance.receivable.view`、`finance.receivable.manage`。
- 处理异常记录：继续要求 `finance.reconciliation.manage`。
- 真正修改应收、收款、核销或台账时，使用目标业务页面已有权限。

## API 对接建议

短期继续由后端计算异常时返回：

```json
{
  "action": {
    "key": "open_receivable",
    "label": "去处理",
    "target": "/finance/receivables?project_id=..."
  }
}
```

后续如需要更细的修正建议，可扩展只读字段：

```json
{
  "recommended_resolution": {
    "type": "receivable_follow_up",
    "label": "跟进应收计划",
    "target": "/finance/receivables?project_id=...",
    "manual_only": true
  }
}
```

`manual_only=true` 表示该建议只用于导航和说明，不允许后端自动修账。

## 小程序影响

本阶段小程序无必改。

小程序继续只消费 workflow v2、费用、收款和应收的既有接口；不接入 Admin 财务修账入口。如果未来需要在小程序展示“项目存在财务对账异常”，也只能做只读提示，不提供修账动作。

## 验收口径

1. 每种异常类型的“去处理”入口能跳到对应 Admin 页面。
2. 跳转后页面能按项目或状态筛选到相关数据。
3. 在异常处理弹窗中能看到历史处理记录。
4. 执行“人工闭环”后，只新增处理记录，不修改收款、应收、核销或台账源数据。
5. 修正业务单据后，重新打开对账异常列表，异常状态由后端重新计算或由人工处理记录解释。

## 风险与后续

- 当前部分入口仍是列表级定位，不是单据级定位；如果财务单据量增大，需要补单据详情页或抽屉。
- 对账异常是计算型列表，历史处理记录可能对应一个后续已经消失的异常；历史记录仍应保留用于审计。
- 如果后续引入自动重算应收已收金额，必须单独出 migration、权限和幂等设计，不能混入本阶段。
