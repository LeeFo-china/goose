import { describe, expect, test } from "bun:test";
import type { ProjectWorkflowProgress } from "@/services/project-workflow-progress";
import type { WorkflowTimelineNode } from "@/services/project-workflow-timeline-contract";
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

const workflowGroup = {
  key: "construction",
  label: "施工阶段",
  order: 20,
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
    current_group_key: "construction",
    current_group_label: "施工阶段",
    current_group_order: 20,
    current_node_type: "procedure",
    current_business_kind: "procedure_template",
    current_stage_code: "plumbing_electrical",
    current_gate: null,
    timeline_nodes: [],
    pending_task_count: 1,
    actions: [],
    warnings: [],
    ...override,
  };
}

function procedureTimelineNode(input: {
  stageCode: ProjectLogStageCode;
  title: string;
  status?: WorkflowTimelineNode["status"];
  acceptanceEnabled?: boolean;
}): WorkflowTimelineNode {
  return {
    node_key: `procedure_${input.stageCode}`,
    node_title: input.title,
    node_type: "procedure",
    business_kind: "procedure_template",
    group: workflowGroup,
    status: input.status ?? "pending",
    display: {
      label: input.title,
      status_label: input.status === "done"
        ? "已完成"
        : input.status === "current"
          ? "当前"
          : "待处理",
      status_variant: input.status === "done"
        ? "success"
        : input.status === "current"
          ? "default"
          : "secondary",
    },
    attributes: {
      stage_code: input.stageCode,
      acceptance_enabled: input.acceptanceEnabled ?? false,
      acceptance_required: input.acceptanceEnabled ?? false,
    },
    actions: [],
  };
}

describe("buildProjectConstructionStagesFromRows", () => {
  test("does not expose acceptance before the current procedure is completed", async () => {
    const result = await buildProjectConstructionStagesFromRows({
      project,
      acceptanceRows: [],
      logRows: [{ stage_code: "plumbing_electrical" }],
      latestLogRows: [],
      canReadAcceptance: true,
      canCreateAcceptance: true,
      workflowProgress: workflowProgress({
        current_node_key: "procedure_plumbing_electrical",
        current_node_title: "水电",
        current_node_type: "procedure",
        current_business_kind: "procedure_template",
        current_stage_code: "plumbing_electrical",
        current_gate: null,
        timeline_nodes: [
          procedureTimelineNode({
            stageCode: "demolition",
            title: "拆改",
            status: "done",
            acceptanceEnabled: false,
          }),
          procedureTimelineNode({
            stageCode: "plumbing_electrical",
            title: "水电",
            status: "current",
            acceptanceEnabled: true,
          }),
        ],
      }),
      sourceMode: "workflow_runtime",
    });

    const demolition = result.stages.find((item) =>
      item.stage_code === "demolition"
    );
    const plumbing = result.stages.find((item) =>
      item.stage_code === "plumbing_electrical"
    );

    expect(demolition?.acceptance_action.type).toBe("none");
    expect(demolition?.can_create_acceptance).toBe(false);
    expect(plumbing?.blocked_reason).toBeNull();
    expect(plumbing?.acceptance_action).toEqual({
      type: "none",
      label: "",
      enabled: false,
      reason: null,
    });
    expect(plumbing?.can_create_log).toBe(false);
    expect(plumbing?.can_create_acceptance).toBe(false);
    expect(result.missing_required_stages).not.toContainEqual({
      stage_code: "demolition",
      stage_label: "拆改",
    });
    expect(result.missing_required_stages).toContainEqual({
      stage_code: "plumbing_electrical",
      stage_label: "水电",
    });
  });

  test("allows creating acceptance for the procedure immediately before a payment gate", async () => {
    const result = await buildProjectConstructionStagesFromRows({
      project,
      acceptanceRows: [
        confirmedAcceptance("demolition"),
      ],
      logRows: [{ stage_code: "plumbing_electrical" }],
      latestLogRows: [],
      canCreateAcceptance: true,
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
        timeline_nodes: [
          procedureTimelineNode({
            stageCode: "plumbing_electrical",
            title: "水电",
            status: "done",
            acceptanceEnabled: true,
          }),
        ],
      }),
      sourceMode: "workflow_runtime",
    });

    const plumbing = result.stages.find((item) =>
      item.stage_code === "plumbing_electrical"
    );

    expect(plumbing?.blocked_reason).toBeNull();
    expect(plumbing?.acceptance_action).toEqual({
      type: "create",
      label: "发起验收",
      enabled: true,
      reason: null,
    });
  });

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
    expect(result.next_stage).toBeNull();
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

  test("allows final acceptance when workflow runtime is at final_acceptance", async () => {
    const result = await buildProjectConstructionStagesFromRows({
      project,
      acceptanceRows: [
        confirmedAcceptance("demolition"),
        confirmedAcceptance("plumbing_electrical"),
        confirmedAcceptance("tiling"),
        confirmedAcceptance("woodwork"),
        confirmedAcceptance("painting"),
        confirmedAcceptance("installation"),
      ],
      logRows: [],
      latestLogRows: [],
      canReadAcceptance: true,
      canCreateAcceptance: true,
      workflowProgress: workflowProgress({
        current_node_key: "final_acceptance",
        current_node_title: "竣工验收",
        current_node_type: "business",
        current_business_kind: "final_acceptance",
        current_stage_code: null,
        current_gate: null,
      }),
      sourceMode: "workflow_runtime",
    });

    const completion = result.stages.find((item) =>
      item.stage_code === "completion"
    );

    expect(result.required_completed).toBe(true);
    expect(completion?.blocked_reason).toBeNull();
    expect(completion?.can_create_acceptance).toBe(true);
    expect(completion?.acceptance_action).toEqual({
      type: "create",
      label: "发起竣工验收",
      enabled: true,
      reason: null,
    });
  });
});
