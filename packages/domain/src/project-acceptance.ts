import type { ProjectLogStageCode } from './project-log';

export const PROJECT_ACCEPTANCE_STATUS_VALUES = [
  'draft',
  'submitted',
  'leader_approved',
  'customer_confirmed',
  'rejected',
  'cancelled',
] as const;

export type ProjectAcceptanceStatus =
  (typeof PROJECT_ACCEPTANCE_STATUS_VALUES)[number];

export const PROJECT_ACCEPTANCE_ACTION_VALUES = [
  'create',
  'update',
  'submit',
  'leader_approve',
  'leader_reject',
  'customer_confirm',
  'customer_dispute',
  'employee_rectify',
  'cancel',
] as const;

export type ProjectAcceptanceAction =
  (typeof PROJECT_ACCEPTANCE_ACTION_VALUES)[number];

export const PROJECT_ACCEPTANCE_ITEM_RESULT_VALUES = [
  'pass',
  'fail',
  'not_applicable',
] as const;

export type ProjectAcceptanceItemResult =
  (typeof PROJECT_ACCEPTANCE_ITEM_RESULT_VALUES)[number];

export const PROJECT_ACCEPTANCE_REJECT_SOURCE_VALUES = [
  'leader',
  'customer',
] as const;

export type ProjectAcceptanceRejectSource =
  (typeof PROJECT_ACCEPTANCE_REJECT_SOURCE_VALUES)[number];

export const PROJECT_ACCEPTANCE_FLOW_MODE_VALUES = [
  'leader_then_customer',
] as const;

export type ProjectAcceptanceFlowMode =
  (typeof PROJECT_ACCEPTANCE_FLOW_MODE_VALUES)[number];

export interface ProjectAcceptanceStatusConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const ProjectAcceptanceStatusConfig: Record<
  ProjectAcceptanceStatus,
  ProjectAcceptanceStatusConfigItem
> = {
  draft: { label: '草稿', type: 'default' },
  submitted: { label: '待领导复核', type: 'warning' },
  leader_approved: { label: '待业主确认', type: 'primary' },
  customer_confirmed: { label: '已完成', type: 'success' },
  rejected: { label: '需整改', type: 'danger' },
  cancelled: { label: '已作废', type: 'default' },
};

export const PROJECT_ACCEPTANCE_STAGE_LABELS: Record<
  ProjectLogStageCode,
  string
> = {
  measure: '量房复核',
  demolition: '拆改验收',
  plumbing_electrical: '水电验收',
  tiling: '瓦工验收',
  woodwork: '木工验收',
  painting: '油工验收',
  installation: '安装验收',
  completion: '竣工验收',
};

export const isProjectAcceptanceStatus = (
  value: string | null | undefined,
): value is ProjectAcceptanceStatus =>
  typeof value === 'string' &&
  PROJECT_ACCEPTANCE_STATUS_VALUES.includes(value as ProjectAcceptanceStatus);

export const isProjectAcceptanceAction = (
  value: string | null | undefined,
): value is ProjectAcceptanceAction =>
  typeof value === 'string' &&
  PROJECT_ACCEPTANCE_ACTION_VALUES.includes(value as ProjectAcceptanceAction);

export const isProjectAcceptanceItemResult = (
  value: string | null | undefined,
): value is ProjectAcceptanceItemResult =>
  typeof value === 'string' &&
  PROJECT_ACCEPTANCE_ITEM_RESULT_VALUES.includes(
    value as ProjectAcceptanceItemResult,
  );
