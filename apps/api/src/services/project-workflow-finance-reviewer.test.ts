import { describe, expect, test } from "bun:test";
import {
  enrichWorkflowGraphWithFinanceReviewerEmployees,
} from "./project-workflow-finance-reviewer";
import { buildProjectWorkflowProgressProjection } from "./project-workflow-progress";

const graph = {
  nodes: [
    {
      id: "node-payment",
      node_key: "payment_stage_2",
      title: "中期进度款",
      node_type: "confirmation",
      business_kind: "payment_collection",
      config: {
        payment_type: "stage_2",
        finance_reviewer_employee_id: "finance-1",
      },
    },
    {
      id: "node-tiling",
      node_key: "procedure_tiling",
      title: "瓦工",
      node_type: "procedure",
      business_kind: "procedure_template",
      config: { stage_key: "tiling" },
    },
  ],
  edges: [
    {
      source_node_id: "node-payment",
      target_node_id: "node-tiling",
    },
  ],
};

describe("enrichWorkflowGraphWithFinanceReviewerEmployees", () => {
  test("adds finance reviewer names to payment node config", () => {
    const enriched = enrichWorkflowGraphWithFinanceReviewerEmployees({
      graph,
      employees: [{
        id: "finance-1",
        name: "小龙女",
        avatar: null,
      }],
    });

    expect(enriched.nodes[0]?.config).toMatchObject({
      finance_reviewer_employee_id: "finance-1",
      finance_reviewer_employee_name: "小龙女",
    });
  });

  test("adds configured finance reviewer to payment timeline node attributes", () => {
    const enrichedGraph = enrichWorkflowGraphWithFinanceReviewerEmployees({
      graph,
      employees: [{
        id: "finance-1",
        name: "小龙女",
        avatar: null,
      }],
    });
    const progress = buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "payment_stage_2",
        current_node_title: "中期进度款",
        current_business_kind: "payment_collection",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "payment_stage_2",
        current_node_snapshot: graph.nodes[0],
      },
      graph: enrichedGraph,
      pendingActions: [],
    });

    expect(progress.timeline_nodes[0]).toMatchObject({
      attributes: {
        payment_type: "stage_2",
        finance_reviewer_employee_id: "finance-1",
        finance_reviewer_employee_name: "小龙女",
      },
    });
  });
});
