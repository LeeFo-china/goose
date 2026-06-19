import { describe, expect, test } from "bun:test";
import { buildUnavailableProjectWorkflowProgress } from "./project-workflow-progress";
import {
  assertProjectWorkflowStageMutationAllowedFromProgress,
} from "./project-workflow-mutation-guards";
import type { ProjectWorkflowProgress } from "./project-workflow-progress";
import type { WorkflowTimelineNode } from "./project-workflow-timeline-contract";

function procedureTimelineNode(input: {
  stageCode: string;
  title: string;
  status?: WorkflowTimelineNode["status"];
  acceptanceEnabled?: boolean;
}): WorkflowTimelineNode {
  return {
    node_key: `procedure_${input.stageCode}`,
    node_title: input.title,
    node_type: "procedure",
    business_kind: "procedure_template",
    status: input.status ?? "current",
    display: {
      label: input.title,
      status_label: input.status === "done" ? "已完成" : "当前",
      status_variant: input.status === "done" ? "success" : "default",
    },
    attributes: {
      stage_code: input.stageCode,
      acceptance_enabled: input.acceptanceEnabled ?? true,
      acceptance_required: input.acceptanceEnabled ?? true,
    },
    actions: [],
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
    timeline_nodes: [],
    pending_task_count: 1,
    actions: [],
    warnings: [],
    ...override,
  };
}

describe("assertProjectWorkflowStageMutationAllowedFromProgress", () => {
  test("blocks construction log creation when stage is not the workflow current procedure", () => {
    expect(() =>
      assertProjectWorkflowStageMutationAllowedFromProgress({
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
        mutation: "create_project_log",
        stageCode: "tiling",
      })
    ).toThrow("当前流程在中期进度款，不能操作瓦工");
  });

  test("allows ordinary non-construction logs without workflow stage matching", () => {
    expect(() =>
      assertProjectWorkflowStageMutationAllowedFromProgress({
        workflowProgress: buildUnavailableProjectWorkflowProgress(),
        mutation: "create_project_log",
        stageCode: "measure",
      })
    ).not.toThrow();
  });

  test("blocks stage acceptance when stage is ahead of workflow runtime", () => {
    expect(() =>
      assertProjectWorkflowStageMutationAllowedFromProgress({
        workflowProgress: workflowProgress({}),
        mutation: "create_stage_acceptance",
        stageCode: "tiling",
      })
    ).toThrow("当前流程在水电，不能操作瓦工");
  });

  test("blocks creating stage acceptance when workflow node does not enable acceptance", () => {
    expect(() =>
      assertProjectWorkflowStageMutationAllowedFromProgress({
        workflowProgress: workflowProgress({
          timeline_nodes: [
            procedureTimelineNode({
              stageCode: "plumbing_electrical",
              title: "水电",
              acceptanceEnabled: false,
            }),
          ],
        }),
        mutation: "create_stage_acceptance",
        stageCode: "plumbing_electrical",
      })
    ).toThrow("水电工序未开启阶段验收");
  });

  test("allows acceptance mutations for the procedure immediately before a payment gate", () => {
    const progress = workflowProgress({
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
    });

    expect(() =>
      assertProjectWorkflowStageMutationAllowedFromProgress({
        workflowProgress: progress,
        mutation: "create_stage_acceptance",
        stageCode: "plumbing_electrical",
      })
    ).not.toThrow();
    expect(() =>
      assertProjectWorkflowStageMutationAllowedFromProgress({
        workflowProgress: progress,
        mutation: "customer_confirm_acceptance",
        stageCode: "plumbing_electrical",
      })
    ).not.toThrow();
  });

  test("reports workflow progress conflict when runtime is unavailable", () => {
    expect(() =>
      assertProjectWorkflowStageMutationAllowedFromProgress({
        workflowProgress: buildUnavailableProjectWorkflowProgress(),
        mutation: "customer_confirm_acceptance",
        stageCode: "plumbing_electrical",
      })
    ).toThrow("流程运行态不可用，不能操作水电");
  });
});
