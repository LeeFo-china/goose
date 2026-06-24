import type { EmployeeProjectDetailBootstrapQuery } from "@/schema/projects";
import type { ProjectConstructionStagesResult } from "@/services/construction-stage-status/legacy/lists";
import type {
  ProjectWorkflowProgress,
  WorkflowTimelineNode,
} from "@/services/project-workflow-progress";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext, EffectivePermission } from "@/services/authorization";
import { projectLogService } from "@/services/project-logs";
import { projectSer } from "@/services/projects";
import {
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  isProjectStatus,
  type ProjectLogStageCode,
} from "@gooes/domain";

export type PartialError = {
  module: string;
  code: string | null;
  message: string;
};

export type BootstrapTimingStep =
  | "bootstrap_data_ms"
  | "project_ms"
  | "permissions_ms"
  | "members_ms"
  | "workflow_progress_ms"
  | "workflow_actions_ms"
  | "workflow_state_ms"
  | "construction_stages_ms"
  | "logs_ms"
  | "calendar_ms";

export type EmployeeProjectDetailBootstrapTimings =
  Record<BootstrapTimingStep, number>;

export const OPTIONAL_MODULE_TIMEOUT_MS = 2_500;

export type ProjectWorkflowState = {
  subject_type: string;
  subject_id: string;
  instance_id?: string | null;
  instance_status?: string | null;
  current_node_key?: string | null;
  current_node_title?: string | null;
  current_group_key?: string | null;
  current_group_label?: string | null;
  current_group_order?: number | null;
  current_business_kind?: string | null;
  pending_task_count?: number | null;
  actions: Array<Record<string, unknown>>;
  timeline_nodes?: WorkflowTimelineNode[];
} | null;

export type WorkflowProgressResult = ProjectWorkflowProgress;
export type ConstructionStagesResult = ProjectConstructionStagesResult;
export type ProjectLogListResult = Awaited<
  ReturnType<typeof projectLogService.listProjectLogsByProject>
>;
export type ProjectMembersResult = Awaited<
  ReturnType<typeof projectSer.listProjectMembersForDetail>
>;
export type ProjectLogCalendarResult = Awaited<
  ReturnType<typeof projectLogService.listProjectLogCalendar>
>;
export type ProjectLogCommentSummaryMap = Awaited<
  ReturnType<typeof projectLogService.listProjectLogCommentCounts>
>;

export type BootstrapPermissions = {
  employee_id: string | null;
  can_read_project: boolean;
  can_update_project: boolean;
  can_manage_project_team: boolean;
  can_create_project_log: boolean;
  can_access_project_acceptance: boolean;
  can_view_project_referral: boolean;
  can_manage_project_referral: boolean;
  scopes: {
    project_update: EffectivePermission["scope"] | null;
    project_log_create: EffectivePermission["scope"] | null;
    project_acceptance_manage: EffectivePermission["scope"] | null;
  };
};

export type InternalBootstrapPermissions = BootstrapPermissions & {
  internal_can_create_acceptance: boolean;
  internal_can_manage_acceptance: boolean;
};

export type ProjectLogEntrySummary = {
  can_create: boolean;
  writable_stage: {
    stage_code: ProjectLogStageCode;
    stage_label: string;
  } | null;
  blocked_reason: string | null;
  next_action: {
    kind: "acceptance" | "refresh";
    label: string;
    stage_code?: string | null;
    acceptance_id?: string | null;
    action?: string | null;
  } | null;
};

export type ProjectWorkflowBlockingState = {
  instance_status?: string | null;
  current_business_kind?: string | null;
  current_node_title?: string | null;
} | null;

export type ProjectDetailNextAction =
  {
    kind: "acceptance";
    source: "project_acceptance";
    title: string;
    description: string;
    action_label: string;
    action_type: "create" | "edit" | "view";
    stage_code: ProjectLogStageCode;
    stage_label: string;
    acceptance_id: string | null;
    type: "create" | "edit" | "view";
    label: string;
    enabled: boolean;
    reason: string | null;
  };

export type { EmployeeProjectDetailBootstrapQuery };
export type { AuthContext, EffectivePermission };
export { accessPolicyService, projectLogService, projectSer };
export {
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  isProjectStatus,
};
export type { ProjectLogStageCode };
