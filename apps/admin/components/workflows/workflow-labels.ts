import {
  WorkflowCategoryConfig,
  WorkflowDefinitionStatusConfig,
  type WorkflowCategory,
  type WorkflowDefinitionStatus,
} from "@gooes/domain";

export const workflowStatusOptions = [
  ["", "全部状态"],
  ...Object.entries(WorkflowDefinitionStatusConfig).map(([value, config]) => [
    value,
    config.label,
  ] as const),
] as const;

export const workflowCategoryOptions = [
  ["", "全部分类"],
  ...Object.entries(WorkflowCategoryConfig).map(([value, config]) => [
    value,
    config.label,
  ] as const),
] as const;

export function workflowStatusLabel(status: WorkflowDefinitionStatus) {
  return WorkflowDefinitionStatusConfig[status].label;
}

export function workflowCategoryLabel(category: WorkflowCategory) {
  return WorkflowCategoryConfig[category].label;
}

export function workflowStatusVariant(status: WorkflowDefinitionStatus) {
  const type = WorkflowDefinitionStatusConfig[status].type;
  if (type === "success") return "success";
  if (type === "warning") return "warning";
  if (type === "danger") return "danger";
  if (type === "default") return "secondary";
  return "default";
}

export function formatWorkflowDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}
