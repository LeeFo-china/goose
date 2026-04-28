export const EMPLOYEE_STATUS_VALUES = [
  'pending',
  'active',
  'suspended',
  'leaved',
] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUS_VALUES)[number];

export const EMPLOYEE_ROLE_VALUES = [
  'admin',
  'employee',
  'finance',
] as const;

export type EmployeeRole = (typeof EMPLOYEE_ROLE_VALUES)[number];

export const EmployeeStatusConfig: Record<
  EmployeeStatus,
  {
    label: string;
    type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  }
> = {
  pending: { label: '待入职', type: 'warning' },
  active: { label: '在职', type: 'success' },
  suspended: { label: '已封禁', type: 'danger' },
  leaved: { label: '已离职', type: 'default' },
};

export const EmployeeRoleConfig: Record<
  EmployeeRole,
  {
    label: string;
    type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  }
> = {
  admin: { label: '管理员', type: 'danger' },
  employee: { label: '员工', type: 'primary' },
  finance: { label: '财务', type: 'success' },
};

export const isEmployeeStatus = (
  value: string | null | undefined,
): value is EmployeeStatus =>
  typeof value === 'string' &&
  EMPLOYEE_STATUS_VALUES.includes(value as EmployeeStatus);

export const isEmployeeOperableStatus = (
  value: string | null | undefined,
): value is 'active' => value === 'active';

export const isEmployeeRole = (
  value: string | null | undefined,
): value is EmployeeRole =>
  typeof value === 'string' &&
  EMPLOYEE_ROLE_VALUES.includes(value as EmployeeRole);
