import {
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  ProjectAcceptanceStatusConfig,
  isProjectConstructionStageCode,
  type ProjectAcceptanceRow,
  type ProjectConstructionStageStatus,
  type ProjectLogLatestStageRow,
  type ProjectLogStageCode,
} from "./shared";
import { getStageLabel } from "./labels";

export function buildStageItem(input: {
  stageCode: ProjectLogStageCode;
  acceptance?: ProjectAcceptanceRow | null;
  latestLog?: ProjectLogLatestStageRow | null;
  hasLog: boolean;
  blockedReason: string | null;
  projectStatus?: string | null;
  canCreateAcceptanceByPermission: boolean;
  canHandleExistingAcceptance: boolean;
}) {
  const acceptance = input.acceptance ?? null;
  const latestLog = input.latestLog ?? null;
  const status: ProjectConstructionStageStatus = input.blockedReason
    ? "locked"
    : acceptance?.status === "customer_confirmed"
      ? "accepted"
      : acceptance?.status === "rejected"
        ? "rework_required"
        : acceptance
          ? "pending_acceptance"
          : input.hasLog
            ? "in_progress"
            : "not_started";
  const isCompletion =
    input.stageCode === PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE;
  const isRequired = isProjectConstructionStageCode(input.stageCode);
  const isAcceptanceWritableStatus = input.projectStatus === "constructing" ||
    input.projectStatus === "acceptance";
  const canCreateLog = isRequired &&
    !input.blockedReason &&
    (input.projectStatus === "started" || input.projectStatus === "constructing") &&
    status !== "accepted" &&
    status !== "pending_acceptance";
  const canCreateAcceptance = !input.blockedReason &&
    !acceptance &&
    input.canCreateAcceptanceByPermission &&
    status !== "accepted" &&
    status !== "pending_acceptance" &&
    (isCompletion
      ? input.projectStatus === "acceptance"
      : isRequired && isAcceptanceWritableStatus);
  const acceptanceAction = buildAcceptanceAction({
    acceptance,
    canCreateAcceptance,
    blockedReason: input.blockedReason,
    canCreateAcceptanceByPermission: input.canCreateAcceptanceByPermission,
    canHandleExistingAcceptance: input.canHandleExistingAcceptance,
  });

  return {
    stage_code: input.stageCode,
    stage_label: getStageLabel(input.stageCode),
    status,
    is_required: isRequired,
    is_completion: isCompletion,
    can_create_log: canCreateLog,
    can_create_acceptance: canCreateAcceptance,
    acceptance_id: acceptance?.id ?? null,
    acceptance_status: acceptance?.status ?? null,
    acceptance: acceptance
      ? {
        id: acceptance.id,
        status: acceptance.status,
        status_label: ProjectAcceptanceStatusConfig[acceptance.status].label,
        stage_code: input.stageCode,
        stage_label: getStageLabel(input.stageCode),
        reviewed_at: acceptance.reviewed_at,
        customer_confirmed_at: acceptance.customer_confirmed_at,
        updated_at: acceptance.updated_at,
      }
      : null,
    acceptance_action: acceptanceAction,
    latest_log: latestLog
      ? {
        id: latestLog.id,
        node_name: latestLog.node_name,
        content: latestLog.content,
        created_at: latestLog.created_at,
      }
      : null,
    blocked_reason: input.blockedReason,
  };
}

export type ProjectConstructionStageItem = ReturnType<typeof buildStageItem>;

function buildAcceptanceAction(input: {
  acceptance: ProjectAcceptanceRow | null;
  canCreateAcceptance: boolean;
  blockedReason: string | null;
  canCreateAcceptanceByPermission: boolean;
  canHandleExistingAcceptance: boolean;
}) {
  if (input.acceptance) {
    if (input.acceptance.status === "draft" || input.acceptance.status === "rejected") {
      return {
        type: "edit" as const,
        label: "处理验收",
        enabled: input.canHandleExistingAcceptance,
        reason: input.canHandleExistingAcceptance
          ? null
          : "当前员工无验收处理权限",
      };
    }

    if (input.acceptance.status === "submitted") {
      return {
        type: "view" as const,
        label: input.canHandleExistingAcceptance ? "复核验收" : "查看验收",
        enabled: true,
        reason: null,
      };
    }

    return {
      type: "view" as const,
      label: "查看验收",
      enabled: true,
      reason: null,
    };
  }

  if (input.canCreateAcceptance) {
    return {
      type: "create" as const,
      label: "发起验收",
      enabled: true,
      reason: null,
    };
  }

  return {
    type: "none" as const,
    label: "",
    enabled: false,
    reason: input.canCreateAcceptanceByPermission
      ? input.blockedReason
      : "当前员工无验收创建权限",
  };
}
