# Workflow Node Contract V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose workflow timeline nodes as backend-owned display, attributes, and actions so the mini-program no longer infers workflow behavior from legacy stage fields.

**Architecture:** Keep workflow runtime unchanged and enhance the API projection layer. `project-workflow-progress.ts` builds base node contract from workflow graph and pending task actions; employee project detail bootstrap enriches those nodes with construction stage acceptance state after `construction_stages` is calculated.

**Tech Stack:** Bun test, TypeScript, Fastify API services, existing workflow repositories and bootstrap orchestration.

---

## File Structure

- Modify: `apps/api/src/services/project-workflow-progress.ts`
  - Extend `WorkflowTimelineNode`.
  - Build `display`, `attributes`, and per-node `actions`.
  - Export pure enrich helpers for construction stage acceptance state.
- Modify: `apps/api/src/services/project-workflow-progress.test.ts`
  - Add projection tests for base node contract and acceptance enrichment.
- Modify: `apps/api/src/services/employee-project-detail-bootstrap/legacy/orchestration.ts`
  - Enrich `workflow_progress` and `workflow_state.timeline_nodes` with `construction_stages`.
- Modify: `apps/api/src/services/employee-project-detail-bootstrap/legacy/shared.ts`
  - Allow `workflow_state.timeline_nodes` in the local type.
- Create: `docs/state_machine_migrate/2026-06-18-workflow-node-contract-v2-miniprogram-handoff.md`
  - Tell orange how to consume node `display/attributes/actions`.

## Task 1: Base Timeline Node Contract

**Files:**
- Modify: `apps/api/src/services/project-workflow-progress.test.ts`
- Modify: `apps/api/src/services/project-workflow-progress.ts`

- [ ] **Step 1: Write failing test**

Add a test to `project-workflow-progress.test.ts`:

```ts
test("adds display attributes and actions to workflow timeline nodes", () => {
  const progress = buildProjectWorkflowProgressProjection({
    subjectState: {
      instance_id: "instance-1",
      instance_status: "running",
      current_node_key: "procedure_plumbing_electrical",
      current_node_title: "水电",
      current_business_kind: "procedure_template",
      pending_task_count: 1,
    },
    runtimeInstance: {
      id: "instance-1",
      status: "running",
      current_node_key: "procedure_plumbing_electrical",
      current_node_snapshot: {
        ...graph.nodes[0],
        config: {
          stage_key: "plumbing_electrical",
          require_log: true,
          min_image_count: 3,
          trigger_acceptance: true,
        },
      },
    },
    graph: {
      nodes: [
        {
          ...graph.nodes[0],
          config: {
            stage_key: "plumbing_electrical",
            require_log: true,
            min_image_count: 3,
            trigger_acceptance: true,
          },
        },
        ...graph.nodes.slice(1),
      ],
      edges: graph.edges,
    },
    pendingActions: [{
      task_id: "task-1",
      key: "complete",
      label: "水电施工",
      node_key: "procedure_plumbing_electrical",
      node_type: "procedure",
      business_domain: null,
      business_action: null,
      requires_reason: false,
      disabled: false,
      output_fields: [{
        name: "project_log_id",
        label: "施工日志",
        type: "project_log",
        required: true,
        stage_code: "plumbing_electrical",
        min_image_count: 3,
      }],
    }],
  });

  expect(progress.timeline_nodes[0]).toMatchObject({
    display: {
      label: "水电",
      status_label: "当前",
      status_variant: "default",
    },
    attributes: {
      stage_code: "plumbing_electrical",
      require_log: true,
      min_image_count: 3,
      acceptance_enabled: true,
      acceptance_required: true,
    },
    actions: [{
      key: "complete",
      label: "水电施工",
      task_id: "task-1",
    }],
  });
});
```

- [ ] **Step 2: Run red test**

Run:

```bash
cd apps/api && bun test src/services/project-workflow-progress.test.ts
```

Expected: the new test fails because `display`, `attributes`, and `actions` are missing.

- [ ] **Step 3: Implement minimal contract fields**

In `project-workflow-progress.ts`:

- Add `WorkflowTimelineNodeDisplay`, `WorkflowTimelineNodeAttributes`,
  and `WorkflowTimelineNodeAction` types.
