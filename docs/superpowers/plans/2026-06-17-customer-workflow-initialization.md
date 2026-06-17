# Customer Workflow Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure newly assigned salespeople can continue customer workflow from the correct `potential -> following -> arrived -> designing` path.

**Architecture:** Keep owner assignment focused on owner changes and pending task reassignment. Fix the workflow source of truth by adding a real `potential` node to customer workflow runtime, action metadata, template, and backfill mapping. Existing customers without runtime are repaired through the existing backfill script, not by mutating data during read or assignment.

**Tech Stack:** Bun, TypeScript, Fastify services/controllers, Supabase workflow runtime, existing Bun tests.

---

## File Structure

- Modify: `apps/api/src/services/workflow-task-action-metadata.ts`
  - Add `potential -> start_following` customer task action mapping.
  - Allow `mark_invalid` from `potential` task nodes.
- Modify: `apps/api/src/services/workflow-task-action-metadata.test.ts`
  - Add regression tests for `potential` customer task actions.
- Modify: `apps/api/src/services/workflow-templates.ts`
  - Add `potential` business node to generated `customer_main` template.
  - Change the first edge to `start -> potential`, then `potential -> following`.
- Modify: `apps/api/src/scripts/workflow-runtime-backfill/plan.ts`
  - Map customer status `potential` to workflow node `potential`.
- Modify: `apps/api/src/scripts/workflow-runtime-backfill/plan.test.ts`
  - Update expected potential mapping and snapshot fixture.
- Create: `supabase/migrations/20260617173000_add_customer_potential_workflow_node.sql`
  - Create a new published customer_main workflow version for existing active definitions that lack `potential`.
  - Sync draft workflow nodes/edges so Admin does not republish the old graph.
- Create: `apps/api/src/scripts/customer-workflow-potential-migration-content.test.ts`
  - Guard the migration against losing the customer_main/potential checks and version switch.
- Modify: `apps/api/src/services/customer-workflow-runtime.ts`
  - Add a reusable method to start customer runtime at creation time without changing customer status.
- Modify: `apps/api/src/controllers/customer/index.ts`
  - After customer creation, call the new runtime initializer and sync subject state.
- Test: add/update focused tests only. Do not introduce new dependencies.

## Task 1: Customer Task Action Mapping

