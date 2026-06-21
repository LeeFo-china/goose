import {
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  type ProjectLogStageCode,
} from "@gooes/domain";
import type { ConstructionStageItem, ProjectAcceptance } from "@/components/projects/project-acceptance-types";
import type { WorkflowSubjectAction, WorkflowSubjectTimelineNode } from "@/components/workflows/workflow-subject-state-panel";
import {
  getAcceptanceDisplaySections,
  getAcceptanceItemStats,
  getLatestCustomerDispute,
  getLatestRejectAction,
  openAcceptanceStatuses,
  stageOptions,
} from "@/components/projects/project-acceptance-utils";

const stageOptionMap: ReadonlyMap<
  ProjectLogStageCode,
  { value: ProjectLogStageCode; label: string }
> = new Map(stageOptions.map((item) => [item.value, item]));
const workflowAcceptanceActionKeys = new Set([
  "create_acceptance",
  "edit_acceptance",
  "view_acceptance",
]);

type WorkflowAcceptanceAction = WorkflowSubjectAction & {
  stage_code?: string | null;
  acceptance_id?: string | null;
  acceptance_status?: string | null;
};

function isProjectLogStageCode(value: unknown): value is ProjectLogStageCode {
  return typeof value === "string" && stageOptionMap.has(value as ProjectLogStageCode);
}

function getNodeStageCode(node: WorkflowSubjectTimelineNode): ProjectLogStageCode | null {
  const stageCode = node.attributes?.stage_code;
  return isProjectLogStageCode(stageCode) ? stageCode : null;
}

function getWorkflowAcceptanceActions(node: WorkflowSubjectTimelineNode) {
  return (node.actions || [])
    .filter((action): action is WorkflowAcceptanceAction =>
      workflowAcceptanceActionKeys.has(action.key)
    );
}

function getStageLabel(stageCode: ProjectLogStageCode, node: WorkflowSubjectTimelineNode) {
  return stageOptionMap.get(stageCode)?.label
    || node.display?.label
    || node.node_title
    || node.title
    || stageCode;
}

function getWorkflowAcceptanceState(input: {
  node: WorkflowSubjectTimelineNode;
  acceptance: ProjectAcceptance | undefined;
  createAction: WorkflowAcceptanceAction | undefined;
  workflowAction: WorkflowAcceptanceAction | undefined;
}) {
  if (input.acceptance) {
    return {
      disabled: true,
      stateLabel: input.acceptance.status_label,
      blockedReason: "该工序已有进行中的验收单",
    };
  }

  if (input.createAction) {
    return {
      disabled: input.createAction.disabled,
      stateLabel: input.createAction.disabled
        ? input.createAction.disabled_reason || "不可发起"
        : "可发起",
      blockedReason: input.createAction.disabled
        ? input.createAction.disabled_reason || "当前 workflow 节点不可发起验收"
        : "",
    };
  }

  return {
    disabled: true,
    stateLabel: input.workflowAction?.label || input.node.display?.status_label || "只读",
    blockedReason: "当前 workflow 节点没有发起验收动作",
  };
}

export function getProjectAcceptancesPanelDerived(input: {
  acceptances: ProjectAcceptance[];
  constructionStages: ConstructionStageItem[];
  selectedId: string;
  stageCode: ProjectLogStageCode;
  projectStatus: string | null | undefined;
  workflowTimelineNodes?: WorkflowSubjectTimelineNode[];
}) {
  const selected = input.acceptances.find((item) => item.id === input.selectedId) || null;
  const occupiedStages = new Map(
    input.acceptances
      .filter((item) => item.acceptance_type !== "final")
      .filter((item) => openAcceptanceStatuses.has(item.status))
      .map((item) => [item.stage_code, item]),
  );
  const openFinalAcceptance = input.acceptances.find((item) =>
    item.acceptance_type === "final" && openAcceptanceStatuses.has(item.status)
  ) || null;
  const constructionStageMap = new Map(input.constructionStages.map((item) => [item.stage_code, item]));
  const selectableStageOptions = (input.workflowTimelineNodes || [])
    .filter((node) => node.attributes?.acceptance_enabled === true)
    .map((node) => {
      const stageCode = getNodeStageCode(node);
      if (!stageCode) return null;
      const acceptanceActions = getWorkflowAcceptanceActions(node);
      const createAction = acceptanceActions.find((action) => action.key === "create_acceptance");
      const workflowAction = acceptanceActions[0];
      const acceptance = occupiedStages.get(stageCode);
      const workflowState = getWorkflowAcceptanceState({
        node,
        acceptance,
        createAction,
        workflowAction,
      });

      return {
        value: stageCode,
        label: getStageLabel(stageCode, node),
        acceptance,
        constructionStage: constructionStageMap.get(stageCode),
        workflowNode: node,
        workflowAction,
        createAction,
        ...workflowState,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const firstAvailableStage = selectableStageOptions.find((item) =>
    !item.acceptance && item.createAction && !item.createAction.disabled
  );
  const selectedStageOption = selectableStageOptions.find((item) => item.value === input.stageCode);
  const selectedStageBlockedReason = selectedStageOption?.blockedReason || "";
  const selectedStageBlocked = Boolean(selectedStageBlockedReason);
  const canCreateByProjectStatus = true;
  const canCreateAcceptance = Boolean(firstAvailableStage);
  const canCreateFinalAcceptance = input.projectStatus === "constructing" &&
    !openFinalAcceptance &&
    input.constructionStages.length > 0 &&
    input.constructionStages.every((stage) =>
      stage.stage_code === PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE ||
      stage.status === "accepted"
    );
  const finalAcceptanceBlockedReason = openFinalAcceptance
    ? "当前项目已有进行中的竣工交付验收"
    : input.projectStatus !== "constructing"
    ? "仅施工中项目可发起竣工交付验收"
    : input.constructionStages.length === 0
    ? "施工阶段状态加载后才可发起竣工交付验收"
    : canCreateFinalAcceptance
    ? ""
    : "必需施工阶段全部完成后才可发起竣工交付验收";
  const summary = {
    total: input.acceptances.length,
    completed: input.acceptances.filter((item) => item.status === "customer_confirmed").length,
    pending: input.acceptances.filter((item) => openAcceptanceStatuses.has(item.status)).length,
    blocked: selectableStageOptions.filter((item) => item.constructionStage?.blocked_reason).length,
  };

  return {
    summary,
    selected,
    latestCustomerDispute: getLatestCustomerDispute(selected),
    latestRejectAction: getLatestRejectAction(selected),
    selectedStats: getAcceptanceItemStats(selected),
    selectedSections: selected ? getAcceptanceDisplaySections(selected) : [],
    occupiedStages,
    selectableStageOptions,
    firstAvailableStage,
    selectedStageBlockedReason,
    selectedStageBlocked,
    canCreateByProjectStatus,
    canCreateAcceptance,
    canCreateFinalAcceptance,
    finalAcceptanceBlockedReason,
  };
}
