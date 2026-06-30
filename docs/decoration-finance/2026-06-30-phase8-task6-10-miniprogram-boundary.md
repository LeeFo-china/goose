# Phase 8 Task 6-10 小程序边界说明

日期：2026-06-30

## 结论

本轮小程序无必改。

Phase 8 Task 6-10 新增的是 Admin/后端财务报表能力：

- 月度经营总览 CSV 导出。
- 项目经营排行。
- 成本分类报表。
- 应收账龄报表。
- 结账草稿、确认结账、反结账原因校验 smoke。

这些能力属于财务后台管理，不进入小程序当前业务链路。

## 小程序不要做的事

小程序不要接入或实现：

- 月度结账。
- 反结账。
- 财务报表导出。
- 项目排行。
- 成本分类统计。
- 应收账龄统计。
- 根据台账、应收、费用本地计算利润或风险。
- 根据日期本地判断月份是否已结账。

## 继续保持的原则

小程序继续按已有 workflow v2 契约：

- 流程展示只读 `workflow_state.timeline_nodes`。
- 节点能力只读 `node.attributes`。
- 操作按钮只读 `node.actions` / `workflow_state.actions` / `/workflow-tasks.actions`。
- 推进只走 `POST /workflow-tasks/:taskId/complete`。
- 财务确认收款仍按现有 `confirm_payment` 契约，不因本轮报表导出调整。

## 后续如果需要展示结账状态

如果产品后续希望工程、业务或财务人员在小程序看到“某月份已结账/已反结账”提示，后端应提供只读字段，例如：

```json
{
  "finance_period": {
    "month": "2026-06",
    "status": "closed",
    "status_label": "已结账",
    "snapshot_at": "2026-06-30T18:00:00.000Z",
    "has_snapshot_difference": true
  }
}
```

小程序只负责展示：

```text
该月份已有财务结账快照，最新财务数据以后台报表为准。
```

小程序不得根据本地项目状态、节点名称、施工阶段、日期或旧字段自行推导结账状态。

## 可回复小程序团队

```text
这轮 Phase 8 Task 6-10 是后端/Admin 的财务报表与结账后半段能力，小程序当前无必改。

新增能力包括月度报表 CSV 导出、项目经营排行、成本分类报表、应收账龄报表，以及结账 close/reopen 的受控 smoke。这些都属于财务后台管理，不进入小程序当前操作链路。

orange 侧继续保持现有 workflow v2 口径即可：流程只读 timeline_nodes，能力只读 attributes，按钮只读 actions，推进只走 /workflow-tasks/:taskId/complete。不要在小程序本地计算利润、账龄、结账状态或财务报表。

如果后续产品需要在小程序展示月份结账提示，请等后端提供 finance_period 只读字段后再做展示适配，小程序不要按日期或项目状态自行判断。
```
