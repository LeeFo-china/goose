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

export const isProjectLogStageCode = (
  value: string | null | undefined,
): value is ProjectLogStageCode =>
  typeof value === 'string' &&
  PROJECT_LOG_STAGE_CODE_VALUES.includes(value as ProjectLogStageCode);

export const PROJECT_LOG_COMMENT_AUTHOR_TYPE_VALUES = [
  'employee',
  'customer',
] as const;

export type ProjectLogCommentAuthorType =
  (typeof PROJECT_LOG_COMMENT_AUTHOR_TYPE_VALUES)[number];
