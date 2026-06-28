# 阶段 6：应收运营闭环 PRD

日期：2026-06-28

关联文档：

- [2026-06-23-phase2-receivables-implementation-plan.md](./2026-06-23-phase2-receivables-implementation-plan.md)
- [2026-06-24-phase2-1-receivable-allocation-response.md](./2026-06-24-phase2-1-receivable-allocation-response.md)
- [2026-06-24-phase5-finance-analysis-warning-prd.md](./2026-06-24-phase5-finance-analysis-warning-prd.md)

## 背景

阶段 2 已完成“应收计划 + 收款核销 + ledger 入账”的核心闭环：

- workflow 收款节点可生成 `project_receivable_plans`。
- 财务确认收款后写入 `payments`、`project_receivable_allocations` 和 `finance_ledger_entries`。
- Admin 已有 `/finance/receivables` 应收列表和项目详情应收摘要。
- 小程序可从 workflow v2 的 `attributes/actions` 展示应收上下文并完成收款任务。

但当前仍偏“系统自动生成和核销”，缺少财务日常运营能力：

- 合同外增项、历史补录、特殊尾款无法由 Admin 人工建应收。
- 应收金额、日期、标题调整没有稳定入口和审计留痕。
- 逾期后没有催收跟进记录，项目经理和管理者很难追踪处理过程。
- 取消无效应收时缺少原因、操作人、时间记录。
- Admin 列表只能看“有没有逾期”，不能按运营责任和处理状态继续推进。

阶段 6 的目标是把应收从“可查询”推进到“可运营、可追溯、可复盘”。

## 目标

1. Admin 支持人工创建项目应收计划，用于增项、历史补录和非 workflow 来源应收。
2. Admin 支持调整未结清应收的标题、金额、应收日期、收款类型和负责人，并记录调整事件。
3. Admin 支持取消未结清应收，必须填写取消原因，并记录取消人和取消时间。
4. Admin 支持登记催收/跟进记录，支持下次跟进时间，形成应收运营时间线。
5. `/finance/receivables` 返回最新跟进摘要、负责人、取消信息和运营状态，列表筛选仍由后端分页执行。
6. 项目详情应收摘要继续复用同一套后端应收数据，不在 Admin 或小程序本地推导应收状态。
7. 小程序本阶段不新增必改交互；如展示运营信息，只消费后端返回的只读字段。

## 非目标

- 不做微信支付或线上收款回调。
- 不做自动催收通知、短信、企微或模板消息。
- 不做独立催收审批流。
- 不做会计凭证、发票、科目或财务软件对接。
- 不改变 workflow 收款节点推进规则。
- 不允许小程序直接创建、调整、取消或核销应收计划。
- 不做全量历史应收自动补建；历史补录通过人工计划入口处理。

## 使用角色

| 角色 | 关注点 | 主要操作 |
| --- | --- | --- |
| 财务人员 | 应收是否准确、何时该收、是否已跟进 | 新建、调整、取消、登记跟进 |
| 财务主管 | 逾期金额和处理过程是否可追溯 | 查看逾期列表、复核调整和取消原因 |
| 项目经理 | 项目回款风险和下一步催收安排 | 查看项目应收摘要和跟进状态 |
| 老板/管理者 | 哪些项目收款异常、责任人是谁 | 在经营分析中进入应收运营明细 |
| 小程序员工 | 只看授权后的只读结果 | 查看后端返回的应收摘要，不本地推导 |

## 运营状态

应收基础状态继续沿用阶段 2：

| `status` | 含义 |
| --- | --- |
| `pending` | 待收 |
| `partially_paid` | 部分收款 |
| `paid` | 已收 |
| `overdue` | 查询时派生的逾期展示状态 |
| `canceled` | 已取消 |

阶段 6 新增运营视角字段：

