import { describe, expect, test } from "bun:test";
import { resolveProjectWorkflowTaskOperation } from "./workflow-task-project-bridge";

describe("resolveProjectWorkflowTaskOperation", () => {
  test("maps linear construction workflow nodes to project status actions", () => {
    expect(resolveProjectWorkflowTaskOperation({
      nodeKey: "proposal_confirmed",
      action: "complete",
      reason: null,
      output: { signed_amount: 10000 },
    })).toEqual({
      action: "sign_contract",
      payload: { action: "sign_contract", signed_amount: 10000 },
    });

    expect(resolveProjectWorkflowTaskOperation({
      nodeKey: "design_finalized",
      action: "complete",
      reason: null,
      output: {
        start_date: "2026-06-12",
        construction_manager_employee_id: "employee-1",
      },
    })).toEqual({
      action: "schedule_construction",
      payload: {
        action: "schedule_construction",
        start_date: "2026-06-12",
        construction_manager_employee_id: "employee-1",
      },
    });
  });

  test("maps explicit pause and invalid actions from the current node", () => {
    expect(resolveProjectWorkflowTaskOperation({
      nodeKey: "constructing",
      action: "pause_project",
      reason: "材料待补",
      output: {},
    })).toEqual({
      action: "pause_project",
      payload: { action: "pause_project", reason: "材料待补" },
    });
  });
});