**Files:**
- Modify: `apps/api/src/services/workflow-task-action-metadata.ts`
- Modify: `apps/api/src/services/workflow-task-action-metadata.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test to `apps/api/src/services/workflow-task-action-metadata.test.ts`:

```ts
test("builds start_following action for customer potential node", () => {
  const actions = buildWorkflowTaskActions({
    subjectType: "customer",
    nodeKey: "potential",
    nodeType: "business",
    taskTitle: "潜在客户",
  });

  expect(actions).toEqual([
    {
      key: "complete",
      label: "开始跟进",
      business_domain: "customer_status",
      business_action: "start_following",
      requires_reason: false,
      output_fields: [],
    },
    {
      key: "mark_invalid",
      label: "作废客户",
      business_domain: "customer_status",
      business_action: "mark_invalid",
      requires_reason: true,
      output_fields: [],
    },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api
bun test src/services/workflow-task-action-metadata.test.ts
```

Expected: FAIL because `potential` currently has no `start_following` action.

- [ ] **Step 3: Implement minimal mapping**

Update `CUSTOMER_LINEAR_ACTION_BY_NODE`:

```ts
export const CUSTOMER_LINEAR_ACTION_BY_NODE: Partial<Record<string, CustomerStatusAction>> = {
  potential: "start_following",
  following: "mark_arrived",
  arrived: "start_design",
};
```

Update `buildCustomerActions` invalid-action list:

```ts
if (["potential", "following", "arrived", "designing"].includes(nodeKey)) {
  actions.push("mark_invalid");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/api
bun test src/services/workflow-task-action-metadata.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/workflow-task-action-metadata.ts apps/api/src/services/workflow-task-action-metadata.test.ts
git commit -m "fix(workflow): 补齐潜在客户任务动作"
```

## Task 2: Customer Main Template Potential Node

**Files:**
- Modify: `apps/api/src/services/workflow-templates.ts`

- [ ] **Step 1: Write the failing test**

If no template test exists, create `apps/api/src/services/workflow-templates.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { workflowTemplateService } from "./workflow-templates";

describe("workflowTemplateService customer_main", () => {
  test("creates customer_main with potential node before following", () => {
    const template = workflowTemplateService.getTemplateForTest({
      template_key: "customer_main",
    });

    expect(template.graph.nodes.map((node) => node.node_key)).toEqual([
      "start",
      "potential",
      "following",
      "arrived",
      "designing",
      "signed",
      "end",
    ]);
    expect(template.graph.edges.map((edge) => [
      edge.source_node_key,
      edge.target_node_key,
      edge.label,
    ])).toContainEqual(["potential", "following", "开始跟进"]);
  });
});
```

Add this test-only method if needed:

```ts
getTemplateForTest(input: WorkflowTemplateCreateInput) {
  return this.getTemplate(input);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api
bun test src/services/workflow-templates.test.ts
```

Expected: FAIL because the template currently starts at `following`.

- [ ] **Step 3: Update template**

In `buildCustomerMainTemplate`, insert this node after `start`:

```ts
{
  node_key: "potential",
  node_type: "business",
  business_kind: "customer_lead",
  title: "潜在客户",
  description: "对应客户状态：潜在客户。",
  position: { x: 300, y: 180 },
  config: { required_permissions: ["customer.update"] },
  sort_order: 20,
}
```

Move the existing node positions and sort orders one step to the right. Replace edges with:

```ts
this.edge("start", "potential", "登记客户", 10),
this.edge("potential", "following", "开始跟进", 20),
this.edge("following", "arrived", "标记到店", 30),
this.edge("arrived", "designing", "开始设计", 40),
this.edge("designing", "signed", "客户签约", 50),
this.edge("signed", "end", "流程完成", 60),
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/api
bun test src/services/workflow-templates.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/workflow-templates.ts apps/api/src/services/workflow-templates.test.ts
git commit -m "fix(workflow): 客户主流程增加潜在节点"
```

## Task 3: Backfill Mapping

**Files:**
- Modify: `apps/api/src/scripts/workflow-runtime-backfill/plan.ts`
- Modify: `apps/api/src/scripts/workflow-runtime-backfill/plan.test.ts`

- [ ] **Step 1: Write the failing test**

Update the snapshot fixture in `plan.test.ts` to include:

```ts
{
  id: "node-potential",
  node_key: "potential",
  node_type: "business",
  business_kind: "customer_lead",
  title: "潜在客户",
  config: { required_permissions: ["customer.update"] },
},
```

Change the potential mapping expectation:

```ts
expect(plan.nodeKey).toBe("potential");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api
bun test src/scripts/workflow-runtime-backfill/plan.test.ts
```

Expected: FAIL because `potential` currently maps to `following`.

- [ ] **Step 3: Update mapping**

In `CUSTOMER_STATUS_NODE_MAP`, change:

```ts
potential: { nodeKey: "potential", instanceStatus: "running" },
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/api
bun test src/scripts/workflow-runtime-backfill/plan.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts/workflow-runtime-backfill/plan.ts apps/api/src/scripts/workflow-runtime-backfill/plan.test.ts
git commit -m "fix(workflow): 修正潜在客户回填节点"
```

## Task 3.5: Existing Active Customer Workflow Migration

**Files:**
- Create: `supabase/migrations/20260617173000_add_customer_potential_workflow_node.sql`
- Create: `apps/api/src/scripts/customer-workflow-potential-migration-content.test.ts`

- [x] **Step 1: Write the failing migration content test**

The test reads the migration file and asserts it:

```ts
expect(migration).toContain("definition.workflow_key = 'customer_main'");
expect(migration).toContain("node->>'node_key' = 'potential'");
expect(migration).toContain("node->>'node_key' = 'following'");
expect(migration).toContain("INSERT INTO public.workflow_versions");
expect(migration).toContain("SET active_version_id = v_new_version_id");
expect(migration).toContain("INSERT INTO public.workflow_nodes");
expect(migration).toContain("INSERT INTO public.workflow_edges");
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api
bun test src/scripts/customer-workflow-potential-migration-content.test.ts
```

Expected before migration exists: FAIL with `ENOENT`.

- [x] **Step 3: Add migration**

The migration must:

```text
1. Find active workflow_definitions where workflow_key = 'customer_main'.
2. Skip definitions whose active snapshot already has node_key = potential.
3. Build a new snapshot with potential inserted between start and following.
4. Insert a new workflow_versions row instead of mutating the old published version.
5. Update workflow_definitions.active_version_id to the new version.
6. Insert/update draft workflow_nodes and workflow_edges for Admin designer consistency.
```

- [x] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/api
bun test src/scripts/customer-workflow-potential-migration-content.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260617173000_add_customer_potential_workflow_node.sql \
  apps/api/src/scripts/customer-workflow-potential-migration-content.test.ts \
  docs/superpowers/plans/2026-06-17-customer-workflow-initialization.md
git commit -m "fix(workflow): 迁移补齐客户潜在节点"
```

## Task 4: New Customer Runtime Initialization

**Files:**
- Modify: `apps/api/src/services/customer-workflow-runtime.ts`
- Modify: `apps/api/src/controllers/customer/index.ts`
- Test: create/update focused service/controller test if existing controller tests are unavailable.

- [ ] **Step 1: Write failing service test**

Create `apps/api/src/services/customer-workflow-runtime.test.ts` with a mock for `workflowRepository.startRuntimeInstance`. Test:

```ts
test("starts customer runtime without changing status for newly created potential customer", async () => {
  const result = await customerWorkflowRuntimeService.syncCustomerCreated({
    authContext,
    tenantId: "tenant-1",
    customerId: "customer-1",
  });

  expect(startRuntimeInstance).toHaveBeenCalledWith(expect.objectContaining({
    tenantId: "tenant-1",
    subjectType: "customer",
    subjectId: "customer-1",
    startedBy: "employee-1",
    context: expect.objectContaining({
      source: "customer_create",
      customer_id: "customer-1",
    }),
  }));
  expect(result.status).toBe("started");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api
bun test src/services/customer-workflow-runtime.test.ts
```

Expected: FAIL because `syncCustomerCreated` does not exist.

- [ ] **Step 3: Implement runtime initializer**

Add a public method to `CustomerWorkflowRuntimeService`:

```ts
async syncCustomerCreated(input: {
  authContext: AuthContext;
  tenantId: string;
  customerId: string;
}): Promise<CustomerWorkflowRuntimeMetadata> {
  try {
    const definition = await this.findActiveCustomerWorkflow(input.tenantId);
    if (!definition) {
      return { status: "skipped", reason: "active_customer_workflow_not_found" };
    }

    const existing = await this.findRunningCustomerInstance(input, definition.id);
    if (existing) {
      return {
        status: "skipped",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        instance_id: existing.id,
        current_node_key: existing.current_node_key,
        reason: "running_instance_exists",
      };
    }

    const result = await workflowRepository.startRuntimeInstance({
      tenantId: input.tenantId,
      definitionId: definition.id,
      subjectType: "customer",
      subjectId: input.customerId,
      startedBy: input.authContext.employeeId,
      context: {
        source: "customer_create",
        customer_id: input.customerId,
        operator_employee_id: input.authContext.employeeId ?? null,
        operator_auth_user_id: input.authContext.authUserId ?? null,
      },
    });

    if (!result.ok) {
      return {
        status: "failed",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        reason: result.reason,
      };
    }

    return {
      status: "started",
      workflow_key: definition.workflow_key,
      definition_id: definition.id,
      instance_id: result.instance.id,
      current_node_key: result.instance.current_node_key,
    };
  } catch (error) {
    return {
      status: "failed",
      reason: "exception",
      error_message: this.getErrorMessage(error),
    };
  }
}
```

- [ ] **Step 4: Wire customer create**

In `apps/api/src/controllers/customer/index.ts`, after `customerCoreService.createCustomer(payload)` succeeds, call:

```ts
const workflowRuntimeMetadata =
  await customerWorkflowRuntimeService.syncCustomerCreated({
    authContext,
    tenantId: authContext.tenantId,
    customerId: customer.id,
  });
if (workflowRuntimeMetadata.instance_id && workflowRuntimeMetadata.definition_id) {
  await workflowSubjectStateService.syncFromRuntimeInstance({
    tenantId: authContext.tenantId,
    subjectType: "customer",
    subjectId: customer.id,
    definitionId: workflowRuntimeMetadata.definition_id,
    instanceId: workflowRuntimeMetadata.instance_id,
  });
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd apps/api
bun test src/services/customer-workflow-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/customer-workflow-runtime.ts apps/api/src/services/customer-workflow-runtime.test.ts apps/api/src/controllers/customer/index.ts
git commit -m "fix(customer): 新建客户同步初始化流程"
```

## Task 5: Historical Customer Repair And Acceptance

**Files:**
- Modify or create: `docs/state_machine_migrate/audit/2026-06-17-customer-workflow-initialization.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd apps/api
bun test \
  src/services/workflow-task-action-metadata.test.ts \
  src/services/workflow-templates.test.ts \
  src/scripts/workflow-runtime-backfill/plan.test.ts \
  src/services/customer-workflow-runtime.test.ts \
  src/services/customer-owner-assignments.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run static verification**

Run:

```bash
cd apps/api
bun run typecheck
bun run build
bun run check:file-size
cd ../..
git diff --check
```

Expected: all exit 0.

- [ ] **Step 3: Backfill dry run for target tenant**

Run:

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local \
  src/scripts/backfill-workflow-runtime-from-state-machine.ts \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b \
  --dry-run \
  --report /Users/leefo/Public/work/gooes/docs/state_machine_migrate/audit/2026-06-17-customer-workflow-initialization-dry-run.md
```

Expected: potential customers map to `potential`, not `following`.

- [ ] **Step 4: Apply backfill only after dry-run review**

Run:

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local \
  src/scripts/backfill-workflow-runtime-from-state-machine.ts \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b \
  --apply \
  --report /Users/leefo/Public/work/gooes/docs/state_machine_migrate/audit/2026-06-17-customer-workflow-initialization-apply.md
```

Expected: missing customer workflow instances are created at their status-aligned nodes.

- [ ] **Step 5: Manual acceptance path**

Use manager `cc086608-c436-4753-a8f2-a6b6660056f8` and salesperson `80a9c2ff-9bbb-444b-af9c-0594f5116ff7`:

```text
1. Manager creates or opens a potential customer.
2. Manager assigns owner to salesperson.
3. Salesperson opens task center with status=pending.
4. Salesperson sees customer workflow task at current_node_key=potential.
5. Salesperson completes task with action=complete.
6. Customer status becomes following.
7. Workflow advances to following and next task remains assigned to salesperson.
```

- [ ] **Step 6: Record acceptance**

Create `docs/state_machine_migrate/audit/2026-06-17-customer-workflow-initialization.md` with:

```md
# Customer Workflow Initialization Acceptance

## Verification

- `bun test ...`: passed
- `bun run typecheck`: passed
- `bun run build`: passed
- `bun run check:file-size`: passed
- `git diff --check`: passed

## Backfill

- dry-run report: `docs/state_machine_migrate/audit/2026-06-17-customer-workflow-initialization-dry-run.md`
- apply report: `docs/state_machine_migrate/audit/2026-06-17-customer-workflow-initialization-apply.md`

## Manual Path

- manager assignment: passed
- salesperson pending task visibility: passed
- workflow task completion: passed
- customer status and workflow state alignment: passed
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src docs/state_machine_migrate/audit docs/superpowers/plans/2026-06-17-customer-workflow-initialization.md
git commit -m "fix(workflow): 初始化客户潜在流程"
```

## Self-Review

- Spec coverage: covers action mapping, template, backfill mapping, new customer runtime initialization, historical repair, and manual acceptance.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: uses existing `customer_main`, `potential`, `start_following`, `workflow_tasks`, `workflow_subject_states`, and backfill script names.
- Scope: excludes owner assignment logic except as acceptance input because that was already implemented in the previous change.
