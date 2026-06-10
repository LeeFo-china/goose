# Workflow Payment Collection Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a workflow payment collection gate node so tenants can block project flow progression until the configured project payment has been confirmed.

**Architecture:** Reuse the existing workflow node type `confirmation` and add a new business kind `payment_collection`. Admin owns node creation and property editing, API schema validates payment config, runtime guard checks confirmed `payments` rows before completing the node, and Supabase migration adds the required lookup index.

**Tech Stack:** TypeScript, Next.js admin, Fastify API, Zod, Supabase migrations, Bun/pnpm.

---

## File Structure

- Modify `packages/domain/src/workflow.ts`: add `payment_collection` to workflow business kinds while keeping legacy `deposit`.
- Modify `apps/api/src/schema/workflows.ts`: validate payment collection node config and import payment type constants.
- Modify `apps/api/src/errors/error-codes.ts`: add `WORKFLOW_PAYMENT_COLLECTION_BLOCKED`.
- Modify `apps/api/src/repositories/payments.ts`: add a narrow confirmed-payment summary query used by workflow runtime.
- Modify `apps/api/src/services/workflow-runtime-guards.ts`: block payment collection node completion until confirmed payments satisfy config.
- Create `supabase/migrations/20260610190000_add_payment_collection_workflow_index.sql`: add `payments(project_id, type, status)` index.
- Modify `apps/admin/components/workflows/workflow-types.ts`: add payment collection config type.
- Modify `apps/admin/components/workflows/workflow-node-presets.ts`: add finance group and payment collection preset; remove visible business deposit preset.
- Create `apps/admin/components/workflows/workflow-payment-collection-config-fields.tsx`: focused property fields for payment nodes.
- Modify `apps/admin/components/workflows/workflow-node-config-fields.tsx`: render payment collection fields.
- Modify `apps/admin/components/workflows/workflow-property-panel.tsx`: include finance group and sync payment type label to node title for default titles.
- Modify `apps/admin/components/workflows/workflow-designer-graph-utils.ts`: add default config and local validation for payment collection nodes.
- Runtime data step: update the active construction workflow definition to insert the payment collection node between water/electrical and tiling after code deploy.

---

### Task 1: Domain, API Schema, and Database Index

**Files:**
- Modify: `packages/domain/src/workflow.ts`
- Modify: `apps/api/src/schema/workflows.ts`
- Modify: `apps/api/src/errors/error-codes.ts`
- Create: `supabase/migrations/20260610190000_add_payment_collection_workflow_index.sql`

- [ ] **Step 1: Add workflow business kind**

In `packages/domain/src/workflow.ts`, add `payment_collection` after the legacy `deposit` item:

```ts
export const WORKFLOW_BUSINESS_KIND_VALUES = [
  'customer_lead',
  'phone_follow_up',
  'store_visit',
  'measurement',
  'design',
  'quote',
  'deposit',
  'payment_collection',
  'contract',
  'construction_start',
  'final_acceptance',
  'settlement',
  'expense_approval',
  'stage_template',
  'procedure_template',
] as const;
```

- [ ] **Step 2: Add API payment collection config schema**

In `apps/api/src/schema/workflows.ts`, extend the imports:

```ts
import {
  PAYMENT_TYPE_VALUES,
  WORKFLOW_BUSINESS_KIND_VALUES,
  WORKFLOW_CATEGORY_VALUES,
  WORKFLOW_DEFINITION_STATUS_VALUES,
  WORKFLOW_EDGE_CONDITION_OPERATOR_VALUES,
  WORKFLOW_INSTANCE_STATUS_VALUES,
  WORKFLOW_NODE_TYPE_VALUES,
  WORKFLOW_SUBJECT_TYPE_VALUES,
  PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
} from "@gooes/domain";
```

Add this constant near `BaseNodeConfigSchema`:

```ts
const WORKFLOW_PAYMENT_COLLECTION_TYPE_VALUES = [
  "deposit",
  "stage_1",
  "stage_2",
  "stage_3",
  "add_on",
] as const satisfies ReadonlyArray<(typeof PAYMENT_TYPE_VALUES)[number]>;
```

