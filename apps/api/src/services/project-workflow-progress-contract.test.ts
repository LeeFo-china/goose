import { describe, expect, test } from "bun:test";
import {
  buildProjectWorkflowProgressProjection,
  enrichProjectWorkflowProgressWithConstructionStages,
} from "./project-workflow-progress";

const procedureGraph = {
  definition: {
    workflow_key: "construction_main",
    category: "construction",
  },
  nodes: [
    {
      id: "node-plumbing",
      node_key: "procedure_plumbing_electrical",
      title: "水电",
      node_type: "procedure",
      business_kind: "procedure_template",
      config: {
        stage_key: "plumbing_electrical",
        require_log: true,
        min_image_count: 3,
        trigger_acceptance: true,
      },
    },
    {
      id: "node-tiling",
      node_key: "procedure_tiling",
      title: "瓦工",
      node_type: "procedure",
      business_kind: "procedure_template",
      config: {
        stage_key: "tiling",
        require_log: true,
        min_image_count: 2,
        trigger_acceptance: false,
      },
    },
  ],
  edges: [
    {
      source_node_id: "node-plumbing",
      target_node_id: "node-tiling",
    },
  ],
};

describe("project workflow node contract", () => {
  test("stops workflow timeline at a reachable payment node without outgoing edge", () => {
    const paymentWithoutOutgoingEdgeGraph = {
      nodes: [
        {
          id: "node-start",
          node_key: "start",
          title: "开始",
          node_type: "start",
          business_kind: null,
          config: {},
        },
        {
          id: "node-plumbing",
          node_key: "procedure_plumbing_electrical",
          title: "水电",
          node_type: "procedure",
          business_kind: "procedure_template",
          config: { stage_key: "plumbing_electrical" },
        },
        {
          id: "node-payment",
          node_key: "payment_stage_2",
          title: "中期收款",
          node_type: "confirmation",
          business_kind: "payment_collection",
          config: { payment_type: "stage_2" },
        },
        {
          id: "node-tiling",
          node_key: "procedure_tiling",
          title: "瓦工",
          node_type: "procedure",
          business_kind: "procedure_template",
          config: { stage_key: "tiling" },
        },
        {
          id: "node-end",
          node_key: "end",
          title: "结束",
          node_type: "end",
          business_kind: null,
          config: {},
        },
      ],
      edges: [
        {
          source_node_id: "node-start",
          target_node_id: "node-plumbing",
        },
        {
          source_node_id: "node-plumbing",
          target_node_id: "node-payment",
        },
        {
          source_node_id: "node-tiling",
          target_node_id: "node-end",
        },
      ],
    };
    const progress = buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "payment_stage_2",
        current_node_title: "中期收款",
        current_business_kind: "payment_collection",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "payment_stage_2",
        current_node_snapshot: paymentWithoutOutgoingEdgeGraph.nodes[2],
      },
      graph: paymentWithoutOutgoingEdgeGraph,
      completedNodeKeys: ["procedure_plumbing_electrical"],
      pendingActions: [],
    });

    expect(progress.timeline_nodes.map((node) => node.node_key)).toEqual([
      "procedure_plumbing_electrical",
      "payment_stage_2",
    ]);
  });

  test("adds display attributes and actions to workflow timeline nodes", () => {
    const progress = buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "procedure_plumbing_electrical",
        current_node_title: "水电",
        current_business_kind: "procedure_template",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "procedure_plumbing_electrical",
        current_node_snapshot: procedureGraph.nodes[0],
      },
      graph: procedureGraph,
      pendingActions: [{
        task_id: "task-1",
        key: "complete_procedure",
        label: "水电施工",
        node_key: "procedure_plumbing_electrical",
        node_type: "procedure",
        business_domain: "project_procedure",
        business_action: "complete_procedure",
        requires_reason: false,
        disabled: false,
        output_fields: [],
      }],
    });

    expect(progress.timeline_nodes[0]).toMatchObject({
      group: {
        key: "construction",
        label: "施工阶段",
        order: 20,
      },
      display: {
        label: "水电",
        status_label: "当前",
        status_variant: "default",
      },
      attributes: {
        stage_code: "plumbing_electrical",
        require_log: true,
        min_image_count: 3,
        acceptance_enabled: true,
        acceptance_required: true,
      },
      actions: [{
        key: "complete_procedure",
        label: "水电施工",
        task_id: "task-1",
      }],
    });
    expect(progress).toMatchObject({
      current_group_key: "construction",
      current_group_label: "施工阶段",
      current_group_order: 20,
    });
  });

  test("projects payment receivable context to timeline node attributes", () => {
    const graph = {
      definition: {
        workflow_key: "construction_main",
        category: "construction",
      },
      nodes: [
        {
          id: "node-payment",
          node_key: "payment_stage_2",
          title: "中期收款",
          node_type: "confirmation",
          business_kind: "payment_collection",
          config: { payment_type: "stage_2" },
        },
      ],
      edges: [],
    };

    const progress = buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "payment_stage_2",
        current_node_title: "中期收款",
        current_business_kind: "payment_collection",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "payment_stage_2",
        current_node_snapshot: graph.nodes[0],
      },
      graph,
      pendingActions: [{
        task_id: "task-1",
        key: "complete",
        label: "中期收款",
        node_key: "payment_stage_2",
        node_type: "confirmation",
        business_domain: "payment_collection",
        business_action: "confirm_payment",
        requires_reason: false,
        disabled: false,
        output_fields: [{
          name: "receivable_context",
          label: "应收信息",
          type: "receivable_summary",
          required: false,
          readonly: true,
          receivable_plan_id: "plan-1",
          receivable_title: "中期进度款",
          receivable_amount: 10000,
          receivable_paid_amount: 3000,
          receivable_remaining_amount: 7000,
          receivable_due_date: "2026-06-30",
          receivable_status: "partially_paid",
          receivable_overdue_days: 0,
        }],
      }],
    });

    expect(progress.timeline_nodes[0]).toMatchObject({
      attributes: {
        payment_type: "stage_2",
        receivable_plan_id: "plan-1",
        receivable_title: "中期进度款",
        receivable_amount: 10000,
        receivable_paid_amount: 3000,
        receivable_remaining_amount: 7000,
        receivable_due_date: "2026-06-30",
        receivable_status: "partially_paid",
        receivable_overdue_days: 0,
      },
      actions: [{
        output_fields: [expect.objectContaining({
          name: "receivable_context",
          type: "receivable_summary",
        })],
      }],
    });
  });

  test("projects procedure assignment attributes and runtime actions", () => {
    const progress = buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "procedure_plumbing_electrical",
        current_node_title: "水电",
        current_business_kind: "procedure_template",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "procedure_plumbing_electrical",
        current_node_snapshot: procedureGraph.nodes[0],
      },
      graph: procedureGraph,
      tenantToday: "2026-06-24",
      procedureAssignments: [{
        id: "assignment-1",
        tenant_id: "tenant-1",
        project_id: "project-1",
        workflow_instance_id: "instance-1",
        workflow_instance_node_id: "node-run-1",
        node_key: "procedure_plumbing_electrical",
        stage_code: "plumbing_electrical",
        assignee_employee_id: "employee-1",
        planned_start_date: "2026-06-24",
        planned_duration_days: 3,
        planned_end_date: "2026-06-26",
        status: "planned",
        started_by_employee_id: "manager-1",
        started_at: "2026-06-23T00:00:00.000Z",
        completed_by_employee_id: null,
        completed_at: null,
        adjusted_by_employee_id: null,
        adjusted_at: null,
        adjust_reason: null,
        created_at: "2026-06-23T00:00:00.000Z",
        updated_at: "2026-06-23T00:00:00.000Z",
        assignee_employee: {
          id: "employee-1",
          name: "张三",
          avatar: null,
        },
      }],
      pendingActions: [{
        task_id: "task-1",
        key: "start_procedure",
        label: "开始水电施工",
        node_key: "procedure_plumbing_electrical",
        node_type: "procedure",
        business_domain: "project_procedure",
        business_action: "start_procedure",
        requires_reason: false,
        disabled: false,
        output_fields: [],
      }],
    });

    const plumbingNode = progress.timeline_nodes[0];
    expect(plumbingNode?.attributes).toMatchObject({
      procedure_assignment_id: "assignment-1",
      procedure_assignment_status: "in_progress",
      procedure_assignee_employee_id: "employee-1",
      procedure_assignee_employee_name: "张三",
      planned_start_date: "2026-06-24",
      planned_duration_days: 3,
      planned_end_date: "2026-06-26",
      remaining_days: 2,
      schedule_status: "on_track",
    });
    expect(plumbingNode?.actions).toMatchObject([
      {
        key: "complete_procedure",
        task_id: "task-1",
        disabled: false,
      },
      {
        key: "adjust_procedure_schedule",
        task_id: "task-1",
      },
    ]);
  });

  test("marks completed acceptance-enabled procedure as pending acceptance", () => {
    const progress = buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "procedure_tiling",
        current_node_title: "瓦工",
        current_business_kind: "procedure_template",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "procedure_tiling",
        current_node_snapshot: procedureGraph.nodes[1],
      },
      graph: procedureGraph,
      completedNodeKeys: ["procedure_plumbing_electrical"],
      pendingActions: [],
    });

    const enriched = enrichProjectWorkflowProgressWithConstructionStages(progress, {
      stages: [{
        stage_code: "plumbing_electrical",
        stage_label: "水电",
        acceptance_id: null,
        acceptance_status: null,
        acceptance_action: {
          type: "create",
          label: "发起验收",
          enabled: true,
          reason: null,
        },
      }],
    });

    const plumbingNode = enriched.timeline_nodes[0];
    if (!plumbingNode) {
      throw new Error("Missing enriched plumbing node");
    }

    expect(plumbingNode).toMatchObject({
      status: "blocked",
      display: {
        status_label: "待验收",
        status_variant: "warning",
      },
      attributes: {
        acceptance_enabled: true,
        acceptance_required: true,
        acceptance_id: null,
        acceptance_status: null,
      },
      actions: [{
        key: "create_acceptance",
        label: "发起验收",
        business_domain: "project_acceptance",
        business_action: "create",
        disabled: false,
        stage_code: "plumbing_electrical",
      }],
    });
  });

  test("does not add acceptance action when procedure acceptance is disabled", () => {
    const plumbingNode = procedureGraph.nodes[0];
    const tilingNode = procedureGraph.nodes[1];
    if (!plumbingNode || !tilingNode) {
      throw new Error("Missing procedure graph nodes");
    }
    const disabledGraph = {
      ...procedureGraph,
      nodes: [
        {
          ...plumbingNode,
          config: {
            ...plumbingNode.config,
            trigger_acceptance: false,
          },
        },
        tilingNode,
      ],
    };
    const progress = buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "procedure_tiling",
        current_node_title: "瓦工",
        current_business_kind: "procedure_template",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "procedure_tiling",
        current_node_snapshot: tilingNode,
      },
      graph: disabledGraph,
      completedNodeKeys: ["procedure_plumbing_electrical"],
      pendingActions: [],
    });

    const enriched = enrichProjectWorkflowProgressWithConstructionStages(progress, {
      stages: [{
        stage_code: "plumbing_electrical",
        stage_label: "水电",
        acceptance_id: null,
        acceptance_status: null,
        acceptance_action: {
          type: "create",
          label: "发起验收",
          enabled: true,
          reason: null,
        },
      }],
    });

    const enrichedPlumbingNode = enriched.timeline_nodes[0];
    if (!enrichedPlumbingNode) {
      throw new Error("Missing enriched plumbing node");
    }

    expect(enrichedPlumbingNode.status).toBe("done");
    expect(enrichedPlumbingNode.attributes.acceptance_enabled).toBe(false);
    expect(enrichedPlumbingNode.actions).toEqual([]);
  });
});
