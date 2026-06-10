# Workflow Unified Node Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workflow designer use one generic `流程节点` entry, then configure capability and specific type from the property panel.

**Architecture:** Add a small admin-only capability metadata module that maps user-facing capabilities to the existing `node_type`, `business_kind`, and `config` fields. Reuse current backend validation and runtime behavior. Keep `start` and `end` as structural control nodes.

**Tech Stack:** Next.js admin app, TypeScript, shadcn/Radix selects, existing workflow REST API, existing API Zod schemas.

---

## File Structure

- Create `apps/admin/components/workflows/workflow-node-capabilities.ts`
  - Defines capability options, business type options, default configs, key generation, and node mutation helpers.
- Modify `apps/admin/components/workflows/workflow-node-presets.ts`
  - Simplifies the node library presets to control nodes, one generic workflow step, and system nodes.
- Modify `apps/admin/components/workflows/workflow-node-library.tsx`
  - Uses the simplified preset groups without business/procedure/finance noise.
- Modify `apps/admin/components/workflows/workflow-property-panel.tsx`
  - Replaces `平台节点` with `节点能力`.
  - Adds a business type selector for business capability.
  - Uses capability helper functions when switching capabilities.
- Modify `apps/admin/components/workflows/workflow-node-config-fields.tsx`
  - Shows capability-specific config based on inferred capability.
- Modify `apps/admin/components/workflows/workflow-designer-graph-utils.ts`
  - Creates generic workflow nodes with safe unique keys.
  - Preserves current validation rules.
- Verify with `pnpm --dir apps/admin check` and `pnpm --dir apps/api check`.

## Task 1: Add Capability Metadata

**Files:**
- Create: `apps/admin/components/workflows/workflow-node-capabilities.ts`

- [ ] **Step 1: Create the capability module**

Add:

```typescript
import {
  PROJECT_LOG_STAGE_CONFIG,
  PaymentTypeConfig,
  type WorkflowBusinessKind,
  type WorkflowNodeType,
} from "@gooes/domain";
import type { WorkflowNode, WorkflowNodeConfig } from "@/components/workflows/workflow-types";

export type WorkflowNodeCapability =
  | "business"
  | "procedure"
  | "payment_collection"
  | "final_acceptance"
  | "finance"
  | "approval"
  | "notification"
  | "automation"
  | "subflow";

export const WORKFLOW_NODE_CAPABILITY_OPTIONS = [
  { value: "business", label: "业务流转" },
  { value: "procedure", label: "工序" },
  { value: "payment_collection", label: "收款" },
  { value: "final_acceptance", label: "竣工验收" },
  { value: "finance", label: "财务" },
  { value: "approval", label: "审批" },
  { value: "notification", label: "通知" },
  { value: "automation", label: "自动动作" },
  { value: "subflow", label: "子流程" },
] as const;
```

- [ ] **Step 2: Add business and capability presets**

Include business options for `customer_lead`, `phone_follow_up`, `store_visit`,
`measurement`, `design`, `quote`, and `contract`. Include capability defaults
that map to existing fields:

```typescript
type CapabilityDefaults = {
  label: string;
  description: string;
  nodeType: WorkflowNodeType;
  businessKind: WorkflowBusinessKind | null;
  nodeKeyBase: string;
  config: WorkflowNodeConfig;
};
```

- [ ] **Step 3: Add mutation helpers**

Implement:

```typescript
export function getWorkflowNodeCapability(node: WorkflowNode): WorkflowNodeCapability;
export function applyWorkflowNodeCapability(input: {
  node: WorkflowNode;
  capability: WorkflowNodeCapability;
  usedNodeKeys: string[];
}): WorkflowNode;
export function applyWorkflowBusinessKind(input: {
  node: WorkflowNode;
  businessKind: WorkflowBusinessKind;
  usedNodeKeys: string[];
}): WorkflowNode;
export function buildUniqueWorkflowNodeKey(base: string, usedNodeKeys: string[]): string;
```

Preserve `required_permissions`, `timeout_hours`, and `rollback_target_key`
when switching capabilities. Reset incompatible fields such as `stage_key`,
`payment_type`, notification channels, and approval-only fields.

## Task 2: Simplify Node Library Presets

**Files:**
- Modify: `apps/admin/components/workflows/workflow-node-presets.ts`
- Modify: `apps/admin/components/workflows/workflow-designer-graph-utils.ts`

- [ ] **Step 1: Replace preset groups**

Use these groups:

```typescript
export type WorkflowNodePresetGroup = "control" | "common" | "system";
```

Labels:

