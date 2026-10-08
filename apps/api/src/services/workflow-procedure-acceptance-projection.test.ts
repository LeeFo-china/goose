import { expect, test } from "bun:test";
import { buildWorkflowTaskActionsForTask } from "./workflow-task-actions";
import { buildWorkflowTimelineNodeContract, enrichWorkflowTimelineNodesWithConstructionStages } from "./project-workflow-timeline-contract";
import { buildProjectWorkflowProgressProjection, enrichProjectWorkflowProgressWithConstructionStages } from "./project-workflow-progress";

const node = { id: "node-1", node_key: "plumbing", node_type: "procedure" as const, title: "水电",
  business_kind: "procedure_template", config: { stage_key: "plumbing_electrical",
    trigger_acceptance: true, require_procedure_assignment: false } };
const task = { id: "task-1", instance_id: "instance-1", instance_node_id: "run-1",
  node_id: "node-1", node_key: "plumbing", node_type: "procedure" as const, title: "水电",
  status: "pending" as const, created_at: "2026-10-08T00:00:00Z", assignee_employee_id: null,
  assignee_role_code: null, assignee_permission_code: null,
  instance: { id: "instance-1", subject_type: "project" as const, subject_id: "project-1",
    status: "running" as const, current_node_key: "plumbing", current_node_snapshot: node } };

test("an acceptance procedure without assignment can finish construction", async () => {
  const actions = await buildWorkflowTaskActionsForTask({ tenantId: "tenant-1", subjectType: "project", task });
  expect(actions.map(({ key }) => key)).toEqual(["complete_procedure"]);
});

test("runtime output reaches current timeline and top-level acceptance actions without an assignment", () => {
  const progress = buildProjectWorkflowProgressProjection({ subjectState: null,
    runtimeInstance: { id: "instance-1", status: "running", current_node_key: node.node_key,
      current_node_snapshot: node },
    graph: { definition: { workflow_key: "construction_main", category: "construction" }, nodes: [node], edges: [] },
    runtimeNodeOutputs: [{ node_key: node.node_key, output: { procedure_completed: true } }],
    pendingActions: [{ key: "complete_procedure", label: "水电", node_key: node.node_key,
      business_domain: "project_procedure", business_action: "complete_procedure", task_id: "task-1" }],
  });
  const enriched = enrichProjectWorkflowProgressWithConstructionStages(progress, { stages: [{
    stage_code: "plumbing_electrical", acceptance_action: { type: "create", enabled: false, reason: "无验收权限" },
  }] });
  expect(enriched.current_node_key).toBe("plumbing");
  expect(enriched.actions).toMatchObject([{ key: "create_acceptance", disabled: true }]);
  expect(enriched.timeline_nodes[0]).toMatchObject({ status: "current",
    display: { status_label: "待验收" }, attributes: { procedure_completed: true } });
});

test("trusted runtime completion hides repeated finish and dispatch actions", async () => {
  const waitingTask = { ...task, instance_node: { procedure_completed: true },
    instance: { ...task.instance, current_node_snapshot: { ...node,
      config: { ...node.config, require_procedure_assignment: true } } } };
  const actions = await buildWorkflowTaskActionsForTask({ tenantId: "tenant-1", subjectType: "project", task: waitingTask });
  expect(actions).toEqual([]);
});

test.each(["create", "edit", "view"])("current completed procedure exposes %s acceptance without advancing", (type) => {
  const timeline = buildWorkflowTimelineNodeContract({ node, status: "current",
    procedureCompleted: true,
    actions: [{ key: "complete_procedure", label: "完工", business_domain: "project_procedure",
      business_action: "complete_procedure", task_id: "task-1", disabled: false }] });
  const [result] = enrichWorkflowTimelineNodesWithConstructionStages([timeline], { stages: [{
    stage_code: "plumbing_electrical", acceptance_id: type === "create" ? null : "acceptance-1",
    acceptance_status: type === "create" ? null : "draft",
    acceptance_action: { type, label: "处理验收", enabled: true },
  }] });
  expect(result).toMatchObject({ status: "current", attributes: { procedure_completed: true },
    actions: [{ key: `${type}_acceptance`, business_domain: "project_acceptance" }] });
});
