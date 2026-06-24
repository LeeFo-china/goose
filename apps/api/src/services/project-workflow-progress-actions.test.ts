import { describe, expect, test } from "bun:test";
import { buildProjectWorkflowProgressProjection } from "./project-workflow-progress";
import type { ProcedureAssignmentRow } from "@/services/project-procedure-assignments";

const woodworkNode = {
  id: "node-woodwork",
  node_key: "procedure_woodwork",
  title: "木工",
  node_type: "procedure",
  business_kind: "procedure_template",
  config: { stage_key: "woodwork" },
};

const woodworkAssignment: ProcedureAssignmentRow = {
  id: "assignment-woodwork",
  tenant_id: "tenant-1",
  project_id: "project-1",
  workflow_instance_id: "instance-1",
  workflow_instance_node_id: "instance-node-woodwork",
  node_key: "procedure_woodwork",
  stage_code: "woodwork",
  assignee_employee_id: "employee-worker",
  planned_start_date: "2026-06-24",
  planned_duration_days: 1,
  planned_end_date: "2026-06-24",
  status: "in_progress",
  started_by_employee_id: "employee-manager",
  started_at: "2026-06-24T00:00:00.000Z",
  completed_by_employee_id: null,
  completed_at: null,
  adjusted_by_employee_id: null,
  adjusted_at: null,
  adjust_reason: null,
  created_at: "2026-06-24T00:00:00.000Z",
  updated_at: "2026-06-24T00:00:00.000Z",
  assignee_employee: { id: "employee-worker", name: "韦小宝", avatar: null },
};

describe("project workflow progress actions", () => {
  test("keeps top-level procedure actions aligned with assignment-enriched timeline actions", () => {
    const progress = buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "procedure_woodwork",
        current_node_title: "木工",
        current_business_kind: "procedure_template",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "procedure_woodwork",
        current_node_snapshot: woodworkNode,
      },
      graph: {
        definition: { workflow_key: "construction_main", category: "construction" },
        nodes: [woodworkNode],
        edges: [],
      },
      pendingActions: [{
        key: "start_procedure",
        label: "开始木工",
        business_domain: "project_procedure",
        business_action: "start_procedure",
        task_id: "task-woodwork",
        node_key: "procedure_woodwork",
        node_type: "procedure",
        disabled: false,
      }],
      procedureAssignments: [woodworkAssignment],
      tenantToday: "2026-06-24",
    });

    const actionKeys = progress.actions.map((action) => action.key) as string[];
    const currentNodeActionKeys = (progress.timeline_nodes
      .find((node) => node.node_key === "procedure_woodwork")
      ?.actions.map((action) => action.key) ?? []) as string[];

    expect(actionKeys).toEqual([
      "complete_procedure",
      "adjust_procedure_schedule",
    ]);
    expect(currentNodeActionKeys).toEqual(actionKeys);
  });
});
