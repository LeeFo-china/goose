import { describe, expect, test } from "bun:test";
import {
  buildProjectWorkflowSourceReport,
  resolveProjectWorkflowSourceCheckConfig,
  type ProjectWorkflowSourceSnapshot,
} from "./project-workflow-source-of-truth-check";

const knownMismatchSnapshot: ProjectWorkflowSourceSnapshot = {
  projectId: "2d710a84-1045-4750-8dfd-51a0f463a4db",
  workflowCurrentNodeKey: "construction_start",
  workflowCurrentNodeTitle: "开工",
  constructionStagesCurrentStage: "tiling",
  acceptedStageCodes: ["demolition", "plumbing_electrical"],
  completedRuntimeProcedureStageCodes: [],
  confirmedPaymentTypes: [],
  paymentGateNodes: [
    {
      nodeKey: "payment_stage_2",
      title: "中期进度款",
      paymentType: "stage_2",
      nextStageCode: "tiling",
      nextStageLabel: "瓦工",
    },
  ],
};

describe("resolveProjectWorkflowSourceCheckConfig", () => {
  test("reads a single project id and defaults to non-strict JSON output", () => {
    expect(resolveProjectWorkflowSourceCheckConfig([
      "--project-id",
      "2d710a84-1045-4750-8dfd-51a0f463a4db",
    ])).toEqual({
      mode: "single",
      projectId: "2d710a84-1045-4750-8dfd-51a0f463a4db",
      strict: false,
    });
  });

  test("supports all active construction mode and strict exit handling", () => {
    expect(resolveProjectWorkflowSourceCheckConfig([
      "--all-active-construction",
      "--strict",
    ])).toEqual({
      mode: "all-active-construction",
      projectId: null,
      strict: true,
    });
  });
});

describe("buildProjectWorkflowSourceReport", () => {
  test("reports accepted stages ahead of workflow runtime", () => {
    const report = buildProjectWorkflowSourceReport(
      knownMismatchSnapshot,
      "2026-06-14T00:00:00.000Z",
    );

    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual({
      code: "ACCEPTANCE_AHEAD_OF_WORKFLOW",
      stage_code: "demolition",
      message: "拆改验收已确认，但 workflow 未完成对应工序节点",
    });
    expect(report.issues).toContainEqual({
      code: "ACCEPTANCE_AHEAD_OF_WORKFLOW",
      stage_code: "plumbing_electrical",
      message: "水电验收已确认，但 workflow 未完成对应工序节点",
    });
  });

  test("reports construction stage projection mismatches", () => {
    const report = buildProjectWorkflowSourceReport(
      knownMismatchSnapshot,
      "2026-06-14T00:00:00.000Z",
    );

    expect(report.issues).toContainEqual({
      code: "RUNTIME_STAGE_PROJECTION_MISMATCH",
      stage_code: "tiling",
      message: "施工阶段 current_stage=瓦工 不是 workflow runtime 当前工序",
    });
  });

  test("passes when construction stage projection matches completed runtime facts", () => {
    const report = buildProjectWorkflowSourceReport({
      ...knownMismatchSnapshot,
      workflowCurrentNodeKey: "procedure_tiling",
      workflowCurrentNodeTitle: "瓦工",
      constructionStagesCurrentStage: "tiling",
      completedRuntimeProcedureStageCodes: ["demolition", "plumbing_electrical"],
      confirmedPaymentTypes: ["stage_2"],
    }, "2026-06-14T00:00:00.000Z");

    expect(report).toMatchObject({
      generated_at: "2026-06-14T00:00:00.000Z",
      ok: true,
      project_id: "2d710a84-1045-4750-8dfd-51a0f463a4db",
      workflow_current_node_key: "procedure_tiling",
      construction_stages_current_stage: "tiling",
      issues: [],
    });
  });

  test("does not treat a payment gate as the next construction stage", () => {
    const report = buildProjectWorkflowSourceReport({
      ...knownMismatchSnapshot,
      workflowCurrentNodeKey: "payment_stage_2",
      workflowCurrentNodeTitle: "中期进度款",
      constructionStagesCurrentStage: null,
      completedRuntimeProcedureStageCodes: ["demolition", "plumbing_electrical"],
      confirmedPaymentTypes: [],
    }, "2026-06-14T00:00:00.000Z");

    expect(report).toMatchObject({
      ok: true,
      workflow_current_node_key: "payment_stage_2",
      construction_stages_current_stage: null,
      issues: [],
    });
  });
});
