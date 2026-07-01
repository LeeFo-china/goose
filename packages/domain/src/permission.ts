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
  'project_procedure.read',
  'project_procedure.assignee',
  'project_procedure.assign',
  'project_procedure.adjust',
  'project_procedure.complete',
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
  'finance.view',
  'finance.payment.create',
  'finance.payment.confirm',
  'finance.expense.review',
  'finance.expense.pay',
  'finance.ledger.view',
  'finance.budget.view',
  'finance.budget.manage',
  'finance.cost-category.view',
  'finance.cost-category.manage',
  'finance.cost-allocation.manage',
  'finance.receivable.view',
  'finance.receivable.manage',
  'finance.reconciliation.manage',
  'finance.dashboard.view',
  'finance.reports.read',
  'finance.reports.export',
  'finance.closing.read',
  'finance.closing.manage',
  'wechat_pay.config.read',
  'wechat_pay.config.manage',
  'wechat_pay.order.read',
  'wechat_pay.notify.read',
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
  'panorama.read',
  'panorama.create',
  'panorama.update',
  'panorama.delete',
  'panorama.retry',
  'social_video_transcription.create',
  'social_video_transcription.manage',
  'system.ops.read',
  'system.ops.run',
  'system.release.read',
  'system.release.run',
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
  'project_procedure.read': {
    label: '查看工序派工',
    module: 'project_procedure',
  },
  'project_procedure.assignee': {
    label: '可被安排工序',
    module: 'project_procedure',
  },
  'project_procedure.assign': {
    label: '开始工序派工',
    module: 'project_procedure',
  },
  'project_procedure.adjust': {
    label: '调整工序派工',
    module: 'project_procedure',
  },
  'project_procedure.complete': {
    label: '完成工序',
    module: 'project_procedure',
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
  'finance.view': { label: '查看财务模块', module: 'finance' },
  'finance.payment.create': { label: '登记项目收款', module: 'finance' },
  'finance.payment.confirm': { label: '确认项目收款', module: 'finance' },
  'finance.expense.review': { label: '财务审核费用', module: 'finance' },
  'finance.expense.pay': { label: '登记费用打款', module: 'finance' },
  'finance.ledger.view': { label: '查看财务台账', module: 'finance' },
  'finance.budget.view': { label: '查看项目预算', module: 'finance' },
  'finance.budget.manage': { label: '管理项目预算', module: 'finance' },
  'finance.cost-category.view': { label: '查看成本分类', module: 'finance' },
  'finance.cost-category.manage': { label: '管理成本分类', module: 'finance' },
  'finance.cost-allocation.manage': {
    label: '管理成本归集',
    module: 'finance',
  },
  'finance.receivable.view': { label: '查看应收计划', module: 'finance' },
  'finance.receivable.manage': { label: '管理应收计划', module: 'finance' },
  'finance.reconciliation.manage': { label: '处理对账异常', module: 'finance' },
  'finance.dashboard.view': { label: '查看财务看板', module: 'finance' },
  'finance.reports.read': { label: '查看财务报表', module: 'finance' },
  'finance.reports.export': { label: '导出财务报表', module: 'finance' },
  'finance.closing.read': { label: '查看月度结账', module: 'finance' },
  'finance.closing.manage': { label: '管理月度结账', module: 'finance' },
  'wechat_pay.config.read': {
    label: '查看微信支付配置',
    module: 'wechat_pay',
  },
  'wechat_pay.config.manage': {
    label: '管理微信支付配置',
    module: 'wechat_pay',
  },
  'wechat_pay.order.read': {
    label: '查看微信支付订单',
    module: 'wechat_pay',
  },
  'wechat_pay.notify.read': {
    label: '查看微信支付回调',
    module: 'wechat_pay',
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
  'panorama.read': {
    label: '查看 360 全景',
    module: 'panorama',
  },
  'panorama.create': {
    label: '创建 360 全景',
    module: 'panorama',
  },
  'panorama.update': {
    label: '编辑 360 全景',
    module: 'panorama',
  },
  'panorama.delete': {
    label: '删除 360 全景',
    module: 'panorama',
  },
  'panorama.retry': {
    label: '重试 360 全景处理',
    module: 'panorama',
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
  'system.release.read': {
    label: '查看版本发布',
    module: 'system',
  },
  'system.release.run': {
    label: '发起版本发布',
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
