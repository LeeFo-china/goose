import { describe, expect, test } from "bun:test";
import { buildWorkflowTimelineNodeContract } from "./project-workflow-timeline-contract";
import { buildWorkflowTimelineNodes } from "./project-workflow-progress";
import { serializeGanttNode } from "./tenant-owner-gantt-node";

const node = { node_key: "started", title: "确认开工", node_type: "construction_stage", business_kind: "construction_start", config: {} };
const completedAt = "2026-10-09T05:32:45.915399Z";

describe("gantt completion metadata", () => {
  test("generic timeline map retains actorless completion evidence", () => {
    const result = buildWorkflowTimelineNodes({
      graph: { definition: { workflow_key: "construction", category: "construction" }, nodes: [{ ...node, id: "node-1" }], edges: [] },
      currentNodeKey: "end", completedNodeKeys: ["started"],
      completedNodeActors: [{ node_key: "started", completed_at: completedAt }],
    });
    expect(result[0]?.actual_completed_at).toBe(completedAt);
    expect(result[0]?.completion_actor_type).toBe("unknown");
  });
  test("keeps operator separate from assignee and completion separate from plan", () => {
    const result = serializeGanttNode(buildWorkflowTimelineNodeContract({
      node, status: "done", assignee: { node_key: "started", assignee_employee_id: "owner", assignee_employee_name: "唐僧" },
      completion: { node_key: "started", started_at: "2026-10-09T05:32:36Z", completed_at: completedAt, completed_by_employee_id: "operator", completed_by_employee_name: "风清扬" },
    }));
    expect(result).toMatchObject({ actual_completed_at: completedAt, actual_started_at: "2026-10-09T05:32:36Z", completed_by_employee_id: "operator", completed_by_employee_name: "风清扬", completion_actor_type: "employee", assignee_employee_name: "唐僧", planned_start_date: null, planned_end_date: null, schedule_applicable: false, assignment_applicable: false, schedule_status: "unscheduled" });
  });
  test("real plan dates are preserved independently of completion", () => {
    const timeline = buildWorkflowTimelineNodeContract({ node, status: "done", completion: { node_key: "started", completed_at: completedAt } });
    const result = serializeGanttNode({ ...timeline, attributes: { planned_start_date: "2026-10-01", planned_end_date: "2026-10-03", schedule_status: "completed" } });
    expect(result).toMatchObject({ planned_start_date: "2026-10-01", planned_end_date: "2026-10-03", actual_completed_at: completedAt, schedule_status: "done" });
  });
  test("active node has activation time without completion evidence", () => {
    const result = serializeGanttNode(buildWorkflowTimelineNodeContract({ node, status: "current", completion: { node_key: "started", started_at: "2026-10-09T05:32:36Z" } }));
    expect(result).toMatchObject({ actual_started_at: "2026-10-09T05:32:36Z", actual_completed_at: null, completed_by_employee_id: null, completion_actor_type: "unknown" });
  });
  test("missing employee evidence preserves completion time without inventing system actor", () => {
    const result = serializeGanttNode(buildWorkflowTimelineNodeContract({ node, status: "done", completion: { node_key: "started", completed_at: completedAt } }));
    expect(result).toMatchObject({ actual_completed_at: completedAt, completed_by_employee_id: null, completed_by_employee_name: null, completion_actor_type: "unknown" });
  });
  test("explicit system completion retains time", () => {
    const result = serializeGanttNode(buildWorkflowTimelineNodeContract({ node, status: "done", completion: { node_key: "started", completed_at: completedAt, completion_actor_type: "system" } }));
    expect(result.completion_actor_type).toBe("system");
    expect(result.actual_completed_at).toBe(completedAt);
  });
  test("unresolved employee keeps ID without synthesizing name", () => {
    const result = serializeGanttNode(buildWorkflowTimelineNodeContract({ node, status: "done", completion: { node_key: "started", completed_at: completedAt, completed_by_employee_id: "deleted" } }));
    expect(result.completed_by_employee_name).toBeNull();
    expect(result.completed_by_employee_id).toBe("deleted");
  });
  test.each([ ["procedure", {}, true], ["procedure", { require_procedure_assignment: false }, false], ["legacy", {}, null], [null, {}, null] ] as const)("uses node capability %s %j", (nodeType, config, expected) => {
    const result = serializeGanttNode(buildWorkflowTimelineNodeContract({ node: { ...node, node_type: nodeType, config }, status: "pending" }));
    expect(result.schedule_applicable).toBe(expected);
    expect(result.assignment_applicable).toBe(expected);
    expect(result.actual_completed_at).toBeNull();
  });
  test("blocked acceptance does not expose premature node completion", () => {
    const timeline = buildWorkflowTimelineNodeContract({ node, status: "done", completion: { node_key: "started", completed_at: completedAt, completed_by_employee_id: "operator" } });
    const result = serializeGanttNode({ ...timeline, status: "blocked" });
    expect(result.actual_completed_at).toBeNull();
    expect(result.completed_by_employee_id).toBeNull();
  });
});