| 字段 | 说明 |
| --- | --- |
| `owner_employee_id` | 应收运营负责人，可为空 |
| `owner_employee_name` | 负责人名称，只读展示 |
| `latest_follow_up_at` | 最近一次跟进时间 |
| `latest_follow_up_note` | 最近一次跟进内容摘要 |
| `next_follow_up_at` | 下次跟进时间 |
| `canceled_at` | 取消时间 |
| `canceled_by_name` | 取消人名称 |
| `canceled_reason` | 取消原因 |

状态展示规则：

- `canceled` 优先显示“已取消”。
- `paid` 优先显示“已收”。
- 未结清且 `due_date < tenantToday` 显示“逾期”。
- 已有最近跟进但仍未结清，可展示最近跟进摘要。
- 无负责人时 Admin 显示“未指定负责人”，小程序如展示则使用后端文案。

## 数据模型

### 扩展 `project_receivable_plans`

新增字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `owner_employee_id` | `uuid null` | 应收运营负责人，关联 `employees.id` |
| `canceled_at` | `timestamptz null` | 取消时间 |
| `canceled_by` | `uuid null` | 取消人 |
| `canceled_reason` | `text null` | 取消原因 |

约束：

- `canceled_reason` 只在取消时必填，由 service 校验。
- 已取消应收不允许再次调整、取消或新增跟进。
- 已收应收不允许取消；如需冲销，后续阶段单独设计反向流水/退款，不在本阶段处理。

### 新增 `project_receivable_events`

用于记录人工创建、调整、取消和催收跟进。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `tenant_id` | 租户 ID |
| `project_id` | 项目 ID |
| `receivable_plan_id` | 应收计划 ID |
| `event_type` | `manual_created`、`adjusted`、`canceled`、`follow_up` |
| `title` | 事件标题 |
| `note` | 事件说明 |
| `before_snapshot` | 调整前快照 |
| `after_snapshot` | 调整后快照 |
| `next_follow_up_at` | 下次跟进时间，可为空 |
| `created_by` | 操作人 |
| `created_at` | 操作时间 |

索引：

- `tenant_id, created_at desc`
- `receivable_plan_id, created_at desc`
- `tenant_id, project_id, created_at desc`
- `tenant_id, event_type, created_at desc`

## 后端接口契约

所有接口必须使用租户上下文，列表必须分页，错误响应必须通过 `error-factory.ts`。

### `GET /finance/receivables`

继续作为 Admin 应收运营主列表。

新增 Query：

| 参数 | 说明 |
| --- | --- |
| `owner_employee_id` | 按负责人筛选 |
| `source_type` | `workflow_node`、`manual`、`migration`、`add_on` |
| `follow_up_due_only` | `true` 时只看下次跟进已到期且未结清的应收 |

返回在阶段 2 基础上新增：

```json
{
  "id": "receivable-id",
  "owner_employee_id": "employee-id",
  "owner_employee_name": "小龙女",
  "latest_follow_up_at": "2026-06-28T10:00:00.000Z",
  "latest_follow_up_note": "已电话沟通，客户承诺周五付款",
  "next_follow_up_at": "2026-07-01T09:00:00.000Z",
  "canceled_at": null,
  "canceled_by_name": null,
  "canceled_reason": null
}
```

### `POST /finance/receivables`

人工创建应收计划。

权限：`finance.receivable.manage`。

Body：

```json
{
  "project_id": "project-id",
  "payment_type": "add_on",
  "title": "增项款",
  "amount": 3000,
  "due_date": "2026-07-05",
  "owner_employee_id": "employee-id",
  "remark": "客户确认增项后补录"
}
```

成功后：

- 创建 `project_receivable_plans.source_type = manual`。
- 写入 `project_receivable_events.event_type = manual_created`。
- 返回创建后的应收计划。

### `PATCH /finance/receivables/:id`

调整未结清应收。

权限：`finance.receivable.manage`。

可调整字段：

- `payment_type`
- `title`
- `amount`
- `due_date`
- `owner_employee_id`
- `remark`

规则：

