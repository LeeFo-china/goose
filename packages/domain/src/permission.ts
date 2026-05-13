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
  'task_center.read',
  'customer.read',
  'customer.create',
  'customer.update',
  'customer.assign_owner',
  'customer.phone.view',
  'customer.phone.call',
  'customer.phone.copy',
  'project.read',
  'project.create',
  'project.update',
  'project.delete',
  'project_acceptance.read',
  'project_acceptance.create',
  'project_acceptance.update_own',
  'project_acceptance.submit',
  'project_acceptance.review',
  'project_acceptance.reject',
  'project_acceptance.manage',
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
  'marketing_page.read',
  'marketing_page.create',
  'marketing_page.update',
  'marketing_page.publish',
  'marketing_page.delete',
  'marketing_lead.read',
  'marketing_lead.update',
  'marketing_event.read',
  'social_video_transcription.create',
  'social_video_transcription.manage',
  'system.ops.read',
  'system.ops.run',
  'system.settings.read',
  'system.settings.update',
  'system.settings.test',
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
  'task_center.read': { label: '查看待办中心', module: 'task_center' },
  'customer.read': { label: '查看客户', module: 'customer' },
  'customer.create': { label: '新建客户', module: 'customer' },
  'customer.update': { label: '编辑客户', module: 'customer' },
  'customer.assign_owner': {
    label: '分配客户负责人',
    module: 'customer',
  },
  'customer.phone.view': {
    label: '查看客户完整手机号',
    module: 'customer',
  },
  'customer.phone.call': {
    label: '拨打客户手机号',
    module: 'customer',
  },
  'customer.phone.copy': {
    label: '复制客户手机号',
    module: 'customer',
  },
  'project.read': { label: '查看项目', module: 'project' },
  'project.create': { label: '新建项目', module: 'project' },
  'project.update': { label: '编辑项目', module: 'project' },
  'project.delete': { label: '删除项目', module: 'project' },
  'project_acceptance.read': {
    label: '查看项目验收',
    module: 'project_acceptance',
  },
  'project_acceptance.create': {
    label: '发起项目验收',
    module: 'project_acceptance',
  },
  'project_acceptance.update_own': {
    label: '编辑自己发起的项目验收',
    module: 'project_acceptance',
  },
  'project_acceptance.submit': {
    label: '提交项目验收',
    module: 'project_acceptance',
  },
  'project_acceptance.review': {
    label: '复核项目验收',
    module: 'project_acceptance',
  },
  'project_acceptance.reject': {
    label: '驳回项目验收',
    module: 'project_acceptance',
  },
  'project_acceptance.manage': {
    label: '管理项目验收',
    module: 'project_acceptance',
  },
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
  'marketing_page.read': {
    label: '查看 H5 活动页',
    module: 'marketing',
  },
  'marketing_page.create': {
    label: '新建 H5 活动页',
    module: 'marketing',
  },
  'marketing_page.update': {
    label: '编辑 H5 活动页',
    module: 'marketing',
  },
  'marketing_page.publish': {
    label: '发布 H5 活动页',
    module: 'marketing',
  },
  'marketing_page.delete': {
    label: '删除 H5 活动页',
    module: 'marketing',
  },
  'marketing_lead.read': {
    label: '查看营销线索',
    module: 'marketing',
  },
  'marketing_lead.update': {
    label: '跟进营销线索',
    module: 'marketing',
  },
  'marketing_event.read': {
    label: '查看营销埋点',
    module: 'marketing',
  },
  'social_video_transcription.create': {
    label: '发起短视频转文本',
    module: 'social_video',
  },
  'social_video_transcription.manage': {
    label: '管理短视频转写与脚本',
    module: 'social_video',
  },
  'system.ops.read': {
    label: '查看运维脚本',
    module: 'system',
  },
  'system.ops.run': {
    label: '执行运维脚本',
    module: 'system',
  },
  'system.settings.read': {
    label: '查看系统配置',
    module: 'system',
  },
  'system.settings.update': {
    label: '编辑系统配置',
    module: 'system',
  },
  'system.settings.test': {
    label: '测试系统配置',
    module: 'system',
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
