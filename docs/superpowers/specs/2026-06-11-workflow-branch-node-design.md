# Workflow Branch Node Design

## Goal

在 admin 流程编排画布中，用显式菱形分支节点替代“点连线配置分支条件”的主要交互，降低租户用户理解成本。

第一版只覆盖两类判断来源：

- 收款节点：成功、失败
- 审批节点：通过、拒绝

## Scope

本阶段不新增数据库节点类型，不改发布快照和运行时 RPC 的条件匹配语义。画布展示层可以生成“分支判断节点”的视觉节点，但保存到后端时仍使用现有 `workflow_edges.condition`：

- 收款成功：`{ operator: "eq", field: "payment_status", value: "success" }`
- 收款失败：`{ operator: "eq", field: "payment_status", value: "failed" }`
- 审批通过：`{ operator: "eq", field: "approval_result", value: "approved" }`
- 审批拒绝：`{ operator: "eq", field: "approval_result", value: "rejected" }`

这样可以先完成用户体验升级，同时避免迁移 `workflow_nodes.node_type`、API schema、Supabase RPC、已发布流程快照。

## Interaction

当用户从收款或审批节点拖出第一条连接线到目标节点时：

1. 系统自动在源节点右侧创建一个菱形分支判断视觉节点。
2. 源节点到判断节点显示一条普通线。
3. 判断节点到目标节点显示为默认主分支：
   - 收款：成功
   - 审批：通过
4. 判断节点保留第二个出口：
   - 收款：失败
   - 审批：拒绝

当用户从该判断节点的空出口继续连接目标节点时，系统创建对应条件边。

## Data Model

第一版采用 admin-only projection：

- 后端草稿图仍只有真实业务节点和真实条件边。
- 前端根据节点出边条件投影出一个虚拟分支节点。
- 虚拟分支节点 id 由源节点稳定生成，例如 `branch:${sourceNodeId}`。
- 虚拟分支节点不参与保存 payload。
- 连接到虚拟分支节点出口时，创建从真实源节点到真实目标节点的条件边。

## Validation

现有本地校验规则继续生效：

- 同一真实源节点有多条出边时，不允许全部都是默认分支。
- 同一真实源节点不允许重复条件。
- 第一版可保留一个默认主分支，但收款/审批分支推荐生成明确成功/通过条件。

## Visual

菱形分支节点使用独立视觉样式：

- 菱形外形。
- 标题：`收款判断` 或 `审批判断`。
- 展示出口：`成功/失败` 或 `通过/拒绝`。
- 不显示节点属性编辑入口。

## Testing

需要覆盖：

- 收款节点拖线后，画布展示收款判断菱形节点。
- 保存后后端图仍保存为收款成功条件边。
- 已有收款失败分支运行时测试继续通过。
- 本地校验播放能穿过条件分支。