Add this schema after `ProcedureNodeConfigSchema`:

```ts
const PaymentCollectionNodeConfigSchema = BaseNodeConfigSchema.extend({
  payment_type: z.enum(WORKFLOW_PAYMENT_COLLECTION_TYPE_VALUES, {
    message: "请选择有效的收款类型",
  }).default("deposit"),
  min_amount: numericField("最低收款金额必须为数字")
    .nonnegative("最低收款金额不能为负数")
    .nullable()
    .optional(),
  block_message: textField("阻塞提示格式无效")
    .max(200, "阻塞提示不能超过 200 字")
    .nullable()
    .optional(),
});
```

Update `WorkflowNodeConfigSchema`:

```ts
export const WorkflowNodeConfigSchema = z.union([
  BaseNodeConfigSchema,
  ApprovalNodeConfigSchema,
  ProcedureNodeConfigSchema,
  PaymentCollectionNodeConfigSchema,
  NotificationNodeConfigSchema,
], { error: "无效的节点配置" });
```

- [ ] **Step 3: Add workflow payment blocked error code**

In `apps/api/src/errors/error-codes.ts`, add the new code near existing workflow codes:

```ts
  WORKFLOW_PAYMENT_COLLECTION_BLOCKED:
    "WORKFLOW_PAYMENT_COLLECTION_BLOCKED",
```

- [ ] **Step 4: Add Supabase index migration**

Create `supabase/migrations/20260610190000_add_payment_collection_workflow_index.sql`:

```sql
-- Support workflow payment collection gate checks by project, payment type, and status.
CREATE INDEX IF NOT EXISTS idx_payments_project_type_status
ON public.payments(project_id, type, status);
```

- [ ] **Step 5: Run API type check**

Run:

```bash
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

Expected: TypeScript passes. If it fails because the workspace package is not rebuilt, fix the TypeScript source rather than generated output.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add packages/domain/src/workflow.ts apps/api/src/schema/workflows.ts apps/api/src/errors/error-codes.ts supabase/migrations/20260610190000_add_payment_collection_workflow_index.sql
git commit -m "feat(workflow): add payment collection node schema"
```

---

### Task 2: Backend Runtime Payment Gate

**Files:**
- Modify: `apps/api/src/repositories/payments.ts`
- Modify: `apps/api/src/services/workflow-runtime-guards.ts`

- [ ] **Step 1: Add a narrow payment summary query**

In `apps/api/src/repositories/payments.ts`, add this type near `PaymentRecord`:

```ts
export type ConfirmedPaymentSummary = {
  count: number;
  totalAmount: number;
};
```

Add this method inside `PaymentRepository`:

```ts
  async summarizeConfirmedProjectPayments(input: {
    projectId: string;
    type: string;
  }): Promise<ConfirmedPaymentSummary> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("payments")
      .select("amount")
      .eq("project_id", input.projectId)
      .eq("type", input.type)
      .eq("status", "confirmed");

    if (error) {
      throw Errors.dbError("查询项目已入账收款失败", error);
    }

    const rows = (data || []) as Array<{ amount: number | null }>;
    return {
      count: rows.length,
      totalAmount: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    };
  }
```

- [ ] **Step 2: Add payment gate helpers**

In `apps/api/src/services/workflow-runtime-guards.ts`, add the import:

```ts
import { paymentRepository } from "@/repositories/payments";
```

Add this call immediately after `assertProcedureNodeRequirements(currentNode, input.output);`:

```ts
  await assertPaymentCollectionRequirements({
    node: currentNode,
    projectId: instance.subject_id,
  });
```

Add these helper functions before `assertProcedureNodeRequirements`:

