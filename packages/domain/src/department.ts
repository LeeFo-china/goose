export const DEPARTMENT_CODE_VALUES = [
  'ADMIN',
  'FINANCE',
  'MARKETING',
  'DESIGN',
  'PROJECT',
  'PROCURE',
  'AFTER_SALE',
  'SELF_MEDIA',
] as const;

export type DepartmentCode = (typeof DEPARTMENT_CODE_VALUES)[number];

export interface DepartmentConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const DepartmentConfig: Record<DepartmentCode, DepartmentConfigItem> = {
  ADMIN: { label: '行政人事', type: 'default' },
  FINANCE: { label: '财务部', type: 'success' },
  MARKETING: { label: '市场部', type: 'primary' },
  DESIGN: { label: '设计部', type: 'warning' },
  PROJECT: { label: '工程部', type: 'danger' },
  PROCURE: { label: '采购部', type: 'primary' },
  AFTER_SALE: { label: '售后部', type: 'default' },
  SELF_MEDIA: { label: '自媒体', type: 'success' },
};

export const isDepartmentCode = (
  value: string | null | undefined,
): value is DepartmentCode =>
  typeof value === 'string' &&
  DEPARTMENT_CODE_VALUES.includes(value as DepartmentCode);
