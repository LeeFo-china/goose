import { describe, expect, test } from "bun:test";
import {
  buildProjectWorkflowProgressProjection,
  enrichProjectWorkflowProgressWithConstructionStages,
} from "./project-workflow-progress";

describe("project workflow final acceptance contract", () => {
  test("adds final acceptance report action when node report is enabled", () => {
    const graph = {
      definition: {
        workflow_key: "construction_main",
        category: "construction",
      },
      nodes: [
        {
          id: "node-final-acceptance",
          node_key: "final_acceptance",
          title: "竣工验收",
          node_type: "construction_stage",
          business_kind: "final_acceptance",
          config: {
            stage_type: "final_acceptance",
            final_acceptance_report_enabled: true,
          },
        },
      ],
      edges: [],
    };
    const progress = buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "final_acceptance",
        current_node_title: "竣工验收",
        current_business_kind: "final_acceptance",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "final_acceptance",
        current_node_snapshot: graph.nodes[0],
      },
      graph,
      pendingActions: [],
    });

    const enriched = enrichProjectWorkflowProgressWithConstructionStages(progress, {
      stages: [{
        stage_code: "completion",
        stage_label: "竣工",
        acceptance_id: null,
        acceptance_status: null,
        acceptance_action: {
          type: "create",
          label: "发起竣工验收",
          enabled: true,
          reason: null,
        },
      }],
    });

    expect(enriched.current_stage_code).toBe("completion");
    expect(enriched.actions).toMatchObject([{
      key: "create_acceptance",
      business_domain: "project_acceptance",
      business_action: "create",
      stage_code: "completion",
      acceptance_type: "final",
    }]);
    expect(enriched.timeline_nodes[0]).toMatchObject({
      attributes: {
        stage_code: "completion",
        acceptance_enabled: true,
        acceptance_required: true,
        acceptance_id: null,
        acceptance_status: null,
      },
      actions: [{
        key: "create_acceptance",
        label: "发起竣工验收",
        business_domain: "project_acceptance",
        business_action: "create",
        disabled: false,
        stage_code: "completion",
        acceptance_type: "final",
      }],
    });
  });
});