```ts
async function assertPaymentCollectionRequirements(input: {
  node: WorkflowNodeRow | null | undefined;
  projectId: string;
}) {
  if (input.node?.business_kind !== "payment_collection") {
    return;
  }

  const paymentType = getPaymentCollectionType(input.node.config.payment_type);
  const minAmount = getPaymentCollectionMinAmount(input.node.config.min_amount);
  const summary = await paymentRepository.summarizeConfirmedProjectPayments({
    projectId: input.projectId,
    type: paymentType,
  });
  const amountSatisfied = minAmount === null || summary.totalAmount >= minAmount;

  if (summary.count > 0 && amountSatisfied) {
    return;
  }

  const fallbackMessage = minAmount === null
    ? "请先确认收款后再推进流程"
    : `已入账金额不足，当前已入账 ${summary.totalAmount} 元，要求至少 ${minAmount} 元`;
  const message = typeof input.node.config.block_message === "string" &&
      input.node.config.block_message.trim()
    ? input.node.config.block_message.trim()
    : fallbackMessage;

  throw Errors.business(
    409,
    message,
    ErrorCodes.WORKFLOW_PAYMENT_COLLECTION_BLOCKED,
    {
      node_key: input.node.node_key,
      project_id: input.projectId,
      payment_type: paymentType,
      confirmed_payment_count: summary.count,
      confirmed_amount: summary.totalAmount,
      min_amount: minAmount,
    },
  );
}

function getPaymentCollectionType(value: unknown) {
  if (
    value === "deposit" ||
    value === "stage_1" ||
    value === "stage_2" ||
    value === "stage_3" ||
    value === "add_on"
  ) {
    return value;
  }
  return "deposit";
}

function getPaymentCollectionMinAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return null;
}
```

- [ ] **Step 3: Run API check**

Run:

```bash
bun run api:check
```

Expected: API typecheck, build, and file-size checks pass.

- [ ] **Step 4: Commit Task 2**

Run:

```bash
git add apps/api/src/repositories/payments.ts apps/api/src/services/workflow-runtime-guards.ts
git commit -m "feat(workflow): block runtime on unconfirmed payments"
```

---

### Task 3: Admin Node Library and Property Panel

**Files:**
- Modify: `apps/admin/components/workflows/workflow-types.ts`
- Modify: `apps/admin/components/workflows/workflow-node-presets.ts`
- Create: `apps/admin/components/workflows/workflow-payment-collection-config-fields.tsx`
- Modify: `apps/admin/components/workflows/workflow-node-config-fields.tsx`
- Modify: `apps/admin/components/workflows/workflow-property-panel.tsx`
- Modify: `apps/admin/components/workflows/workflow-designer-graph-utils.ts`

- [ ] **Step 1: Add admin config type**

In `apps/admin/components/workflows/workflow-types.ts`, add:

```ts
export type WorkflowPaymentCollectionNodeConfig = WorkflowBaseNodeConfig & {
  payment_type?: "deposit" | "stage_1" | "stage_2" | "stage_3" | "add_on";
  min_amount?: number | null;
  block_message?: string | null;
};
```

Update `WorkflowNodeConfig`:

```ts
export type WorkflowNodeConfig =
  | WorkflowBaseNodeConfig
  | WorkflowApprovalNodeConfig
  | WorkflowProcedureNodeConfig
  | WorkflowPaymentCollectionNodeConfig
  | WorkflowNotificationNodeConfig;
```

- [ ] **Step 2: Add finance group and payment preset**

In `apps/admin/components/workflows/workflow-node-presets.ts`, update `WorkflowNodePresetGroup`:

```ts
export type WorkflowNodePresetGroup =
  | "control"
  | "business"
  | "construction"
  | "procedure"
  | "finance"
  | "approval"
  | "system";
```

Update `WorkflowNodePresetGroupLabels`:

```ts
  finance: "财务节点",
```

Remove the existing preset with `key: "deposit"` and label `定金`.

Add this preset before `settlement`:

```ts
  {
    key: "payment_collection",
    label: "收款节点",
    description: "检查项目收款已入账后再放行后续流程。",
    group: "finance",
    nodeType: "confirmation",
    businessKind: "payment_collection",
    config: {
      payment_type: "deposit",
      min_amount: null,
      block_message: null,
    },
  },
```

- [ ] **Step 3: Create focused payment config fields**

Create `apps/admin/components/workflows/workflow-payment-collection-config-fields.tsx`:

