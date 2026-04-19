export const POST_CODE_VALUES = [
  'MARKETING_DIRECTOR',
  'SALES_CONSULTANT',
  'DESIGN_DIRECTOR',
  'INTERIOR_DESIGNER',
  'PROJECT_MANAGER',
  'CONSTRUCTION_SUPER',
  'FINANCE_ACCOUNTANT',
  'PROCURE_OFFICER',
] as const;

export type PostCode = (typeof POST_CODE_VALUES)[number];

export const SALARY_TYPE_VALUES = [
  'fixed',
  'commission',
  'hourly',
  'performance',
] as const;

export type SalaryType = (typeof SALARY_TYPE_VALUES)[number];

export const POST_STATUS_VALUES = [0, 1] as const;

export type PostStatus = (typeof POST_STATUS_VALUES)[number];

export interface PostConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const PostConfig: Record<PostCode, PostConfigItem> = {
  MARKETING_DIRECTOR: { label: '营销总监', type: 'danger' },
  SALES_CONSULTANT: { label: '客户经理', type: 'primary' },
  DESIGN_DIRECTOR: { label: '设计总监', type: 'danger' },
  INTERIOR_DESIGNER: { label: '设计师', type: 'primary' },
  PROJECT_MANAGER: { label: '项目经理', type: 'warning' },
  CONSTRUCTION_SUPER: { label: '工程监理', type: 'success' },
  FINANCE_ACCOUNTANT: { label: '会计', type: 'success' },
  PROCURE_OFFICER: { label: '采购专员', type: 'primary' },
};

export const SalaryTypeConfig: Record<SalaryType, PostConfigItem> = {
  fixed: { label: '固定薪资', type: 'default' },
  commission: { label: '底薪+提成', type: 'primary' },
  hourly: { label: '时薪制', type: 'warning' },
  performance: { label: '绩效考核', type: 'success' },
};

export const PostStatusConfig: Record<PostStatus, PostConfigItem> = {
  1: { label: '启用', type: 'success' },
  0: { label: '禁用', type: 'danger' },
};

export const isPostCode = (
  value: string | null | undefined,
): value is PostCode =>
  typeof value === 'string' && POST_CODE_VALUES.includes(value as PostCode);

export const isSalaryType = (
  value: string | null | undefined,
): value is SalaryType =>
  typeof value === 'string' && SALARY_TYPE_VALUES.includes(value as SalaryType);

export const isPostStatus = (
  value: number | null | undefined,
): value is PostStatus =>
  typeof value === 'number' && POST_STATUS_VALUES.includes(value as PostStatus);
