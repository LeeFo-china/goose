# Workflow Node Contract V2 Design

## Goal

把项目 workflow 对小程序的契约统一为“节点顺序 + 节点展示 + 节点属性 + 节点动作”。
小程序不再根据节点名称、旧项目状态、`construction_stages.current_stage`、
`next_stage`、本地枚举或 `action_label` 反推业务规则。

## Current Context

当前后端已经返回：

- `workflow_progress.timeline_nodes[]`：项目详情抽屉的 workflow 顺序。
- `workflow_state.actions[]`：当前员工可执行的 pending workflow task 动作。
- `construction_stages.stages[].acceptance_action`：施工阶段验收入口兼容字段。

问题是这些字段仍分散表达同一件事。小程序需要同时读 workflow 节点、施工阶段、
验收 action 和本地规则，容易出现“施工日志创建后节点已 done，但验收还没闭环”
的误展示。

## Contract

每个 `timeline_nodes[]` 节点保留现有兼容字段，并新增三组稳定字段：

```ts
type WorkflowTimelineNode = {
  node_key: string;
  node_title: string;
  node_type: string | null;
  business_kind: string | null;
  status: "done" | "current" | "pending" | "blocked";

  display: {
    label: string;
    status_label: string;
    status_variant: "default" | "success" | "warning" | "danger" | "secondary";
  };

  attributes: {
    stage_code?: string | null;
    require_log?: boolean;
    min_image_count?: number;
    acceptance_enabled?: boolean;
    acceptance_required?: boolean;
    acceptance_id?: string | null;
    acceptance_status?: string | null;
    payment_type?: string | null;
    assignee_employee_id?: string | null;
    assignee_employee_name?: string | null;
  };

  actions: Array<{
    key: string;
    label: string;
    business_domain: string | null;
    business_action: string | null;
    disabled: boolean;
    disabled_reason?: string | null;
    task_id?: string;
    stage_code?: string | null;
    acceptance_id?: string | null;
    output_fields?: Array<Record<string, unknown>>;
  }>;
};
```

## Semantics

1. 节点顺序只按 `timeline_nodes[]`。
2. 节点展示状态优先按 `node.display.status_label` 和 `node.display.status_variant`。
3. 节点能力只按 `node.attributes`。
4. 节点交互只按 `node.actions`。
5. 顶层 `workflow_state.actions[]` 继续作为当前 pending task 快捷入口。
6. `construction_stages` 保留阶段明细，但不再作为 workflow 按钮和当前节点来源。

## Acceptance Rules

`acceptance_enabled` 来自 workflow 工序节点配置 `config.trigger_acceptance`。

- `acceptance_enabled=false`
  - 小程序不展示发起验收入口。
  - 施工日志只是过程记录，可以创建多条，创建日志不推进 workflow。
  - 员工显式执行 `complete` / `complete_procedure` action 后，后端按当前工序
    真实施工日志和图片数校验；通过后节点 `done` 并进入下一节点。
  - 即使旧 `construction_stages` 有兼容字段，小程序也不得据此反推 workflow 动作。

- `acceptance_enabled=true`
  - 工序节点 complete 不等于验收闭环。
  - 如果该工序已有日志或 runtime 节点已完成，但验收未 `customer_confirmed`，
    后端应把节点展示为待验收或验收中，而不是业务已完成。
  - 节点应返回验收动作，例如 `create_acceptance`、`edit_acceptance`、
    `view_acceptance`。
  - 验收 `customer_confirmed` 后，该工序才可展示为已完成。

## Backend Approach

第一版只改 projection 层，不改数据库结构和 workflow runtime 表结构。

1. `project-workflow-progress.ts`
   - 在 `WorkflowTimelineNode` 增加 `display`、`attributes`、`actions`。
   - 从 workflow node snapshot/config 生成基础属性。
   - 从 pending task actions 生成节点动作。
   - 保留现有顶层字段，避免破坏旧小程序。

2. `employee-project-detail-bootstrap`
   - 先按现有流程获取 `workflowProgress`。
   - 构建 `constructionStages` 后，用阶段结果增强 `workflow_progress.timeline_nodes`。
   - 同步增强 `workflow_state.timeline_nodes`。

3. `construction_stages`
   - 继续作为阶段明细和兼容来源。
   - 不作为小程序 workflow 当前节点和按钮的 source of truth。

## Out of Scope

- 不在本轮把验收独立拆成 workflow 节点或 gate。
- 不迁移历史 workflow 实例。
- 不修改 orange 仓库。
- 不删除旧字段；本轮是兼容增强。

## Verification

- 单测覆盖 `display/attributes/actions` 基础字段。
- 单测覆盖 `acceptance_enabled=true` 且验收未闭环时，节点不展示为业务已完成。
- 单测覆盖 `acceptance_enabled=false` 时不生成验收 action。
- 运行 API 类型检查、相关 workflow/progress 测试、文件体积检查、`git diff --check`。