```tsx
"use client";

import { PaymentTypeConfig } from "@gooes/domain";
import type {
  WorkflowNodeConfig,
  WorkflowPaymentCollectionNodeConfig,
} from "@/components/workflows/workflow-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const WORKFLOW_PAYMENT_COLLECTION_OPTIONS = [
  "deposit",
  "stage_1",
  "stage_2",
  "stage_3",
  "add_on",
] as const;

export function getWorkflowPaymentCollectionLabel(
  paymentType: string | null | undefined,
) {
  if (!paymentType || paymentType === "refund") return "";
  return PaymentTypeConfig[paymentType as keyof typeof PaymentTypeConfig]?.label || "";
}

function parseOptionalPaymentAmount(value: string) {
  const normalized = value.trim();
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function WorkflowPaymentCollectionConfigFields({
  config,
  disabled,
  onChangeConfig,
}: {
  config: WorkflowNodeConfig;
  disabled?: boolean;
  onChangeConfig: (patch: Partial<WorkflowPaymentCollectionNodeConfig>) => void;
}) {
  const paymentConfig = config as WorkflowPaymentCollectionNodeConfig;

  return (
    <section className="space-y-3">
      <div>
        <div className="text-sm font-medium">收款配置</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          选择需要确认入账的款项，未入账时流程不能继续。
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-payment-type">收款类型</Label>
        <Select
          disabled={disabled}
          value={paymentConfig.payment_type || "deposit"}
          onValueChange={(value) =>
            onChangeConfig({
              payment_type: value as WorkflowPaymentCollectionNodeConfig["payment_type"],
            })
          }
        >
          <SelectTrigger id="workflow-node-payment-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORKFLOW_PAYMENT_COLLECTION_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {PaymentTypeConfig[value].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-payment-min-amount">最低已入账金额</Label>
        <Input
          id="workflow-node-payment-min-amount"
          type="number"
          min={0}
          value={paymentConfig.min_amount ?? ""}
          disabled={disabled}
          placeholder="为空时只要求存在已入账收款"
          onChange={(event) => {
            onChangeConfig({
              min_amount: parseOptionalPaymentAmount(event.target.value),
            });
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-payment-block-message">阻塞提示</Label>
        <Input
          id="workflow-node-payment-block-message"
          value={paymentConfig.block_message || ""}
          disabled={disabled}
          maxLength={200}
          placeholder="请先确认收款后再推进流程"
          onChange={(event) =>
            onChangeConfig({
              block_message: event.target.value.trim() || null,
            })
          }
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Render payment config fields**

In `apps/admin/components/workflows/workflow-node-config-fields.tsx`, import:

```ts
import { WorkflowPaymentCollectionConfigFields } from "@/components/workflows/workflow-payment-collection-config-fields";
```

Render after procedure fields:

```tsx
      {node.business_kind === "payment_collection" ? (
        <WorkflowPaymentCollectionConfigFields
          config={node.config}
          disabled={disabled}
          onChangeConfig={updateConfig}
        />
      ) : null}
```

- [ ] **Step 5: Add finance group to property panel**

In `apps/admin/components/workflows/workflow-property-panel.tsx`, update `nodePresetGroups`:

```ts
const nodePresetGroups: WorkflowNodePresetGroup[] = [
  "control",
  "business",
  "construction",
  "procedure",
  "finance",
  "approval",
  "system",
];
```

Import the label helper:

```ts
import { getWorkflowPaymentCollectionLabel } from "@/components/workflows/workflow-payment-collection-config-fields";
```

Inside `handleChangeConfig`, before `onChangeNode({ ...selectedNode, config });`, add:

```ts
    if (
      selectedNode.business_kind === "payment_collection" &&
      "payment_type" in config
    ) {
      const title = getWorkflowPaymentCollectionLabel(config.payment_type) ||
        selectedNode.title;
      onChangeNode({
        ...selectedNode,
        title,
        config,
      });
      return;
    }
