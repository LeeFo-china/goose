import { describe, expect, test } from "bun:test";
import {
  shouldRequireProjectWorkflowRebuild,
  resolveProjectWorkflowTaskOperation,
} from "./workflow-task-project-bridge";

describe("resolveProjectWorkflowTaskOperation", () => {
  test("maps workflow-native project nodes to internal project effects", () => {
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

    expect(resolveProjectWorkflowTaskOperation({
      nodeKey: "construction_start",
      action: "complete",
      reason: null,
      output: {},
    })).toEqual({
      action: "start_construction",
      payload: { action: "start_construction" },
    });

    expect(resolveProjectWorkflowTaskOperation({
      nodeKey: "final_acceptance",
      action: "complete",
      reason: null,
      output: {},
    })).toEqual({
      action: "start_acceptance",
      payload: { action: "start_acceptance" },
    });
  });

  test("does not bridge final acceptance complete when report is enabled", () => {
    expect(resolveProjectWorkflowTaskOperation({
      nodeKey: "final_acceptance",
      action: "complete",
      reason: null,
      output: {},
      currentNodeSnapshot: {
        node_key: "final_acceptance",
        business_kind: "final_acceptance",
        config: {
          stage_type: "final_acceptance",
          final_acceptance_report_enabled: true,
        },
      },
    })).toBeNull();
  });

  test("requires signed amount before signing project from workflow task", () => {
    expect(() =>
      resolveProjectWorkflowTaskOperation({
        nodeKey: "proposal_confirmed",
        action: "complete",
        reason: null,
        output: {},
      })
    ).toThrow("项目签约时必须提供有效的 signed_amount");
  });

  test("requires construction schedule fields before scheduling start from workflow task", () => {
    expect(() =>
      resolveProjectWorkflowTaskOperation({
        nodeKey: "design_finalized",
        action: "complete",
        reason: null,
        output: { construction_manager_employee_id: "employee-1" },
      })
    ).toThrow("项目排期开工前必须先确定开工日期");

    expect(() =>
      resolveProjectWorkflowTaskOperation({
        nodeKey: "design_finalized",
        action: "complete",
        reason: null,
        output: { start_date: "2026-06-12" },
      })
    ).toThrow("请选择工程负责人");
  });

  test("does not accept legacy explicit project status actions", () => {
    expect(resolveProjectWorkflowTaskOperation({
      nodeKey: "constructing",
      action: "pause_project",
      reason: "材料待补",
      output: {},
    })).toBeNull();

    expect(resolveProjectWorkflowTaskOperation({
      nodeKey: "on_hold",
      action: "complete",
      reason: null,
      output: {},
    })).toEqual({
      action: "resume_project",
      payload: { action: "resume_project" },
    });
  });
});

describe("shouldRequireProjectWorkflowRebuild", () => {
  test("requires rebuild for project-signing nodes in legacy project workflows", () => {
    expect(shouldRequireProjectWorkflowRebuild({
      workflowKey: "construction_main",
      nodeKey: "designing",
    })).toBe(true);

    expect(shouldRequireProjectWorkflowRebuild({
      workflowKey: "project_main",
      nodeKey: "signed",
    })).toBe(true);
  });

  test("allows native signing and construction nodes", () => {
    expect(shouldRequireProjectWorkflowRebuild({
      workflowKey: "project_signing",
      nodeKey: "designing",
    })).toBe(false);

    expect(shouldRequireProjectWorkflowRebuild({
      workflowKey: "construction_main",
      nodeKey: "started",
    })).toBe(false);
  });
});
