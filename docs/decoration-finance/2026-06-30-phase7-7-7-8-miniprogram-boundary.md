# Phase 7.7/7.8 小程序边界说明

日期：2026-06-30

## 结论

小程序本轮无必改。

Phase 7.7/7.8 主要影响 Admin 财务对账后台：

- 费用侧对账异常。
- 财务台账费用结算跳转参数。
- 项目详情 Admin 对账摘要增强。

不改变小程序既有：

- 费用申请。
- 费用审批/驳回/撤回。
- 财务打款。
- 收款确认。
- 项目施工 workflow。
- workflow v2 actions 消费方式。

## 小程序继续保持的契约

小程序继续按既有 workflow v2 口径：

- 流程顺序只读 `timeline_nodes`。
- 展示只读 `node.display`。
- 能力只读 `node.attributes`。
- 按钮只读 `node.actions`、`workflow_state.actions` 或 `/workflow-tasks` 的 `actions`。
- 推进统一调用 `POST /workflow-tasks/:taskId/complete`。
- 不从 Admin 对账异常、项目状态、节点名或本地枚举推导业务动作。

## 不需要接入的 Admin 能力

小程序不要直接消费：

- `/finance/reconciliation/exceptions`
- `/finance/reconciliation/operating-stats`
- Admin 项目详情对账摘要内部字段
- 财务修正审计列表
- 对账异常处理动作

这些能力属于 Admin 财务后台，不作为员工端业务闭环来源。

## 后续可选接入

如果后续产品需要在小程序展示项目财务健康摘要，应单独设计员工端只读接口，例如：

```text
GET /projects/:projectId/finance-health
```

字段建议只包含展示安全的摘要：

- `status_label`
- `warning_count`
- `latest_warning_title`
- `last_checked_at`

不建议暴露：

- 内部异常处理动作。
- 审计明细。
- 财务修正入口。
- 预算/利润敏感明细。

## 给小程序团队的话术

本轮后端/Admin 已完成 Phase 7.7/7.8 费用侧对账和项目对账摘要增强。orange 当前无需改代码，也不要新增本地财务对账规则。

请继续保持现有 workflow v2 契约：所有业务按钮来自后端 actions，所有推进走 `/workflow-tasks/:taskId/complete`。费用对账异常、运营统计和修正审计属于 Admin 财务后台，本轮不要求小程序接入。
