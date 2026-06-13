import { describe, expect, test } from "bun:test";
import {
  WorkflowGraphSaveSchema,
  WorkflowRuntimeRebuildSchema,
} from "./workflows";

describe("WorkflowGraphSaveSchema", () => {
  test("accepts admin payment collection node config", () => {
    const result = WorkflowGraphSaveSchema.safeParse({
      nodes: [
        {
          node_key: "middle_payment",
          node_type: "confirmation",
          business_kind: "payment_collection",
          title: "中期收款",
          description: null,
          position: { x: 100, y: 100 },
          config: {
            required_permissions: [],
            timeout_hours: null,
            rollback_target_key: null,
            finance_type: "payment_collection",
            payment_type: "stage_2",
            requirement_mode: "any_confirmed",
            required_percentage: null,
            block_message: null,
            finance_reviewer_employee_id: null,
          },
          sort_order: 110,
        },
      ],
      edges: [],
    });

    expect(result.success).toBe(true);
  });
});

describe("WorkflowRuntimeRebuildSchema", () => {
  test("requires an operator reason and accepts project status correction", () => {
    expect(WorkflowRuntimeRebuildSchema.safeParse({
      subject_id: "project-1",
      reason: "",
      project_status: "started",
    }).success).toBe(false);

    const result = WorkflowRuntimeRebuildSchema.safeParse({
      subject_id: "project-1",
      reason: "流程图发布后按当前版本重建",
      project_status: "started",
      delete_completed_instances: true,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      subject_type: "manual",
      subject_id: "project-1",
      reason: "流程图发布后按当前版本重建",
      project_status: "started",
      delete_completed_instances: true,
      context: {},
      dry_run: false,
    });
  });
});