```

- [ ] **Step 6: Add default config and validation**

In `apps/admin/components/workflows/workflow-designer-graph-utils.ts`, update `defaultConfig`:

```ts
function defaultConfig(
  nodeType: WorkflowNodeType,
  businessKind?: WorkflowNode["business_kind"],
): WorkflowNodeConfig {
  if (businessKind === "payment_collection") {
    return {
      payment_type: "deposit",
      min_amount: null,
      block_message: null,
    };
  }
  if (nodeType === "procedure") {
    return {
      stage_key: "",
      require_log: false,
      min_image_count: 0,
      trigger_acceptance: false,
      customer_visible: false,
    };
  }
  if (nodeType === "notification") {
    return {
      channels: ["todo"],
      recipient_rule: "owner",
      template: "请处理流程节点",
    };
  }
  return {};
}
```

Update the call site in `createNodeFromPreset`:

```ts
    config: preset?.config || defaultConfig(nodeType, preset?.businessKind || null),
```

Add validation inside `graph.nodes.forEach`:

```ts
    if (node.business_kind === "payment_collection") {
      const paymentType = "payment_type" in node.config ? node.config.payment_type : "";
      if (
        paymentType !== "deposit" &&
        paymentType !== "stage_1" &&
        paymentType !== "stage_2" &&
        paymentType !== "stage_3" &&
        paymentType !== "add_on"
      ) {
        issues.push({
          code: "payment_collection_type_required",
          message: "收款节点必须选择有效的收款类型",
          nodeKey: node.node_key,
        });
      }
      const minAmount = "min_amount" in node.config ? node.config.min_amount : null;
      if (typeof minAmount === "number" && minAmount < 0) {
        issues.push({
          code: "payment_collection_min_amount_invalid",
          message: "收款节点最低金额不能为负数",
          nodeKey: node.node_key,
        });
      }
    }
```

- [ ] **Step 7: Run admin check**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: Admin file-size and type checks pass.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
git add apps/admin/components/workflows/workflow-types.ts apps/admin/components/workflows/workflow-node-presets.ts apps/admin/components/workflows/workflow-payment-collection-config-fields.tsx apps/admin/components/workflows/workflow-node-config-fields.tsx apps/admin/components/workflows/workflow-property-panel.tsx apps/admin/components/workflows/workflow-designer-graph-utils.ts
git commit -m "feat(workflow): add admin payment collection node"
```

---

### Task 4: Apply Migration and Update Active Construction Flow

**Files:**
- No source file changes expected after migration creation.
- Runtime data change: active construction workflow definition in Supabase.

- [ ] **Step 1: Inspect pending migrations**

Run:

```bash
supabase migration list
```

Expected: local includes `20260610190000_add_payment_collection_workflow_index.sql`; remote does not yet include it before push.

- [ ] **Step 2: Apply migrations**

Run:

```bash
supabase db push
```

Expected: Supabase applies `20260610190000`.

- [ ] **Step 3: Verify migration alignment**

Run:

```bash
supabase migration list
```

Expected: Local and Remote both show `20260610190000` with no pending local migration.

- [ ] **Step 4: Restart API and admin if dev servers are stale**

If the existing dev servers do not pick up package/domain changes, restart:

```bash
pkill -f "apps/api.*src/app.ts" || true
pkill -f "next dev -p 3010" || true
bun run api:dev
pnpm --dir apps/admin dev
```

Expected: API is available at `http://127.0.0.1:3000`; admin is available at `http://127.0.0.1:3010`.

- [ ] **Step 5: Update active construction workflow through the API**

Use the authenticated admin session already used for workflow edits. Load definition `2c0e27d5-f296-41de-9653-16c5a4f961d8`, insert a node:

```json
{
  "node_key": "payment_stage_2",
  "node_type": "confirmation",
  "business_kind": "payment_collection",
  "title": "中期进度款",
  "description": "水电完工后确认中期进度款已入账。",
  "position": { "x": 840, "y": 260 },
  "config": {
    "payment_type": "stage_2",
    "min_amount": null,
    "block_message": "请先确认中期进度款已入账后再进入瓦工"
  },
  "sort_order": 45
}
```

Replace the existing edge `procedure_plumbing_electrical -> procedure_tiling` with:

