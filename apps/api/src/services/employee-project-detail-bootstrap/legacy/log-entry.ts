import { PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE } from "./shared";
import type {
  BootstrapPermissions,
  ConstructionStagesResult,
  ProjectDetailNextAction,
  ProjectLogCommentSummaryMap,
  ProjectLogEntrySummary,
  ProjectLogListResult,
  WorkflowProgressResult,
  projectSer,
} from "./shared";
import {
  PROJECT_LOG_STAGE_CONFIG,
  isProjectConstructionStageCode,
  type ProjectLogStageCode,
} from "@gooes/domain";

export function buildLogsFromBundle(this: any, 
  bundle: Awaited<ReturnType<typeof projectSer.getEmployeeProjectBootstrapBundle>>,
  pageSize: number,
): ProjectLogListResult & {
  commentSummaries: ProjectLogCommentSummaryMap;
} {
  const rows = bundle.logs.rows;
  const total = rows.length + (bundle.logs.has_more ? 1 : 0);

  return {
    rows,
    pagination: {
      page: 1,
      pageSize,
      total,
      totalPages: total ? Math.ceil(total / pageSize) : 0,
    },
    commentSummaries: this.buildCommentAggregateMap(bundle.logs.comment_counts),
  };
}

export function buildCommentAggregateMap(this: any, rows: Array<{
  log_id: string;
  comment_count: number | string;
}>) {
  const map = new Map<string, {
    comment_count: number;
    latest_comment: null;
  }>();

  for (const row of rows) {
    const count = typeof row.comment_count === "number"
      ? row.comment_count
      : Number(row.comment_count);
    map.set(row.log_id, {
      comment_count: Number.isFinite(count) ? count : 0,
      latest_comment: null,
    });
  }

  return map;
}

export function buildProjectLogEntry(this: any, input: {
  project: Record<string, unknown>;
  permissions: BootstrapPermissions;
  constructionStages: ConstructionStagesResult | null;
  workflowProgress?: WorkflowProgressResult | null;
  nextAction: ProjectDetailNextAction | null;
  workflowBlockingReason?: string | null;
}): ProjectLogEntrySummary {
  if (input.workflowBlockingReason) {
    return {
      can_create: false,
      writable_stage: null,
      blocked_reason: input.workflowBlockingReason,
      next_action: this.buildProjectLogEntryNextAction(input),
    };
  }

  if (input.workflowProgress?.source === "workflow_runtime") {
    const workflowWritableStage = resolveWorkflowWritableLogStage(
      input.workflowProgress,
    );
    if (
      input.permissions.can_create_project_log &&
      workflowWritableStage?.canCreate === true
    ) {
      return {
        can_create: true,
        writable_stage: {
          stage_code: workflowWritableStage.stageCode,
          stage_label: workflowWritableStage.stageLabel,
        },
        blocked_reason: null,
        next_action: null,
      };
    }

    return {
      can_create: false,
      writable_stage: null,
      blocked_reason: this.buildProjectLogEntryBlockedReason(input),
      next_action: this.buildProjectLogEntryNextAction(input),
    };
  }

  const stages = input.constructionStages?.stages ?? [];
  const writableStages = stages.filter((stage) =>
    stage.can_create_log === true &&
    stage.stage_code !== PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE
  );
  const currentStageCode = input.constructionStages?.current_stage ?? null;
  const writableStage =
    writableStages.find((stage) => stage.stage_code === currentStageCode) ??
    writableStages.find((stage) => stage.status === "in_progress") ??
    writableStages[0] ??
    null;

  if (input.permissions.can_create_project_log && writableStage) {
    return {
      can_create: true,
      writable_stage: {
        stage_code: writableStage.stage_code,
        stage_label: writableStage.stage_label,
      },
      blocked_reason: null,
      next_action: null,
    };
  }

  return {
    can_create: false,
    writable_stage: null,
    blocked_reason: this.buildProjectLogEntryBlockedReason(input),
    next_action: this.buildProjectLogEntryNextAction(input),
  };
}

