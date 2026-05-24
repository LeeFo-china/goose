export const PROJECT_LOG_STAGE_CODE_VALUES = [
  'measure',
  'demolition',
  'plumbing_electrical',
  'tiling',
  'woodwork',
  'painting',
  'installation',
  'completion',
] as const;

export type ProjectLogStageCode =
  (typeof PROJECT_LOG_STAGE_CODE_VALUES)[number];

export interface ProjectLogStageConfigItem {
  label: string;
}

export const PROJECT_LOG_STAGE_CONFIG: Record<
  ProjectLogStageCode,
  ProjectLogStageConfigItem
> = {
  measure: { label: '量房' },
  demolition: { label: '拆改' },
  plumbing_electrical: { label: '水电' },
  tiling: { label: '瓦工' },
  woodwork: { label: '木工' },
  painting: { label: '油工' },
  installation: { label: '安装' },
  completion: { label: '竣工' },
};

export const PROJECT_CONSTRUCTION_STAGE_CODE_VALUES = [
  'demolition',
  'plumbing_electrical',
  'tiling',
  'woodwork',
  'painting',
  'installation',
] as const satisfies readonly ProjectLogStageCode[];

export type ProjectConstructionStageCode =
  (typeof PROJECT_CONSTRUCTION_STAGE_CODE_VALUES)[number];

export const PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE =
  'completion' as const satisfies ProjectLogStageCode;

export const PROJECT_CONSTRUCTION_AUXILIARY_STAGE_CODE_VALUES = [
  'measure',
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
] as const satisfies readonly ProjectLogStageCode[];

export const PROJECT_CONSTRUCTION_STAGE_STATUS_VALUES = [
  'locked',
  'not_started',
  'in_progress',
  'pending_acceptance',
  'rework_required',
  'accepted',
] as const;

export type ProjectConstructionStageStatus =
  (typeof PROJECT_CONSTRUCTION_STAGE_STATUS_VALUES)[number];

export const isProjectLogStageCode = (
  value: string | null | undefined,
): value is ProjectLogStageCode =>
  typeof value === 'string' &&
  PROJECT_LOG_STAGE_CODE_VALUES.includes(value as ProjectLogStageCode);

export const isProjectConstructionStageCode = (
  value: string | null | undefined,
): value is ProjectConstructionStageCode =>
  typeof value === 'string' &&
  PROJECT_CONSTRUCTION_STAGE_CODE_VALUES.includes(
    value as ProjectConstructionStageCode,
  );

export function getPreviousProjectConstructionStage(
  stageCode: ProjectLogStageCode,
): ProjectConstructionStageCode | null {
  const index = PROJECT_CONSTRUCTION_STAGE_CODE_VALUES.indexOf(
    stageCode as ProjectConstructionStageCode,
  );

  if (index <= 0) {
    return null;
  }

  return PROJECT_CONSTRUCTION_STAGE_CODE_VALUES[index - 1] ?? null;
}

export const PROJECT_LOG_COMMENT_AUTHOR_TYPE_VALUES = [
  'employee',
  'customer',
] as const;

export type ProjectLogCommentAuthorType =
  (typeof PROJECT_LOG_COMMENT_AUTHOR_TYPE_VALUES)[number];
