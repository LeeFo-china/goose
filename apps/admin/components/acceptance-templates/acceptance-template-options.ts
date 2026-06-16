import {
  PROJECT_ACCEPTANCE_STAGE_LABELS,
  PROJECT_LOG_STAGE_CODE_VALUES,
  type ProjectLogStageCode,
} from "@gooes/domain";
import type { AcceptanceTemplateFilters } from "@/components/acceptance-templates/acceptance-template-types";

export const ACCEPTANCE_TEMPLATE_ALL_VALUE = "__all";

export const acceptanceTemplateTypeOptions = [
  { value: ACCEPTANCE_TEMPLATE_ALL_VALUE, label: "全部类型" },
  { value: "stage", label: "工序验收" },
  { value: "final", label: "竣工验收" },
] as const;

export const acceptanceTemplateStatusOptions = [
  { value: ACCEPTANCE_TEMPLATE_ALL_VALUE, label: "全部状态" },
  { value: "active", label: "启用中" },
  { value: "inactive", label: "已停用" },
] as const;

export const acceptanceTemplateStageOptions = [
  { value: ACCEPTANCE_TEMPLATE_ALL_VALUE, label: "全部工序" },
  ...PROJECT_LOG_STAGE_CODE_VALUES.map((value) => ({
    value,
    label: PROJECT_ACCEPTANCE_STAGE_LABELS[value],
  })),
];

export function buildAcceptanceTemplatesHref(
  input: Partial<AcceptanceTemplateFilters>,
) {
  const params = new URLSearchParams();
  if (input.acceptanceType) params.set("acceptance_type", input.acceptanceType);
  if (input.stageCode) params.set("stage_code", input.stageCode);
  if (input.status) params.set("status", input.status);
  if (input.templateId) params.set("template_id", input.templateId);
  const query = params.toString();
  return query ? `/acceptance-templates?${query}` : "/acceptance-templates";
}

export function getAcceptanceTypeLabel(value: string) {
  if (value === "final") return "竣工验收";
  return "工序验收";
}

export function getAcceptanceTemplateStageLabel(stageCode: ProjectLogStageCode) {
  return PROJECT_ACCEPTANCE_STAGE_LABELS[stageCode] || stageCode;
}