- `amount` 必须大于 0。
- `amount` 不能小于 `paid_amount`。
- `paid`、`canceled` 状态不允许调整。
- 调整后写入 `project_receivable_events.event_type = adjusted`，带 before/after 快照。

### `POST /finance/receivables/:id/cancel`

取消未结清应收。

权限：`finance.receivable.manage`。

Body：

```json
{
  "reason": "客户取消增项，不再收取"
}
```

规则：

- `paid` 不允许取消。
- `canceled` 重复取消返回业务错误。
- 取消后设置 `status = canceled`、`canceled_at`、`canceled_by`、`canceled_reason`。
- 写入 `project_receivable_events.event_type = canceled`。

### `POST /finance/receivables/:id/follow-ups`

登记催收/跟进记录。

权限：`finance.receivable.manage`。

Body：

```json
{
  "note": "已电话沟通，客户承诺周五付款",
  "next_follow_up_at": "2026-07-01T09:00:00.000Z"
}
```

规则：

- `note` 必填。
- `paid`、`canceled` 不允许新增跟进。
- 写入 `project_receivable_events.event_type = follow_up`。

### `GET /finance/receivables/:id/events`

分页查询应收运营时间线。

权限：`finance.receivable.view`、`finance.receivable.manage` 或 `finance.view`。

Query：

- `page=1`
- `pageSize=20`

返回：

```json
{
  "list": [
    {
      "id": "event-id",
      "event_type": "follow_up",
      "title": "登记跟进",
      "note": "已电话沟通，客户承诺周五付款",
      "next_follow_up_at": "2026-07-01T09:00:00.000Z",
      "created_by_name": "小龙女",
      "created_at": "2026-06-28T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

## Admin 对接

### `/finance/receivables`

在现有页面增强，不新增一级菜单。

需要新增：

- “新增应收”按钮。
- 表格展示负责人、最近跟进、下次跟进。
- 行内动作：调整、取消、登记跟进、查看项目。
- 筛选：负责人、来源、跟进到期。
- 操作成功后刷新当前页，不本地改写财务事实。

### 项目详情

项目详情应收摘要继续调用 `/projects/:projectId/receivables`。

第一版可只展示最近 5 条应收；如需要管理动作，跳转到 `/finance/receivables?project_id=:id` 操作，避免在项目详情复制一套复杂表单。

## 小程序对接

本阶段小程序无必改。

后续如需要展示应收运营信息，口径如下：

- 只读展示后端返回的 `owner_employee_name`、`latest_follow_up_note`、`next_follow_up_at`。
- 不调用 `/finance/receivables` 写接口。
- 不本地推导逾期、催收状态或负责人。
- 收款仍只通过 workflow task `POST /workflow-tasks/:taskId/complete` 完成。

## 验收口径

1. Admin 人工新增应收后，`/finance/receivables` 和项目详情应收摘要都能看到。
2. 调整应收金额/日期后，列表刷新展示新值，事件时间线能看到调整前后快照。
3. 已核销部分金额的应收不能把 `amount` 调低到小于 `paid_amount`。
4. 取消未结清应收后不再计入项目应收汇总。
5. 已收应收不能取消，已取消应收不能重复调整或跟进。
6. 登记跟进后，列表展示最近跟进和下次跟进时间。
7. `GET /finance/receivables/:id/events` 正确分页。
8. workflow 收款确认仍能照常核销应收，不受人工计划运营能力影响。
9. 小程序既有收款 workflow smoke 不需要改 complete payload。

## 风险和后续

- 本阶段不做退款/冲销，因此“已收后发现错误”的处理需要后续单独设计。
- 催收跟进暂不做通知，避免引入消息队列和外部通道。
- 如后续接入微信支付，`wechat_pay_callback` 仍可沿用现有 allocation 表，Phase 6 事件表只记录运营动作，不替代支付事实。
- 如应收事件增长很快，可后续增加项目级聚合 RPC；第一版按分页事件列表满足运营追溯。
