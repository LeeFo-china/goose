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
  'ocr.recognize',
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
  'billing.recharge.create',
  'billing.recharge.read',
  'billing.recharge.refund.request',
  'billing.service_order.create',
  'billing.service_order.read',
  'billing.service_order.refund.request',
  'billing.service_trial.apply',
  'billing.service_trial.read',
  'wechat_pay.config.read',
  'wechat_pay.config.manage',
  'wechat_pay.order.read',
  'wechat_pay.notify.read',
  'wechat_pay.applyment.read',
  'wechat_pay.applyment.submit',
  'platform.dashboard.read',
  'platform.operator.read',
  'platform.operator.manage',
  'platform.role.read',
  'platform.role.manage',
  'platform.audit.read',
  'platform.tenant.read',
  'platform.tenant.manage',
  'platform.tenant.status.manage',
  'platform.device.read',
  'platform.device.manage',
  'platform.lead.read',
  'platform.lead.assign',
  'platform.picture.read',
  'platform.picture.manage',
  'platform.marketing_page.read',
  'platform.marketing_page.manage',
  'platform.marketing_page.publish',
  'platform.usage.read',
  'platform.billing.read',
  'platform.billing.manage',
  'platform.ai_config.read',
  'platform.ai_config.manage',
  'platform.identity_diagnostic.read',
  'platform.system_setting.read',
  'platform.system_setting.manage',
  'platform.social_video.manage',
  'platform.location.manage',
  'platform.ops.execute',
  'platform.wechat_pay.applyment.read',
  'platform.wechat_pay.applyment.review',
  'platform.wechat_pay.applyment.manage',
  'platform.wechat_pay.applyment.submit',
  'platform.wechat_pay.applyment.sync',
  'platform.wechat_pay.applyment.repair',
  'platform.wechat_pay.config.activate',
  'platform.payment.config.read',
  'platform.payment.config.manage',
  'platform.billing.recharge_product.manage',
  'platform.billing.recharge_refund.read',
  'platform.billing.recharge_refund.review',
  'platform.service_product.manage',
  'platform.service_order.read',
  'platform.service_trial.read',
  'platform.service_trial.review',
  'platform.service_trial.manage',
  'platform.service_trial.override',
  'platform.service_work_order.manage',
  'platform.service_refund.review',
  'platform.ocr.recognize',
  'platform.ocr.recognition.read',
  'platform.ocr.tenant_policy.manage',
  'platform.tenant_onboarding.review',
  'platform.service_provider.publish',
  'platform.partner.read',
  'platform.partner.manage',
  'platform.partner.level.manage',
  'platform.partner.binding.manage',
  'platform.partner.revenue.read',
  'platform.partner.revenue.manage',
  'platform.partner.commission.read',
  'platform.partner.commission.manage',
  'platform.partner.settlement.manage',
  'platform.site_content.read',
  'platform.site_content.manage',
  'platform.site_content.publish',
  'platform.branding.manage',
  'platform.branding_product.manage',
  'platform.branding_order.read',
  'platform.tenant_entitlement.manage',
  'platform.virtual_product.read',
  'platform.virtual_product.manage',
  'platform.virtual_product.publish',
  'platform.virtual_order.read',
  'platform.virtual_refund.manage',
  'brand.settings.read',
  'brand.settings.update',
  'brand.entitlement.purchase',
  'brand.entitlement_order.read',
  'virtual_product.purchase',
  'platform.supplier.view',
  'platform.supplier.review',
  'platform.supplier.manage',
  'platform.supplier.blacklist',
  'platform.catalog.manage',
  'platform.supplier-product.manage',
  'platform.douyin_miniapp.manage',
  'douyin_miniapp.read',
  'douyin_miniapp.manage',
  'douyin_miniapp.audit.submit',
  'douyin_miniapp.publish',
  'douyin_lead.read',
  'douyin_lead.assign',
  'douyin_lead.follow_up',
  'douyin_lead.convert',
  'douyin_material_note.read',
  'douyin_material_note.manage',
  'douyin_material_note.publish',
  'service_provider.profile.read',
  'service_provider.profile.manage',
  'supplier.view',
  'supplier.manage',
  'supplier.master.manage',
  'supplier.catalog.manage',
  'supplier.contract.manage',
  'supplier.product.view',
  'supplier.product.manage',
  'supplier.cost-price.view',
  'supplier.cost-price.manage',
  'supplier.purchase-requisition.view',
  'supplier.purchase-requisition.manage',
  'supplier.purchase-requisition.approve',
  'supplier.purchase-order.view',
  'supplier.purchase-order.manage',
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

