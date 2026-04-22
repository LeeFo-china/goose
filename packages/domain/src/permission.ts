export const ROLE_STATUS_VALUES = ['active', 'inactive'] as const;

export type RoleStatus = (typeof ROLE_STATUS_VALUES)[number];

export const PERMISSION_STATUS_VALUES = ['active', 'inactive'] as const;

export type PermissionStatus = (typeof PERMISSION_STATUS_VALUES)[number];

export const ACCESS_SCOPE_VALUES = [
  'self',
  'department',
  'assigned',
  'all',
] as const;

export type AccessScope = (typeof ACCESS_SCOPE_VALUES)[number];

export const PERMISSION_OVERRIDE_EFFECT_VALUES = [
  'allow',
  'deny',
] as const;

export type PermissionOverrideEffect =
  (typeof PERMISSION_OVERRIDE_EFFECT_VALUES)[number];

export const PERMISSION_CODE_VALUES = [
  'dashboard.read',
  'customer.read',
  'customer.create',
  'customer.update',
  'customer.assign_owner',
  'project.read',
  'project.create',
  'project.update',
  'project.delete',
  'project_log.create',
  'employee.read',
  'employee.create',
  'employee.update',
  'employee.permission_manage',
  'expense_request.read',
  'expense_request.create',
  'expense_request.submit',
  'expense_request.approve_manager',
  'expense_request.approve_finance',
  'expense_request.pay',
  'project_referral.read',
  'project_referral.manage',
] as const;

export type PermissionCode = (typeof PERMISSION_CODE_VALUES)[number];

export interface PermissionStatusConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const RoleStatusConfig: Record<
  RoleStatus,
  PermissionStatusConfigItem
> = {
  active: { label: '启用', type: 'success' },
  inactive: { label: '停用', type: 'default' },
};

export const PermissionStatusConfig: Record<
  PermissionStatus,
  PermissionStatusConfigItem
> = {
  active: { label: '启用', type: 'success' },
  inactive: { label: '停用', type: 'default' },
};

export const AccessScopeConfig: Record<
  AccessScope,
  { label: string }
> = {
  self: { label: '仅自己' },
  department: { label: '本部门' },
  assigned: { label: '指派范围' },
  all: { label: '全部数据' },
};

export const PermissionOverrideEffectConfig: Record<
  PermissionOverrideEffect,
  PermissionStatusConfigItem
> = {
  allow: { label: '允许', type: 'success' },
  deny: { label: '拒绝', type: 'danger' },
};

export const PermissionCodeConfig: Record<
  PermissionCode,
  { label: string; module: string }
> = {
  'dashboard.read': { label: '查看工作台', module: 'dashboard' },
  'customer.read': { label: '查看客户', module: 'customer' },
  'customer.create': { label: '新建客户', module: 'customer' },
  'customer.update': { label: '编辑客户', module: 'customer' },
  'customer.assign_owner': {
    label: '分配客户负责人',
    module: 'customer',
  },
  'project.read': { label: '查看项目', module: 'project' },
  'project.create': { label: '新建项目', module: 'project' },
  'project.update': { label: '编辑项目', module: 'project' },
  'project.delete': { label: '删除项目', module: 'project' },
  'project_log.create': {
    label: '新建施工日志',
    module: 'project_log',
  },
  'employee.read': { label: '查看员工', module: 'employee' },
  'employee.create': { label: '新建员工', module: 'employee' },
  'employee.update': { label: '编辑员工', module: 'employee' },
  'employee.permission_manage': {
    label: '管理员工权限',
    module: 'employee',
  },
  'expense_request.read': { label: '查看费用申请', module: 'expense_request' },
  'expense_request.create': {
    label: '新建费用申请',
    module: 'expense_request',
  },
  'expense_request.submit': {
    label: '提交费用申请',
    module: 'expense_request',
  },
  'expense_request.approve_manager': {
    label: '主管审批费用申请',
    module: 'expense_request',
  },
  'expense_request.approve_finance': {
    label: '财务审批费用申请',
    module: 'expense_request',
  },
  'expense_request.pay': {
    label: '登记费用打款',
    module: 'expense_request',
  },
  'project_referral.read': {
    label: '查看介绍费',
    module: 'project_referral',
  },
  'project_referral.manage': {
    label: '管理介绍费',
    module: 'project_referral',
  },
};

export const isRoleStatus = (
  value: string | null | undefined,
): value is RoleStatus =>
  typeof value === 'string' &&
  ROLE_STATUS_VALUES.includes(value as RoleStatus);

export const isPermissionStatus = (
  value: string | null | undefined,
): value is PermissionStatus =>
  typeof value === 'string' &&
  PERMISSION_STATUS_VALUES.includes(value as PermissionStatus);

export const isAccessScope = (
  value: string | null | undefined,
): value is AccessScope =>
  typeof value === 'string' &&
  ACCESS_SCOPE_VALUES.includes(value as AccessScope);

export const isPermissionOverrideEffect = (
  value: string | null | undefined,
): value is PermissionOverrideEffect =>
  typeof value === 'string' &&
  PERMISSION_OVERRIDE_EFFECT_VALUES.includes(
    value as PermissionOverrideEffect,
  );

export const isPermissionCode = (
  value: string | null | undefined,
): value is PermissionCode =>
  typeof value === 'string' &&
  PERMISSION_CODE_VALUES.includes(value as PermissionCode);