- Add `display`, `attributes`, and `actions` to `WorkflowTimelineNode`.
- Group `pendingActions` by `node_key` and attach them in `buildWorkflowTimelineNodes`.
- Build node attributes from `node.config`.

- [ ] **Step 4: Run green test**

Run:

```bash
cd apps/api && bun test src/services/project-workflow-progress.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/project-workflow-progress.ts apps/api/src/services/project-workflow-progress.test.ts
git commit -m "feat(workflow): 增加节点展示属性动作契约"
```

## Task 2: Acceptance State Enrichment

**Files:**
- Modify: `apps/api/src/services/project-workflow-progress.test.ts`
- Modify: `apps/api/src/services/project-workflow-progress.ts`

- [ ] **Step 1: Write failing test for enabled acceptance**

Add a test:

```ts
test("marks completed acceptance-enabled procedure as pending acceptance", () => {
  const progress = buildProjectWorkflowProgressProjection({
    subjectState: {
      instance_id: "instance-1",
      instance_status: "running",
      current_node_key: "procedure_tiling",
      current_node_title: "瓦工",
      current_business_kind: "procedure_template",
      pending_task_count: 1,
    },
    runtimeInstance: {
      id: "instance-1",
      status: "running",
      current_node_key: "procedure_tiling",
      current_node_snapshot: graph.nodes[2],
    },
    graph: {
      nodes: [{
        ...graph.nodes[0],
        config: {
          stage_key: "plumbing_electrical",
          require_log: true,
          min_image_count: 3,
          trigger_acceptance: true,
        },
      }, ...graph.nodes.slice(1)],
      edges: graph.edges,
    },
    completedNodeKeys: ["procedure_plumbing_electrical"],
    pendingActions: [],
  });

  const enriched = enrichProjectWorkflowProgressWithConstructionStages(progress, {
    stages: [{
      stage_code: "plumbing_electrical",
      stage_label: "水电",
      acceptance_id: null,
      acceptance_status: null,
      acceptance_action: {
        type: "create",
        label: "发起验收",
        enabled: true,
        reason: null,
      },
    }],
  });

  expect(enriched.timeline_nodes[0]).toMatchObject({
    status: "blocked",
    display: {
      status_label: "待验收",
      status_variant: "warning",
    },
    attributes: {
      acceptance_enabled: true,
      acceptance_required: true,
      acceptance_id: null,
      acceptance_status: null,
    },
    actions: [{
      key: "create_acceptance",
      label: "发起验收",
      business_domain: "project_acceptance",
      business_action: "create",
      disabled: false,
      stage_code: "plumbing_electrical",
    }],
  });
});
```

- [ ] **Step 2: Write failing test for disabled acceptance**

Add a test:

```ts
test("does not add acceptance action when procedure acceptance is disabled", () => {
  const progress = buildProjectWorkflowProgressProjection({
    subjectState: {
      instance_id: "instance-1",
      instance_status: "running",
      current_node_key: "procedure_tiling",
      current_node_title: "瓦工",
      current_business_kind: "procedure_template",
      pending_task_count: 1,
    },
    runtimeInstance: {
      id: "instance-1",
      status: "running",
      current_node_key: "procedure_tiling",
      current_node_snapshot: graph.nodes[2],
    },
    graph,
    completedNodeKeys: ["procedure_plumbing_electrical"],
    pendingActions: [],
  });

  const enriched = enrichProjectWorkflowProgressWithConstructionStages(progress, {
    stages: [{
      stage_code: "plumbing_electrical",
      stage_label: "水电",
      acceptance_id: null,
      acceptance_status: null,
      acceptance_action: {
        type: "create",
        label: "发起验收",
        enabled: true,
        reason: null,
      },
    }],
  });

  expect(enriched.timeline_nodes[0].status).toBe("done");
  expect(enriched.timeline_nodes[0].attributes.acceptance_enabled).toBe(false);
  expect(enriched.timeline_nodes[0].actions).toEqual([]);
});
```

- [ ] **Step 3: Run red tests**

Run:

```bash
cd apps/api && bun test src/services/project-workflow-progress.test.ts
```

Expected: tests fail because the enrich helper does not exist.

- [ ] **Step 4: Implement enrichment**

