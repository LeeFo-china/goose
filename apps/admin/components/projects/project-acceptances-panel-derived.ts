import {
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  type ProjectLogStageCode,
} from "@gooes/domain";
import type { ConstructionStageItem, ProjectAcceptance } from "@/components/projects/project-acceptance-types";
import {
  getAcceptanceDisplaySections,
  getAcceptanceItemStats,
  getLatestCustomerDispute,
  getLatestRejectAction,
  openAcceptanceStatuses,
  stageOptions,
} from "@/components/projects/project-acceptance-utils";

export function getProjectAcceptancesPanelDerived(input: {
  acceptances: ProjectAcceptance[];
  constructionStages: ConstructionStageItem[];
  selectedId: string;
  stageCode: ProjectLogStageCode;
  projectStatus: string | null | undefined;
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
  const constructionStageMap = new Map(
    input.constructionStages.map((item) => [item.stage_code, item]),
  );
  const selectableStageOptions = stageOptions.map((item) => ({
    ...item,
    acceptance: occupiedStages.get(item.value),
    constructionStage: constructionStageMap.get(item.value),
  }));
  const firstAvailableStage = selectableStageOptions.find((item) =>
    !item.acceptance && !item.constructionStage?.blocked_reason
  );
  const selectedStageBlockedReason = occupiedStages.get(input.stageCode)
    ? "该工序已有进行中的验收单"
    : constructionStageMap.get(input.stageCode)?.blocked_reason || "";
  const selectedStageBlocked = Boolean(selectedStageBlockedReason);
  const canCreateByProjectStatus =
    input.projectStatus === "constructing" || input.projectStatus === "acceptance";
  const canCreateAcceptance = canCreateByProjectStatus &&
    Boolean(firstAvailableStage) &&
    !selectedStageBlocked;
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

  return {
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