export interface PermissionCodeConfigItem {
  label: string;
  module: string;
  resource?: string;
  action?: string;
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
  PermissionCodeConfigItem
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
  'ocr.recognize': {
    label: '使用证照识别',
    module: 'ocr',
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
  'billing.recharge.create': { label: '发起积分充值', module: 'billing' },
  'billing.recharge.read': { label: '查看积分充值订单', module: 'billing' },
  'billing.recharge.refund.request': {
    label: '申请积分充值退款',
    module: 'billing',
  },
  'billing.service_order.create': {
    label: '发起技术服务订单',
    module: 'billing',
  },
  'billing.service_order.read': {
    label: '查看技术服务订单',
    module: 'billing',
  },
  'billing.service_order.refund.request': {
    label: '申请技术服务退款',
    module: 'billing',
  },
  'billing.service_trial.apply': {
    label: '申请技术服务试用',
    module: 'billing',
    resource: 'service_trial',
    action: 'apply',
  },
  'billing.service_trial.read': {
    label: '查看技术服务试用',
    module: 'billing',
    resource: 'service_trial',
    action: 'read',
  },
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
  'wechat_pay.applyment.read': {
    label: '查看微信支付开通申请',
    module: 'wechat_pay',
  },
  'wechat_pay.applyment.submit': {
    label: '提交微信支付开通申请',
    module: 'wechat_pay',
  },
  'platform.dashboard.read': {
    label: '查看平台概览',
    module: 'platform_dashboard',
    resource: 'dashboard',
    action: 'read',
  },
  'platform.operator.read': {
    label: '查看平台运营人员',
    module: 'platform_access',
    resource: 'operator',
    action: 'read',
  },
  'platform.operator.manage': {
    label: '管理平台运营人员',
    module: 'platform_access',
    resource: 'operator',
    action: 'manage',
  },
  'platform.role.read': {
    label: '查看平台角色',
    module: 'platform_access',
    resource: 'role',
    action: 'read',
  },
  'platform.role.manage': {
    label: '管理平台角色',
    module: 'platform_access',
    resource: 'role',
    action: 'manage',
  },
  'platform.audit.read': {
    label: '查看平台审计日志',
    module: 'platform_access',
    resource: 'audit_log',
    action: 'read',
  },
  'platform.tenant.read': {
    label: '查看平台租户',
    module: 'platform_tenant',
    resource: 'tenant',
    action: 'read',
  },
  'platform.tenant.manage': {
    label: '管理平台租户',
    module: 'platform_tenant',
    resource: 'tenant',
    action: 'manage',
  },
  'platform.tenant.status.manage': {
    label: '管理平台租户状态',
    module: 'platform_tenant',
    resource: 'tenant_status',
    action: 'manage',
  },
  'platform.device.read': {
    label: '查看平台设备资产',
    module: 'platform_device',
    resource: 'device_asset',
    action: 'read',
  },
  'platform.device.manage': {
    label: '管理平台设备资产',
    module: 'platform_device',
    resource: 'device_asset',
    action: 'manage',
  },
  'platform.lead.read': {
    label: '查看平台线索',
    module: 'platform_lead',
    resource: 'lead',
    action: 'read',
  },
  'platform.lead.assign': {
    label: '分配平台线索',
    module: 'platform_lead',
    resource: 'lead',
    action: 'assign',
  },
  'platform.picture.read': {
    label: '查看平台图片资料',
    module: 'platform_picture',
    resource: 'picture',
    action: 'read',
  },
  'platform.picture.manage': {
    label: '管理平台图片资料',
    module: 'platform_picture',
    resource: 'picture',
    action: 'manage',
  },
  'platform.marketing_page.read': {
    label: '查看平台 H5 活动',
    module: 'platform_marketing',
    resource: 'marketing_page',
    action: 'read',
  },
  'platform.marketing_page.manage': {
    label: '管理平台 H5 活动',
    module: 'platform_marketing',
    resource: 'marketing_page',
    action: 'manage',
  },
  'platform.marketing_page.publish': {
    label: '发布平台 H5 活动',
    module: 'platform_marketing',
    resource: 'marketing_page',
    action: 'publish',
  },
  'platform.usage.read': {
    label: '查看平台用量',
    module: 'platform_usage',
    resource: 'usage',
    action: 'read',
  },
  'platform.billing.read': {
    label: '查看平台计费',
    module: 'platform_billing',
    resource: 'billing',
    action: 'read',
  },
  'platform.billing.manage': {
    label: '管理平台计费',
    module: 'platform_billing',
    resource: 'billing',
    action: 'manage',
  },
  'platform.ai_config.read': {
    label: '查看平台 AI 路由',
    module: 'platform_ai_config',
    resource: 'ai_config',
    action: 'read',
  },
  'platform.ai_config.manage': {
    label: '管理平台 AI 路由',
    module: 'platform_ai_config',
    resource: 'ai_config',
    action: 'manage',
  },
  'platform.identity_diagnostic.read': {
    label: '查看平台身份诊断',
    module: 'platform_identity',
    resource: 'identity_diagnostic',
    action: 'read',
  },
  'platform.system_setting.read': {
    label: '查看平台系统配置',
    module: 'platform_system_setting',
    resource: 'system_setting',
    action: 'read',
  },
  'platform.system_setting.manage': {
    label: '管理平台系统配置',
    module: 'platform_system_setting',
    resource: 'system_setting',
    action: 'manage',
  },
  'platform.social_video.manage': {
    label: '管理平台自媒体脚本',
    module: 'platform_social_video',
    resource: 'social_video',
    action: 'manage',
  },
  'platform.location.manage': {
    label: '管理平台运营区域',
    module: 'platform_location',
    resource: 'location',
    action: 'manage',
  },
  'platform.ops.execute': {
    label: '执行平台运维脚本',
    module: 'platform_ops',
    resource: 'ops',
    action: 'execute',
  },
  'platform.wechat_pay.applyment.read': {
    label: '平台查看微信支付进件申请',
    module: 'platform_wechat_pay',
  },
  'platform.wechat_pay.applyment.review': {
    label: '平台审核微信支付进件申请',
    module: 'platform_wechat_pay',
  },
  'platform.wechat_pay.applyment.manage': {
    label: '平台管理微信支付进件进度',
    module: 'platform_wechat_pay',
  },
  'platform.wechat_pay.applyment.submit': {
    label: '平台提交微信支付正式进件',
    module: 'platform_wechat_pay',
  },
  'platform.wechat_pay.applyment.sync': {
    label: '平台同步微信支付进件状态',
    module: 'platform_wechat_pay',
  },
  'platform.wechat_pay.applyment.repair': {
    label: '平台修复微信支付进件状态',
    module: 'platform_wechat_pay',
  },
  'platform.wechat_pay.config.activate': {
    label: '激活租户微信支付配置',
    module: 'platform_wechat_pay',
  },
  'platform.payment.config.read': {
    label: '查看平台支付配置',
    module: 'platform_payment',
  },
  'platform.payment.config.manage': {
    label: '管理平台支付配置',
    module: 'platform_payment',
  },
  'platform.billing.recharge_product.manage': {
    label: '管理积分充值套餐',
    module: 'platform_billing',
  },
  'platform.billing.recharge_refund.read': {
    label: '查看积分充值退款申请',
    module: 'platform_billing',
  },
  'platform.billing.recharge_refund.review': {
    label: '审核积分充值退款申请',
    module: 'platform_billing',
  },
  'platform.service_product.manage': {
    label: '管理技术服务商品',
    module: 'platform_service',
  },
  'platform.service_order.read': {
    label: '查看技术服务订单',
    module: 'platform_service',
  },
  'platform.service_trial.read': {
    label: '查看平台技术服务试用',
    module: 'platform_service',
    resource: 'service_trial',
    action: 'read',
  },
  'platform.service_trial.review': {
    label: '审核平台技术服务试用',
    module: 'platform_service',
    resource: 'service_trial',
    action: 'review',
  },
  'platform.service_trial.manage': {
    label: '管理平台技术服务试用',
    module: 'platform_service',
    resource: 'service_trial',
    action: 'manage',
  },
  'platform.service_trial.override': {
    label: '例外处理平台技术服务试用',
    module: 'platform_service',
    resource: 'service_trial',
    action: 'override',
  },
  'platform.service_work_order.manage': {
    label: '管理技术服务工单',
    module: 'platform_service',
  },
  'platform.service_refund.review': {
    label: '审核技术服务退款',
    module: 'platform_service',
  },
  'platform.ocr.recognize': {
    label: '使用平台证照识别',
    module: 'platform_ocr',
  },
  'platform.ocr.recognition.read': {
    label: '查看平台OCR记录',
    module: 'platform_ocr',
  },
  'platform.ocr.tenant_policy.manage': {
    label: '管理OCR租户灰度',
    module: 'platform_ocr',
  },
  'platform.tenant_onboarding.review': {
    label: '审核装企入驻',
    module: 'platform_tenant_onboarding',
  },
  'platform.service_provider.publish': {
    label: '审核服务商发布',
    module: 'platform_tenant_onboarding',
  },
  'platform.partner.read': {
    label: '查看城市合伙人',
    module: 'platform_partner',
  },
  'platform.partner.manage': {
    label: '管理城市合伙人',
    module: 'platform_partner',
  },
  'platform.partner.level.manage': {
    label: '管理合伙人等级',
    module: 'platform_partner',
  },
  'platform.partner.binding.manage': {
    label: '管理合伙人装企绑定',
    module: 'platform_partner',
  },
  'platform.partner.revenue.read': {
    label: '查看合伙人平台收入',
    module: 'platform_partner',
  },
  'platform.partner.revenue.manage': {
    label: '管理合伙人平台收入',
    module: 'platform_partner',
  },
  'platform.partner.commission.read': {
    label: '查看合伙人佣金',
    module: 'platform_partner',
  },
  'platform.partner.commission.manage': {
    label: '管理合伙人佣金',
    module: 'platform_partner',
  },
  'platform.partner.settlement.manage': {
    label: '管理合伙人结算',
    module: 'platform_partner',
  },
  'platform.site_content.read': {
    label: '查看官网内容',
    module: 'platform_site_content',
  },
  'platform.site_content.manage': {
    label: '管理官网内容',
    module: 'platform_site_content',
  },
  'platform.site_content.publish': {
    label: '发布官网内容',
    module: 'platform_site_content',
  },
  'platform.branding.manage': {
    label: '管理平台技术支持品牌',
    module: 'platform_branding',
  },
  'platform.branding_product.manage': {
    label: '管理品牌技术支持权益商品',
    module: 'platform_branding',
  },
  'platform.branding_order.read': {
    label: '查看品牌技术支持权益订单',
    module: 'platform_branding',
  },
  'platform.tenant_entitlement.manage': {
    label: '管理租户增值权益',
    module: 'platform_entitlement',
  },
  'platform.virtual_product.read': {
    label: '查看虚拟商品',
    module: 'platform_virtual_product',
  },
  'platform.virtual_product.manage': {
    label: '管理虚拟商品',
    module: 'platform_virtual_product',
  },
  'platform.virtual_product.publish': {
    label: '发布虚拟商品',
    module: 'platform_virtual_product',
  },
  'platform.virtual_order.read': {
    label: '查看虚拟商品订单',
    module: 'platform_virtual_order',
  },
  'platform.virtual_refund.manage': {
    label: '管理虚拟商品退款',
    module: 'platform_virtual_refund',
  },
  'brand.settings.read': {
    label: '查看品牌技术支持设置',
    module: 'branding',
  },
  'brand.settings.update': {
    label: '编辑品牌技术支持设置',
    module: 'branding',
  },
  'brand.entitlement.purchase': {
    label: '购买品牌技术支持权益',
    module: 'branding',
  },
  'brand.entitlement_order.read': {
    label: '查看品牌技术支持权益订单',
    module: 'branding',
  },
  'virtual_product.purchase': {
    label: '购买虚拟商品',
    module: 'virtual_product',
  },
  'platform.supplier.view': {
    label: '查看平台供应商',
    module: 'platform_supplier',
  },
  'platform.supplier.review': {
    label: '审核供应商准入',
    module: 'platform_supplier',
  },
  'platform.supplier.manage': {
    label: '管理平台供应商',
    module: 'platform_supplier',
  },
  'platform.supplier.blacklist': {
    label: '管理供应商黑名单',
    module: 'platform_supplier',
  },
  'platform.catalog.manage': {
    label: '管理供应标准目录',
    module: 'platform_supplier_catalog',
  },
  'platform.supplier-product.manage': {
    label: '管理平台共享商品',
    module: 'platform_supplier',
  },
  'platform.douyin_miniapp.manage': {
    label: '管理抖音小程序',
    module: 'platform',
    resource: 'douyin_miniapp',
    action: 'manage',
  },
  'douyin_miniapp.read': {
    label: '查看抖音小程序',
    module: 'douyin_miniapp',
    resource: 'douyin_miniapp',
    action: 'read',
  },
  'douyin_miniapp.manage': {
    label: '管理抖音小程序',
    module: 'douyin_miniapp',
    resource: 'douyin_miniapp',
    action: 'manage',
  },
  'douyin_miniapp.audit.submit': {
    label: '提交抖音审核',
    module: 'douyin_miniapp',
    resource: 'douyin_miniapp',
    action: 'audit_submit',
  },
  'douyin_miniapp.publish': {
    label: '发布抖音小程序',
    module: 'douyin_miniapp',
    resource: 'douyin_miniapp',
    action: 'publish',
  },
  'douyin_lead.read': {
    label: '查看抖音线索',
    module: 'douyin_miniapp',
    resource: 'douyin_lead',
    action: 'read',
  },
  'douyin_lead.assign': {
    label: '分配抖音线索',
    module: 'douyin_miniapp',
    resource: 'douyin_lead',
    action: 'assign',
  },
  'douyin_lead.follow_up': {
    label: '跟进抖音线索',
    module: 'douyin_miniapp',
    resource: 'douyin_lead',
    action: 'follow_up',
  },
  'douyin_lead.convert': {
    label: '转化抖音线索',
    module: 'douyin_miniapp',
    resource: 'douyin_lead',
    action: 'convert',
  },
  'douyin_material_note.read': {
    label: '查看抖音资料',
    module: 'douyin_miniapp',
    resource: 'douyin_material_note',
    action: 'read',
  },
  'douyin_material_note.manage': {
    label: '管理抖音资料',
    module: 'douyin_miniapp',
    resource: 'douyin_material_note',
    action: 'manage',
  },
  'douyin_material_note.publish': {
    label: '发布抖音资料',
    module: 'douyin_miniapp',
    resource: 'douyin_material_note',
    action: 'publish',
  },
  'service_provider.profile.read': {
    label: '查看服务商资料',
    module: 'service_provider',
  },
  'service_provider.profile.manage': {
    label: '管理服务商资料',
    module: 'service_provider',
  },
  'supplier.view': {
    label: '查看合作供应商',
    module: 'supplier',
  },
  'supplier.manage': {
    label: '管理合作供应商',
    module: 'supplier',
  },
  'supplier.master.manage': {
    label: '管理本租户私有供应商主档',
    module: 'supplier',
  },
  'supplier.catalog.manage': {
    label: '管理本租户分类、品牌和规格模板',
    module: 'supplier',
  },
  'supplier.contract.manage': {
    label: '管理供应商合同',
    module: 'supplier',
  },
  'supplier.product.view': {
    label: '查看供应商商品',
    module: 'supplier',
  },
  'supplier.product.manage': {
    label: '管理供应商商品',
    module: 'supplier',
  },
  'supplier.cost-price.view': {
    label: '查看供应商供货价',
    module: 'supplier',
  },
  'supplier.cost-price.manage': {
    label: '管理供应商供货价',
    module: 'supplier',
  },
  'supplier.purchase-requisition.view': {
    label: '查看供应商采购申请',
    module: 'supplier',
  },
  'supplier.purchase-requisition.manage': {
    label: '管理供应商采购申请',
    module: 'supplier',
  },
  'supplier.purchase-requisition.approve': {
    label: '审批供应商采购申请',
    module: 'supplier',
  },
  'supplier.purchase-order.view': {
    label: '查看供应商采购单',
    module: 'supplier',
  },
  'supplier.purchase-order.manage': {
    label: '管理供应商采购单',
    module: 'supplier',
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