export function buildProjectLogEntryBlockedReason(this: any, input: {
  project: Record<string, unknown>;
  permissions: BootstrapPermissions;
  constructionStages: ConstructionStagesResult | null;
  workflowProgress?: WorkflowProgressResult | null;
  workflowBlockingReason?: string | null;
}) {
  if (input.workflowBlockingReason) {
    return input.workflowBlockingReason;
  }

  if (!input.permissions.scopes.project_log_create) {
    return "当前员工无施工日志创建权限";
  }

  if (input.workflowProgress?.source === "workflow_runtime") {
    const workflowWritableStage = resolveWorkflowWritableLogStage(
      input.workflowProgress,
    );
    return workflowWritableStage?.blockedReason ?? "当前暂无可写施工工序";
  }

  const status = typeof input.project.status === "string"
    ? input.project.status
    : null;
  if (status !== "started" && status !== "constructing") {
    if (status === "invalid") return "无效项目不能新增施工日志";
    if (status === "on_hold") return "暂停项目不能新增施工日志";
    if (status === "acceptance") return "竣工验收项目不能新增施工日志";
    return "当前项目状态不能新增施工日志";
  }

  const stages = input.constructionStages?.stages ?? [];
  if (stages.length === 0) {
    return "施工阶段未同步，请刷新后重试";
  }

  const currentStage = stages.find((stage) =>
    stage.stage_code === input.constructionStages?.current_stage
  );
  const blockedStage = currentStage ?? stages.find((stage) =>
    stage.blocked_reason ||
    stage.status === "pending_acceptance" ||
    stage.status === "accepted"
  );
  if (blockedStage?.blocked_reason) {
    return blockedStage.blocked_reason;
  }
  if (blockedStage?.status === "pending_acceptance") {
    return `当前${blockedStage.stage_label}阶段待验收，完成验收后再补充施工日志`;
  }
  if (blockedStage?.status === "accepted") {
    return `当前${blockedStage.stage_label}阶段已验收完成，不能继续补充施工日志`;
  }

  return "当前暂无可写施工阶段";
}

function resolveWorkflowWritableLogStage(
  workflowProgress: WorkflowProgressResult,
): {
  canCreate: boolean;
  stageCode: ProjectLogStageCode;
  stageLabel: string;
  blockedReason: string | null;
} | null {
  const currentNode = workflowProgress.timeline_nodes.find((node) =>
    node.status === "current" ||
    node.node_key === workflowProgress.current_node_key
  );
  const stageCode = typeof currentNode?.attributes.stage_code === "string"
    ? currentNode.attributes.stage_code
    : null;
  if (!isProjectConstructionStageCode(stageCode)) {
    return null;
  }

  const stageLabel = PROJECT_LOG_STAGE_CONFIG[stageCode]?.label || stageCode;
  const assignmentStatus = currentNode?.attributes.procedure_assignment_status;
  if (assignmentStatus === "in_progress") {
    return { canCreate: true, stageCode, stageLabel, blockedReason: null };
  }
  if (assignmentStatus === "planned") {
    return {
      canCreate: false,
      stageCode,
      stageLabel,
      blockedReason: `当前${stageLabel}工序尚未开工，不能新增施工日志`,
    };
  }
  if (assignmentStatus === "completed" || assignmentStatus === "canceled") {
    return {
      canCreate: false,
      stageCode,
      stageLabel,
      blockedReason: `当前${stageLabel}工序已结束，不能继续新增施工日志`,
    };
  }

  return {
    canCreate: false,
    stageCode,
    stageLabel,
    blockedReason: `请先开始${stageLabel}工序派工`,
  };
}

export function buildProjectLogEntryNextAction(this: any, input: {
  constructionStages: ConstructionStagesResult | null;
  nextAction: ProjectDetailNextAction | null;
  workflowBlockingReason?: string | null;
}): ProjectLogEntrySummary["next_action"] {
  if (input.workflowBlockingReason) {
    return {
      kind: "refresh",
      label: input.workflowBlockingReason,
      action: "refresh",
    };
  }

  const acceptanceStage = this.selectNextAcceptanceActionStage(
    input.constructionStages,
  );

  if (acceptanceStage?.acceptance_action?.type) {
    return {
      kind: "acceptance",
      label: acceptanceStage.acceptance_action.label || "处理验收",
      stage_code: acceptanceStage.stage_code,
      acceptance_id: acceptanceStage.acceptance_id ?? null,
      action: acceptanceStage.acceptance_action.type,
    };
  }

  return null;
}
