import { describe, expect, test } from "bun:test";
import {
  buildProjectWorkflowProgressProjection,
  enrichProjectWorkflowProgressWithConstructionStages,
} from "./project-workflow-progress";
import type { ProcedureAssignmentRow } from "@/services/project-procedure-assignments";

const woodworkNode = {
  id: "node-woodwork",
  node_key: "procedure_woodwork",
  title: "木工",
  node_type: "procedure",
  business_kind: "procedure_template",
  config: { stage_key: "woodwork" },
};

const plumbingNode = {
  id: "node-plumbing",
  node_key: "procedure_plumbing_electrical",
  title: "水电",
  node_type: "procedure",
  business_kind: "procedure_template",
  config: {
    stage_key: "plumbing_electrical",
    require_log: true,
    min_image_count: 1,
    trigger_acceptance: true,
  },
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
  test("keeps current procedure start action until acceptance-enabled procedure is completed", () => {
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
        current_node_snapshot: plumbingNode,
      },
      graph: {
        definition: { workflow_key: "construction_main", category: "construction" },
        nodes: [plumbingNode],
        edges: [],
      },
      pendingActions: [{
        task_id: "task-plumbing",
        key: "start_procedure",
        label: "开始水电",
        node_key: "procedure_plumbing_electrical",
        node_type: "procedure",
        business_domain: "project_procedure",
        business_action: "start_procedure",
        disabled: false,
      }],
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
      status: "current",
      actions: [{
        key: "start_procedure",
        business_domain: "project_procedure",
        business_action: "start_procedure",
        task_id: "task-plumbing",
      }],
    });
  });

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