```typescript
control: "流程控制"
common: "常用节点"
system: "系统节点"
```

- [ ] **Step 2: Keep only these presets**

`start`, `workflow_step`, `notification`, `automation`, `subflow`, `end`.
The `workflow_step` preset should be:

```typescript
{
  key: "workflow_step",
  label: "流程节点",
  description: "添加一个流程步骤，然后在属性里选择业务、工序、收款、审批等能力。",
  group: "common",
  nodeType: "business",
  businessKind: "customer_lead",
  config: { required_permissions: [] },
}
```

- [ ] **Step 3: Update node creation**

In `createNodeFromPreset`, create `workflow_step` nodes with a unique
`workflow_step_<index>` key and title `流程节点`. Other structural presets keep
their current stable keys.

## Task 3: Property Panel Capability Selector

**Files:**
- Modify: `apps/admin/components/workflows/workflow-property-panel.tsx`

- [ ] **Step 1: Replace `平台节点` selector**

Use `getWorkflowNodeCapability(selectedNode)` as the select value and render
`WORKFLOW_NODE_CAPABILITY_OPTIONS`.

- [ ] **Step 2: Switch capability safely**

On value change, call:

```typescript
applyWorkflowNodeCapability({
  node: selectedNode,
  capability: value as WorkflowNodeCapability,
  usedNodeKeys,
})
```

- [ ] **Step 3: Add business specific type selector**

When capability is `business`, show a `业务类型` select using the business
options from `workflow-node-capabilities.ts`. On value change, call
`applyWorkflowBusinessKind`.

- [ ] **Step 4: Preserve existing procedure and payment title sync**

Keep the existing behavior:

- Changing `config.stage_key` updates title and key to the selected procedure.
- Changing `config.payment_type` updates title to the selected payment type.

## Task 4: Capability-Aware Config Fields

**Files:**
- Modify: `apps/admin/components/workflows/workflow-node-config-fields.tsx`

- [ ] **Step 1: Infer capability once**

Use `getWorkflowNodeCapability(node)` and branch from that value.

- [ ] **Step 2: Render config sections**

Render:

- `ProcedureConfigFields` for `procedure`.
- `WorkflowPaymentCollectionConfigFields` for `payment_collection`.
- `ApprovalConfigFields` for `finance` and `approval`.
- `NotificationConfigFields` for `notification`.

Do not render procedure fields merely because stale config contains `stage_key`.
Do not render payment fields unless capability is `payment_collection`.

## Task 5: Verify Existing Graph Behavior

**Files:**
- Modify: `apps/admin/components/workflows/workflow-designer-graph-utils.ts`

- [ ] **Step 1: Keep validation unchanged**

Confirm `validateGraph` still checks:

- Duplicate node keys.
- Procedure stage required and unique.
- Payment type required.
- Config references exist.
- Start/end structural requirements.

- [ ] **Step 2: Run admin check**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: typecheck, build, and admin file-size check pass.

- [ ] **Step 3: Run API check**

Run:

```bash
pnpm --dir apps/api check
```

Expected: typecheck, build, and API file-size check pass.

## Task 6: Manual Browser Smoke

**Files:**
- No code files; this verifies runtime behavior.

- [ ] **Step 1: Open admin workflow designer**

Use the running admin service at `http://127.0.0.1:3010`.

- [ ] **Step 2: Verify node library**

Expected:

- It shows `流程控制`, `常用节点`, and `系统节点`.
- `常用节点` contains one `流程节点`.
- Old separate business/procedure/payment node cards are not shown.

- [ ] **Step 3: Verify property panel**

Add a `流程节点`, select it, and verify:

- `节点能力` can switch to `业务流转`, `工序`, `收款`, `竣工验收`, `财务`, `审批`, `通知`, `自动动作`, `子流程`.
- Business capability shows `业务类型`.
- Procedure capability shows `工序类型`.
- Payment capability shows `收款类型`.

## Task 7: Commit

**Files:**
- All modified admin workflow files.

- [ ] **Step 1: Check status**

Run:

```bash
git status --short
```

Expected: only the planned admin workflow files are modified.

- [ ] **Step 2: Commit**

Run:

```bash
git add apps/admin/components/workflows
git commit -m "feat(workflow): 统一节点配置入口"
```

Expected: one focused implementation commit.

## Self-Review

- Spec coverage: all six acceptance criteria map to Tasks 1-6.
- Placeholder scan: no unfinished placeholder markers are allowed.
- Type consistency: helpers use existing `WorkflowNode`, `WorkflowNodeConfig`,
  `WorkflowNodeType`, and `WorkflowBusinessKind` types.
