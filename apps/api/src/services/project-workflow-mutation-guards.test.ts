import { describe, expect, test } from "bun:test";
import { buildUnavailableProjectWorkflowProgress } from "./project-workflow-progress";
import {
  assertProjectWorkflowStageMutationAllowedFromProgress,
} from "./project-workflow-mutation-guards";
import type { ProjectWorkflowProgress } from "./project-workflow-progress";
import type { WorkflowTimelineNode } from "./project-workflow-timeline-contract";

const workflowGroup = {
  key: "construction",
  label: "施工阶段",
  order: 20,
};

function procedureTimelineNode(input: {
  stageCode: string;
  title: string;
  status?: WorkflowTimelineNode["status"];
  acceptanceEnabled?: boolean;
  procedureCompleted?: boolean;
}): WorkflowTimelineNode {
  return {
    node_key: `procedure_${input.stageCode}`,
    node_title: input.title,
    node_type: "procedure",
    business_kind: "procedure_template",
    group: workflowGroup,
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
      ...(input.procedureCompleted === undefined ? {} : { procedure_completed: input.procedureCompleted }),
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

describe("assertProjectWorkflowStageMutationAllowedFromProgress", () => {
  test.each([false, undefined])("rejects current required acceptance before persisted completion (%s)", (procedureCompleted) => {
    const progress = workflowProgress({ timeline_nodes: [procedureTimelineNode({
      stageCode: "plumbing_electrical", title: "水电", procedureCompleted,
    })] });
    expect(() => assertProjectWorkflowStageMutationAllowedFromProgress({
      workflowProgress: progress, mutation: "customer_confirm_acceptance", stageCode: "plumbing_electrical",
    })).toThrow(expect.objectContaining({ statusCode: 409, code: "WORKFLOW_PROCEDURE_NOT_COMPLETED" }));
    // Preparing the acceptance is still allowed before construction finishes.
    expect(assertProjectWorkflowStageMutationAllowedFromProgress({
      workflowProgress: progress, mutation: "create_stage_acceptance", stageCode: "plumbing_electrical",
    })).toBe(progress);
  });

  test("rejects confirmation when the current procedure projection is missing", () => {
    expect(() => assertProjectWorkflowStageMutationAllowedFromProgress({
      workflowProgress: workflowProgress({}), mutation: "customer_confirm_acceptance", stageCode: "plumbing_electrical",
    })).toThrow(expect.objectContaining({ statusCode: 409 }));
  });

  test("allows confirmation only after current required procedure has persisted completion", () => {
    const progress = workflowProgress({ timeline_nodes: [procedureTimelineNode({
      stageCode: "plumbing_electrical", title: "水电", procedureCompleted: true,
    })] });
    expect(assertProjectWorkflowStageMutationAllowedFromProgress({
      workflowProgress: progress, mutation: "customer_confirm_acceptance", stageCode: "plumbing_electrical",
    })).toBe(progress);
  });

  test("does not borrow completion from a different node with the same stage", () => {
    const oldNode = procedureTimelineNode({ stageCode: "plumbing_electrical", title: "旧水电", procedureCompleted: true, status: "done" });
    oldNode.node_key = "old_plumbing";
    expect(() => assertProjectWorkflowStageMutationAllowedFromProgress({
      workflowProgress: workflowProgress({ timeline_nodes: [oldNode, procedureTimelineNode({ stageCode: "plumbing_electrical", title: "水电" })] }),
      mutation: "customer_confirm_acceptance", stageCode: "plumbing_electrical",
    })).toThrow(expect.objectContaining({ statusCode: 409 }));
  });

  test("preserves confirmation for current procedures without required acceptance", () => {
    const progress = workflowProgress({ timeline_nodes: [procedureTimelineNode({
      stageCode: "plumbing_electrical", title: "水电", acceptanceEnabled: false,
    })] });
    expect(assertProjectWorkflowStageMutationAllowedFromProgress({
      workflowProgress: progress, mutation: "customer_confirm_acceptance", stageCode: "plumbing_electrical",
    })).toBe(progress);
  });

  test("preserves historical water catch-up while unrelated current wood remains unfinished", () => {
    const progress = workflowProgress({ current_node_key: "procedure_woodwork", current_stage_code: "woodwork", timeline_nodes: [
      procedureTimelineNode({ stageCode: "plumbing_electrical", title: "水电", status: "done" }),
      procedureTimelineNode({ stageCode: "woodwork", title: "木工", procedureCompleted: false }),
    ] });
    expect(assertProjectWorkflowStageMutationAllowedFromProgress({
      workflowProgress: progress, mutation: "customer_confirm_acceptance", stageCode: "plumbing_electrical",
    })).toBe(progress);
    expect(progress.current_node_key).toBe("procedure_woodwork");
  });

  test("preserves final acceptance without a procedure completion marker", () => {
    const progress = workflowProgress({ current_node_key: "final_acceptance", current_node_type: "construction_stage", current_stage_code: "completion" });
    expect(assertProjectWorkflowStageMutationAllowedFromProgress({
      workflowProgress: progress, mutation: "customer_confirm_acceptance", stageCode: "completion",
    })).toBe(progress);
  });

  test("blocks construction log creation when stage differs from current workflow procedure", () => {
    expect(() =>
      assertProjectWorkflowStageMutationAllowedFromProgress({
        workflowProgress: workflowProgress({
          current_node_key: "procedure_woodwork",
          current_node_title: "木工",
          current_stage_code: "woodwork",
        }),
        mutation: "create_project_log",
        stageCode: "tiling",
      })
    ).toThrow("当前流程在木工，不能操作瓦工");
  });

  test("allows construction log creation for current workflow procedure", () => {
    const progress = workflowProgress({
      current_node_key: "procedure_woodwork",
      current_node_title: "木工",
      current_stage_code: "woodwork",
    });

    expect(assertProjectWorkflowStageMutationAllowedFromProgress({
      workflowProgress: progress,
      mutation: "create_project_log",
      stageCode: "woodwork",
    })).toBe(progress);
  });

  test("blocks project log creation when workflow runtime is unavailable", () => {
    expect(() =>
      assertProjectWorkflowStageMutationAllowedFromProgress({
        workflowProgress: buildUnavailableProjectWorkflowProgress(),
        mutation: "create_project_log",
        stageCode: "plumbing_electrical",
      })
    ).toThrow("流程运行态不可用，不能操作水电");
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

  test("allows required acceptance catch-up for a completed workflow procedure", () => {
    const progress = workflowProgress({
      current_node_key: "final_acceptance",
      current_node_title: "竣工验收",
      current_node_type: "construction_stage",
      current_business_kind: "final_acceptance",
      current_stage_code: "completion",
      timeline_nodes: [
        procedureTimelineNode({
          stageCode: "plumbing_electrical",
          title: "水电",
          status: "blocked",
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
