import { describe, expect, test } from "bun:test";
import type { ProjectWorkflowProgress } from "@/services/project-workflow-progress";
import {
  buildProjectConstructionStagesFromRows,
} from "./lists";
import type {
  ProjectAcceptanceProjectRow,
  ProjectAcceptanceRow,
  ProjectLogLatestStageRow,
  ProjectLogStageCode,
  ProjectLogStageSummaryRow,
} from "./shared";

const project: ProjectAcceptanceProjectRow = {
  id: "project-1",
  tenant_id: "tenant-1",
  name: "测试项目",
  customer_id: "customer-1",
  status: "constructing",
};

function confirmedAcceptance(stageCode: ProjectLogStageCode): ProjectAcceptanceRow {
  return {
    id: `acceptance-${stageCode}`,
    tenant_id: "tenant-1",
    project_id: project.id,
    acceptance_type: "stage",
    stage_code: stageCode,
    template_id: null,
    template_version: 1,
    template_snapshot: null,
    title: `${stageCode}验收`,
    status: "customer_confirmed",
    initiator_id: "employee-1",
    reviewer_id: null,
    customer_id: "customer-1",
    summary: null,
    submitted_at: null,
    reviewed_at: null,
    customer_confirmed_at: "2026-06-14T00:00:00.000Z",
    completed_at: "2026-06-14T00:00:00.000Z",
    rejected_at: null,
    reject_reason: null,
    reject_source: null,
    created_at: "2026-06-14T00:00:00.000Z",
    updated_at: "2026-06-14T00:00:00.000Z",
  };
}

function workflowProgress(
  override: Partial<ProjectWorkflowProgress>,
): ProjectWorkflowProgress {
  return {
    source: "workflow_runtime",
    instance_id: "instance-1",
    instance_status: "running",
    current_node_key: "procedure_plumbing_electrical",
    current_node_title: "水电",
    current_node_type: "procedure",
    current_business_kind: "procedure_template",
    current_stage_code: "plumbing_electrical",
    current_gate: null,
    pending_task_count: 1,
    actions: [],
    warnings: [],
    ...override,
  };
}

describe("buildProjectConstructionStagesFromRows", () => {
  test("locks the next procedure stage when workflow runtime is at a payment gate", async () => {
    const result = await buildProjectConstructionStagesFromRows({
      project,
      acceptanceRows: [
        confirmedAcceptance("demolition"),
        confirmedAcceptance("plumbing_electrical"),
      ],
      logRows: [{ stage_code: "tiling" }],
      latestLogRows: [],
      workflowProgress: workflowProgress({
        current_node_key: "payment_stage_2",
        current_node_title: "中期进度款",
        current_node_type: "confirmation",
        current_business_kind: "payment_collection",
        current_stage_code: null,
        current_gate: {
          type: "payment_collection",
          payment_type: "stage_2",
          payment_label: "中期进度款",
          blocked_stage_code: "tiling",
          blocked_stage_label: "瓦工",
        },
      }),
      sourceMode: "workflow_runtime",
    });

    const tiling = result.stages.find((item) => item.stage_code === "tiling");

    expect(result.current_stage).not.toBe("tiling");
    expect(result.current_stage).toBeNull();
    expect(tiling?.status).toBe("locked");
    expect(tiling?.blocked_reason).toContain("中期进度款");
  });

  test("uses the workflow procedure node as current stage even when later logs exist", async () => {
    const latestLogRows: ProjectLogLatestStageRow[] = [{
      id: "log-tiling",
      stage_code: "tiling",
      node_name: "瓦工进场",
      content: "瓦工日志",
      created_at: "2026-06-14T00:00:00.000Z",
    }];
    const logRows: ProjectLogStageSummaryRow[] = [
      { stage_code: "tiling" },
    ];

    const result = await buildProjectConstructionStagesFromRows({
      project,
      acceptanceRows: [
        confirmedAcceptance("demolition"),
        confirmedAcceptance("plumbing_electrical"),
      ],
      logRows,
      latestLogRows,
      workflowProgress: workflowProgress({
        current_node_key: "procedure_plumbing_electrical",
        current_node_title: "水电",
        current_node_type: "procedure",
        current_business_kind: "procedure_template",
        current_stage_code: "plumbing_electrical",
        current_gate: null,
      }),
      sourceMode: "workflow_runtime",
    });

    expect(result.current_stage).toBe("plumbing_electrical");
    expect(result.next_stage?.stage_code).toBe("plumbing_electrical");
  });
});