In `project-workflow-progress.ts`:

- Export `enrichProjectWorkflowProgressWithConstructionStages`.
- Export `enrichWorkflowTimelineNodesWithConstructionStages`.
- Match construction stage rows by `attributes.stage_code`.
- Only generate acceptance actions when `attributes.acceptance_enabled === true`.
- Convert `acceptance_action.type=create|edit|view` into
  `create_acceptance|edit_acceptance|view_acceptance`.
- For completed acceptance-enabled nodes with `acceptance_status !== "customer_confirmed"`,
  set `status = "blocked"` and `display.status_label = "待验收"` or the best available
  acceptance status label.

- [ ] **Step 5: Run green tests**

Run:

```bash
cd apps/api && bun test src/services/project-workflow-progress.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/project-workflow-progress.ts apps/api/src/services/project-workflow-progress.test.ts
git commit -m "feat(workflow): 增强工序验收节点契约"
```

## Task 3: Bootstrap Integration

**Files:**
- Modify: `apps/api/src/services/employee-project-detail-bootstrap/legacy/orchestration.ts`
- Modify: `apps/api/src/services/employee-project-detail-bootstrap/legacy/shared.ts`
- Test: existing bootstrap tests if available, plus `project-workflow-progress.test.ts`

- [ ] **Step 1: Write failing bootstrap unit or service test**

If existing bootstrap tests can instantiate the service cheaply, assert:

```ts
expect(response.workflow_progress.timeline_nodes[0].attributes.acceptance_enabled).toBe(true);
expect(response.workflow_state?.timeline_nodes?.[0].attributes.acceptance_enabled).toBe(true);
```

If the existing bootstrap harness is too broad, skip adding a new heavy test and rely on the pure
enrichment tests from Task 2 plus typecheck.

- [ ] **Step 2: Integrate enrichment**

In `orchestration.ts`:

```ts
const enrichedWorkflowProgress = enrichProjectWorkflowProgressWithConstructionStages(
  workflowProgress,
  constructionStages,
);
const enrichedWorkflowState = workflowState && "timeline_nodes" in workflowState
  ? {
    ...workflowState,
    timeline_nodes: enrichWorkflowTimelineNodesWithConstructionStages(
      Array.isArray(workflowState.timeline_nodes) ? workflowState.timeline_nodes : [],
      constructionStages,
    ),
  }
  : workflowState;
```

Return `enrichedWorkflowProgress` and `enrichedWorkflowState`.

- [ ] **Step 3: Run verification**

Run:

```bash
cd apps/api && bun test src/services/project-workflow-progress.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

Expected: tests and typecheck pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/employee-project-detail-bootstrap/legacy/orchestration.ts apps/api/src/services/employee-project-detail-bootstrap/legacy/shared.ts
git commit -m "feat(workflow): 在项目详情返回节点契约"
```

## Task 4: Mini-Program Handoff Doc

**Files:**
- Create: `docs/state_machine_migrate/2026-06-18-workflow-node-contract-v2-miniprogram-handoff.md`

- [ ] **Step 1: Write handoff doc**

Document:

- `workflow_progress.timeline_nodes[]` is the order source.
- `node.display` is the display source.
- `node.attributes` is the capability source.
- `node.actions` is the interaction source.
- `construction_stages` is read-only compatibility data.
- `acceptance_enabled=false` means no acceptance entry.
- `acceptance_enabled=true` means acceptance is part of node business closure.

- [ ] **Step 2: Run doc checks**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 3: Commit**

```bash
git add docs/state_machine_migrate/2026-06-18-workflow-node-contract-v2-miniprogram-handoff.md
git commit -m "docs(workflow): 说明节点契约v2对接"
```

## Task 5: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run related tests**

```bash
cd apps/api && bun test src/services/workflow-publish-graph.test.ts src/services/workflow-publish-graph-connectivity.test.ts src/services/project-workflow-progress.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run type checks**

```bash
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/admin exec tsc -p tsconfig.json --noEmit
```

Expected: both commands exit 0.

- [ ] **Step 3: Run repository guards**

```bash
bun scripts/check-api-file-size.ts
pnpm --dir apps/admin run check:file-size
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Confirm clean worktree**

```bash
git status --short
```

Expected: no output.
