# Workflow React Flow + ELK Migration Design

## Goal

把 admin 流程编排画布完整迁移到 `@xyflow/react` + ELK。React Flow 作为唯一画布交互和渲染引擎，ELK 只负责一键整理布局。旧的自研画布交互、SVG 连线、滚动边界、连接草稿和节点拖拽逻辑全部删除，不做新旧兼容。

## Scope

本迁移只改 admin 前端画布实现，不改后端接口、数据库、发布快照或运行时 RPC。保存草稿和发布仍使用现有 `WorkflowNode`、`WorkflowEdge`、`toNodeInput`、`toEdgeInput` 数据结构。

保留：

- `WorkflowNode` / `WorkflowEdge` 业务模型。
- 节点库、属性面板、保存草稿、发布、本地校验。
- 条件分支语义：收款成功/失败，审批通过/拒绝。
- ELK 自动整理能力。

替换：

- 画布平移、缩放、拖拽、节点选择。
- 节点连接、连接预览、handle 命中。
- SVG 连线渲染、hover、删除按钮。
- 菱形分支节点的 DOM 投影渲染。

删除：

- `workflow-canvas-pan.ts`
- `workflow-canvas-edges.tsx`
- `workflow-canvas-branch-node.tsx`
- `workflow-canvas-node.tsx`
- `workflow-canvas-view-state.ts`
- `workflow-canvas-geometry.ts` 中非 ELK 布局相关逻辑

## Architecture

`WorkflowCanvas` 仍然是 `WorkflowDesignerShell` 的入口组件，但内部改为 `ReactFlowProvider` + `ReactFlow`。组件接收现有业务 `nodes` 和 `edges`，通过 adapter 转成 React Flow nodes/edges；用户交互产生的变更再转回业务数据并调用现有回调。

新的文件职责：

- `workflow-flow-types.ts`：React Flow node/edge data 类型。
- `workflow-flow-adapter.ts`：业务图和 React Flow 图互转。
- `workflow-flow-layout.ts`：ELK 布局，输入业务图，输出更新后的业务节点。
- `workflow-flow-node.tsx`：普通业务节点 custom node。
- `workflow-flow-branch-node.tsx`：菱形分支 custom node。
- `workflow-flow-edge.tsx`：custom edge，负责蚂蚁线、hover、删除交互。
- `workflow-canvas.tsx`：React Flow 容器、toolbar、节点库按钮、事件桥接。

## Branch Nodes

菱形分支节点继续不保存到后端。它由 `workflow-branch-projection.ts` 根据真实源节点和条件边生成，但渲染为真实 React Flow node：

- id：`branch:${sourceNodeId}`
- type：`workflowBranch`
- 入口：左顶点，连接真实源节点。
- 成功/通过出口：右顶点，绿色 handle。
- 失败/拒绝出口：下顶点，红色 handle。

用户从普通收款/审批节点拖出第一条连接线时，系统创建真实条件边，并显示菱形节点。用户从菱形出口连接目标节点时，系统创建对应真实条件边。

删除真实源节点到菱形节点的投影连线时，清除该源节点所有分支条件边，并隐藏菱形节点。

## ELK Layout

ELK 输入包含真实业务节点和投影分支节点。布局计算完成后：

- 普通节点坐标写回 `WorkflowNode.position`。
- 分支节点坐标写回源节点 `config.branch_node_position`。
- React Flow viewport 设置为 60%。

ELK 不处理拖拽、滚动、缩放或连接交互。

## Styling

React Flow 节点样式沿用当前 admin 简约卡片风格。必须导入 `@xyflow/react/dist/style.css`，并用本地 CSS 覆盖背景、handle、controls、edge label 的视觉。节点可继续使用 Tailwind class，但 React Flow 基础结构由库维护。

## Testing

必须保留并更新这些 E2E 覆盖：

- 整理后保存草稿再重新进入节点位置不漂移。
- 整理画布后普通节点和判断节点不重叠。
- 缩小后节点不能拖出画布左上边界。
- 线性流程整理后可以访问末端节点。
- 横向滚动条出现后可以拖拽画布平移，迁移后应验证 React Flow pan。
- 收款节点拖线自动生成判断节点。
- 收款判断节点可以拖动并通过来源连线删除。
- 连线不再提供属性配置入口。
- 收款判断节点失败出口可以连接催收流程。
- 本地校验播放能按执行顺序高亮节点和边。

## Acceptance

迁移完成的证据：

- `apps/admin/package.json` 包含 `@xyflow/react`。
- 旧画布文件被删除或不再存在。
- `rg "workflow-canvas-pan|WorkflowCanvasEdges|WorkflowCanvasBranchNode|WorkflowCanvasNode|workflow-canvas-geometry|workflow-canvas-view-state" apps/admin/components/workflows` 不再命中旧实现。
- `WorkflowCanvas` 内部使用 `ReactFlow`。
- `pnpm --dir apps/admin check` 通过。
- 相关 workflow E2E 通过。
