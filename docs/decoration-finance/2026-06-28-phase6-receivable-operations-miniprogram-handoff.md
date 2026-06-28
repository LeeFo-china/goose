# 阶段 6：应收运营闭环小程序交接

日期：2026-06-28

## 结论

本阶段小程序无必改。

阶段 6 主要是 Admin 财务运营能力：

- 人工创建应收计划。
- 调整应收计划。
- 取消未结清应收。
- 登记催收/跟进记录。
- 查询应收运营时间线。

小程序继续按阶段 2 的收款 workflow 口径执行，不需要改 complete payload。

## 小程序继续保持的口径

1. 收款待办仍来自 `/workflow-tasks?status=pending`。
2. 收款按钮仍来自 `workflow_state.actions`、`timeline_nodes[].actions` 或 `/workflow-tasks.actions`。
3. 确认收款仍只调用 `POST /workflow-tasks/:taskId/complete`。
4. complete output 只提交用户输入的收款金额、收款时间、凭证和备注。
5. 不直接调用 `/finance/receivables` 写接口。
6. 不直接创建 `payments`、`finance_ledger_entries` 或 `project_receivable_allocations`。
7. 不本地推导逾期、催收状态、负责人或应收运营状态。

## 可选只读展示字段

如果小程序后续需要在项目详情展示应收运营信息，只读取后端返回字段：

| 字段 | 含义 |
| --- | --- |
| `owner_employee_name` | 应收负责人 |
| `latest_follow_up_at` | 最近跟进时间 |
| `latest_follow_up_note` | 最近跟进摘要 |
| `next_follow_up_at` | 下次跟进时间 |
| `canceled_at` | 取消时间 |
| `canceled_by_name` | 取消人 |
| `canceled_reason` | 取消原因 |

展示建议：

- 无负责人：显示“未指定负责人”或不展示负责人行。
- 无跟进：显示“暂无跟进”或不展示跟进行。
- 已取消：以 `status=canceled` 和取消字段为准。

## 禁止行为

- 不在小程序人工新增应收。
- 不在小程序调整应收金额或日期。
- 不在小程序取消应收。
- 不在小程序登记催收记录。
- 不在小程序根据 `due_date` 自己计算逾期天数或催收状态。

## 后端接口说明

Admin 新增写接口，不作为小程序本阶段对接入口：

- `POST /finance/receivables`
- `PATCH /finance/receivables/:id`
- `POST /finance/receivables/:id/cancel`
- `POST /finance/receivables/:id/follow-ups`
- `GET /finance/receivables/:id/events`

小程序如需只读项目应收，仍使用：

- `GET /projects/:projectId/receivables?page=1&pageSize=20`

## 给小程序团队的一句话

本阶段 gooes 只增强 Admin 应收运营闭环，小程序收款 workflow 契约不变；orange 继续只按 workflow v2 的 attributes/actions 展示和 complete，不要直接写 `/finance/receivables`，如后续展示负责人或跟进信息，只读取后端只读字段。