```json
[
  {
    "source_node_key": "procedure_plumbing_electrical",
    "target_node_key": "payment_stage_2",
    "label": "确认收款",
    "condition": { "operator": "always" },
    "priority": 45
  },
  {
    "source_node_key": "payment_stage_2",
    "target_node_key": "procedure_tiling",
    "label": "进入瓦工",
    "condition": { "operator": "always" },
    "priority": 50
  }
]
```

Save draft and publish the definition.

- [ ] **Step 6: Clear test project runtime if it was created before the new graph**

If test project `2d710a84-1045-4750-8dfd-51a0f463a4db` already has workflow runtime instances, create a narrowly scoped cleanup migration and apply it. The migration must only delete workflow runtime rows for that project ID.

Use this SQL template with a timestamped filename:

```sql
-- Cleanup workflow runtime rows for the designated manual test project.
DELETE FROM public.workflow_tasks
WHERE instance_id IN (
  SELECT id FROM public.workflow_instances
  WHERE subject_type = 'project'
    AND subject_id = '2d710a84-1045-4750-8dfd-51a0f463a4db'
);

DELETE FROM public.workflow_instance_nodes
WHERE instance_id IN (
  SELECT id FROM public.workflow_instances
  WHERE subject_type = 'project'
    AND subject_id = '2d710a84-1045-4750-8dfd-51a0f463a4db'
);

DELETE FROM public.workflow_transition_logs
WHERE instance_id IN (
  SELECT id FROM public.workflow_instances
  WHERE subject_type = 'project'
    AND subject_id = '2d710a84-1045-4750-8dfd-51a0f463a4db'
);

DELETE FROM public.workflow_instances
WHERE subject_type = 'project'
  AND subject_id = '2d710a84-1045-4750-8dfd-51a0f463a4db';
```

Apply and verify migration alignment again if this cleanup migration is created.

---

### Task 5: End-to-End Verification

**Files:**
- No planned source changes.

- [ ] **Step 1: Run full checks**

Run:

```bash
bun run api:check
pnpm --dir apps/admin check
```

Expected: both commands pass.

- [ ] **Step 2: Verify node library in browser**

Open:

```text
http://127.0.0.1:3010/workflows/2c0e27d5-f296-41de-9653-16c5a4f961d8
```

Expected:

- Right-side or node-library area shows “财务节点”.
- “收款节点” is visible.
- “业务流转” no longer shows “定金”.
- Selecting a payment collection node shows收款类型、最低已入账金额、阻塞提示 fields.

- [ ] **Step 3: Verify graph publish state**

Use the workflow graph API or browser UI to confirm:

- Node `payment_stage_2` exists.
- `payment_stage_2.business_kind` is `payment_collection`.
- `payment_stage_2.config.payment_type` is `stage_2`.
- Edge chain is `procedure_plumbing_electrical -> payment_stage_2 -> procedure_tiling`.

- [ ] **Step 4: Verify runtime blocking**

For test project `2d710a84-1045-4750-8dfd-51a0f463a4db`, start the project workflow and advance to `payment_stage_2` without a confirmed `stage_2` payment.

Expected API result when completing `payment_stage_2`:

```json
{
  "code": "WORKFLOW_PAYMENT_COLLECTION_BLOCKED",
  "message": "请先确认中期进度款已入账后再进入瓦工"
}
```

- [ ] **Step 5: Verify confirmed payment unblocks**

Create or update a payment for the test project:

```json
{
  "project_id": "2d710a84-1045-4750-8dfd-51a0f463a4db",
  "amount": 1000,
  "type": "stage_2",
  "status": "confirmed"
}
```

Retry completing `payment_stage_2`.

Expected: workflow advances to `procedure_tiling`.

- [ ] **Step 6: Commit runtime cleanup migration if created**

If Task 4 Step 6 created a cleanup migration, commit it:

```bash
git add supabase/migrations/<timestamp>_cleanup_test_project_payment_collection_runtime.sql
git commit -m "chore(workflow): reset test project payment gate runtime"
```

- [ ] **Step 7: Final status**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: worktree clean except intentionally uncommitted runtime notes; latest commits include payment collection schema, runtime guard, admin node, and optional cleanup migration.
