import { describe, expect, test } from "bun:test";
import {
  buildProjectLogEntry,
  buildProjectLogEntryNextAction,
} from "./log-entry";
import {
  attachWorkflowOutputsToBootstrapProject,
  enrichWorkflowOutputsForBootstrap,
} from "./orchestration";
import {
  buildAcceptanceNextActionDescription,
  buildAcceptanceNextActionTitle,
  buildNextAction,
  getAcceptanceActionLabel,
  getAcceptanceActionPriority,
  selectNextAcceptanceActionStage,
} from "./next-action";
import type {
  ProjectWorkflowState,
  WorkflowProgressResult,
} from "./shared";

const service = {
  buildAcceptanceNextActionDescription,
  buildAcceptanceNextActionTitle,
  buildNextAction,
  buildProjectLogEntryNextAction,
  buildProjectLogEntry,
  getAcceptanceActionLabel,
  getAcceptanceActionPriority,
  selectNextAcceptanceActionStage,
  attachWorkflowOutputsToBootstrapProject,
  enrichWorkflowOutputsForBootstrap,
};

const permissions = {
  employee_id: "employee-1",
  can_read_project: true,
  can_update_project: true,
  can_manage_project_team: false,
  can_create_project_log: true,
  can_access_project_acceptance: true,
  can_view_project_referral: false,
  can_manage_project_referral: false,
  scopes: {
    project_update: "self",
    project_log_create: "self",
    project_acceptance_manage: "self",
  },
};

const constructionStages = {
  project_id: "project-1",
  project_status: "constructing",
  required_stage_codes: [
    "demolition",
    "plumbing_electrical",
    "masonry",
    "carpentry",
    "painting",
    "installation",
  ],
  required_completed: false,
  current_stage: "carpentry",
  next_stage: null,
  missing_required_stages: [],
  all_stage_codes: [
    "demolition",
    "plumbing_electrical",
    "masonry",
    "carpentry",
    "painting",
    "installation",
    "completion",
  ],
  stages: [
    {
      stage_code: "carpentry",
      stage_label: "木工",
      status: "in_progress",
      is_required: true,
      is_completion: false,
      can_create_log: true,
      can_create_acceptance: true,
      acceptance_id: null,
      acceptance_status: null,
      acceptance: null,
      acceptance_action: {
        type: "create",
        label: "发起验收",
        enabled: true,
        reason: null,
      },
      latest_log: null,
      blocked_reason: null,
    },
  ],
};

describe("employee project detail workflow gates", () => {
  test("hides legacy acceptance next action while payment collection is pending", () => {
    expect(service.buildNextAction({
      constructionStages,
      workflowBlockingReason: "请先完成中期进度款",
    } as never)).toBeNull();
  });

  test("blocks legacy project log entry while payment collection is pending", () => {
    expect(service.buildProjectLogEntry({
      project: { id: "project-1", status: "constructing" },
      permissions,
      constructionStages,
      nextAction: null,
      workflowBlockingReason: "请先完成中期进度款",
    } as never)).toEqual({
      can_create: false,
      writable_stage: null,
      blocked_reason: "请先完成中期进度款",
      next_action: {
        kind: "refresh",
        label: "请先完成中期进度款",
        action: "refresh",
      },
    });
  });

  test("enriches workflow progress and state timeline nodes from construction stages", () => {
    const workflowProgress: WorkflowProgressResult = {
      source: "workflow_runtime",
      instance_id: "instance-1",
      instance_status: "running",
      current_node_key: "procedure_tiling",
      current_node_title: "瓦工",
      current_node_type: "procedure",
      current_business_kind: "procedure_template",
      current_stage_code: "tiling",
      current_gate: null,
      pending_task_count: 1,
      actions: [],
      warnings: [],
      timeline_nodes: [{
        node_key: "procedure_plumbing_electrical",
        node_title: "水电",
        node_type: "procedure",
        business_kind: "procedure_template",
        status: "done",
        display: {
          label: "水电",
          status_label: "已完成",
          status_variant: "success",
        },
        attributes: {
          stage_code: "plumbing_electrical",
          acceptance_enabled: true,
          acceptance_required: true,
        },
        actions: [],
      }],
    };
    const workflowState: ProjectWorkflowState = {
      subject_type: "project",
      subject_id: "project-1",
      instance_id: "instance-1",
      instance_status: "running",
      current_node_key: "procedure_tiling",
      current_node_title: "瓦工",
      current_business_kind: "procedure_template",
      pending_task_count: 1,
      actions: [],
      timeline_nodes: workflowProgress.timeline_nodes,
    };
    const result = enrichWorkflowOutputsForBootstrap({
      workflowProgress: workflowProgress as never,
      workflowState,
      constructionStages: {
        ...constructionStages,
        stages: [{
          ...constructionStages.stages[0],
          stage_code: "plumbing_electrical",
          stage_label: "水电",
          acceptance_action: {
            type: "create",
            label: "发起验收",
            enabled: true,
            reason: null,
          },
        }],
      } as never,
    });

    expect(result.workflowProgress.timeline_nodes[0]).toMatchObject({
      status: "blocked",
      display: {
        status_label: "待验收",
      },
      actions: [{
        key: "create_acceptance",
        business_action: "create",
      }],
    });
    expect(result.workflowState?.timeline_nodes?.[0]).toMatchObject({
      status: "blocked",
      actions: [{
        key: "create_acceptance",
      }],
    });
  });

  test("embeds enriched workflow outputs into bootstrap project payload", () => {
    const workflowProgress: WorkflowProgressResult = {
      source: "workflow_runtime",
      instance_id: "instance-1",
      instance_status: "completed",
      current_node_key: "end",
      current_node_title: "结束",
      current_node_type: "end",
      current_business_kind: null,
      current_stage_code: null,
      current_gate: null,
      pending_task_count: 0,
      actions: [],
      warnings: [],
      timeline_nodes: [
        {
          node_key: "procedure_demolition",
          node_title: "拆改",
          node_type: "procedure",
          business_kind: "procedure_template",
          status: "done",
          display: {
            label: "拆改",
            status_label: "已完成",
            status_variant: "success",
          },
          attributes: {},
          actions: [],
        },
        {
          node_key: "end",
          node_title: "结束",
          node_type: "end",
          business_kind: null,
          status: "done",
          display: {
            label: "结束",
            status_label: "已完成",
            status_variant: "success",
          },
          attributes: {},
          actions: [],
        },
      ],
    };
    const workflowState: ProjectWorkflowState = {
      subject_type: "project",
      subject_id: "project-1",
      instance_id: "instance-1",
      instance_status: "completed",
      current_node_key: "end",
      current_node_title: "结束",
      current_business_kind: null,
      pending_task_count: 0,
      actions: [],
      timeline_nodes: workflowProgress.timeline_nodes,
    };

    const result = service.attachWorkflowOutputsToBootstrapProject({
      project: {
        id: "project-1",
        status: "completed",
      },
      workflowState,
      workflowProgress,
    });

    expect(result.workflow_state?.timeline_nodes).toHaveLength(2);
    expect(result.workflow_progress.timeline_nodes).toHaveLength(2);
    expect(result.workflow_state).toBe(workflowState);
    expect(result.workflow_progress).toBe(workflowProgress);
  });
});
