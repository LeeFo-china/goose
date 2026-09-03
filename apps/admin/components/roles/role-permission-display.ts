import { PermissionCodeConfig, isPermissionCode } from "@gooes/domain";
import type { PermissionRecord } from "@/components/roles/role-mutation-shared";

export type PermissionFilter = "all" | "selected" | "unselected";

export const permissionFilterOptions: Array<{
  value: PermissionFilter;
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "selected", label: "已选" },
  { value: "unselected", label: "未选" },
];

export type PermissionGroupKey =
  | "workspace"
  | "customer"
  | "project_delivery"
  | "supplier_purchase"
  | "finance"
  | "douyin_growth"
  | "marketing"
  | "brand_service"
  | "service_provider"
  | "organization"
  | "system"
  | "platform_access"
  | "platform_tenant"
  | "platform_partner"
  | "platform_supplier"
  | "platform_content"
  | "platform_finance"
  | "platform_service"
  | "platform_system"
  | "other";

export type PermissionGroup = {
  key: PermissionGroupKey;
  label: string;
  description: string;
  order: number;
};

const fallbackPermissionGroup: PermissionGroup = {
  key: "other",
  label: "其他",
  description: "暂未归入常用业务分类的权限",
  order: 900,
};

export const permissionGroups: PermissionGroup[] = [
  {
    key: "workspace",
    label: "工作台与待办",
    description: "首页数据、待办和个人工作入口",
    order: 10,
  },
  {
    key: "customer",
    label: "客户管理",
    description: "客户资料、负责人和联系方式",
    order: 20,
  },
  {
    key: "project_delivery",
    label: "项目履约",
    description: "项目、验收、施工日志和工序派工",
    order: 30,
  },
  {
    key: "supplier_purchase",
    label: "供应商与采购",
    description: "供应商、商品、采购申请和采购单",
    order: 35,
  },
  {
    key: "finance",
    label: "费用与财务",
    description: "费用申请、收付款、积分充值和支付配置",
    order: 40,
  },
  {
    key: "douyin_growth",
    label: "抖音小程序",
    description: "抖音工作台、线索、项目实景和获客内容",
    order: 45,
  },
  {
    key: "marketing",
    label: "营销内容",
    description: "活动页、线索、全景和短视频内容",
    order: 50,
  },
  {
    key: "brand_service",
    label: "品牌与增值服务",
    description: "品牌技术支持、权益购买和虚拟商品",
    order: 55,
  },
  {
    key: "service_provider",
    label: "服务商资料",
    description: "服务商公开资料维护",
    order: 58,
  },
  {
    key: "organization",
    label: "组织与权限",
    description: "员工、角色和权限维护",
    order: 60,
  },
  {
    key: "system",
    label: "系统与运维",
    description: "系统配置、版本发布和运维操作",
    order: 70,
  },
  {
    key: "platform_access",
    label: "平台账号与权限",
    description: "平台人员、角色、审计和平台概览",
    order: 110,
  },
  {
    key: "platform_tenant",
    label: "平台租户与服务商",
    description: "租户、入驻审核和服务商公开资料",
    order: 120,
  },
  {
    key: "platform_partner",
    label: "城市合伙人",
    description: "合伙人、绑定、收入、佣金和结算",
    order: 130,
  },
  {
    key: "platform_supplier",
    label: "平台供应链",
    description: "平台供应商、标准目录和共享商品",
    order: 140,
  },
  {
    key: "platform_content",
    label: "平台内容与抖音",
    description: "抖音小程序、平台线索、官网内容和自媒体",
    order: 150,
  },
  {
    key: "platform_finance",
    label: "平台支付与计费",
    description: "支付配置、微信支付、平台计费和权益订单",
    order: 160,
  },
  {
    key: "platform_service",
    label: "平台技术服务",
    description: "技术服务商品、订单、试用、工单和退款",
    order: 170,
  },
  {
    key: "platform_system",
    label: "平台系统与运维",
    description: "设备、区域、AI、OCR、系统配置和运维",
    order: 180,
  },
  fallbackPermissionGroup,
];

const permissionGroupByKey = new Map<PermissionGroupKey, PermissionGroup>(
  permissionGroups.map((group) => [group.key, group]),
);

const permissionModuleGroupMap: Record<string, PermissionGroupKey> = {
  branding: "brand_service",
  billing: "finance",
  customer: "customer",
  dashboard: "workspace",
  douyin_miniapp: "douyin_growth",
  employee: "organization",
  expense_request: "finance",
  finance: "finance",
  marketing: "marketing",
  ocr: "system",
  panorama: "marketing",
  platform: "platform_content",
  platform_access: "platform_access",
  platform_ai_config: "platform_system",
  platform_billing: "platform_finance",
  platform_branding: "platform_finance",
  platform_dashboard: "platform_access",
  platform_device: "platform_system",
  platform_entitlement: "platform_finance",
  platform_identity: "platform_system",
  platform_lead: "platform_content",
  platform_location: "platform_system",
  platform_marketing: "platform_content",
  platform_ocr: "platform_system",
  platform_ops: "platform_system",
  platform_partner: "platform_partner",
  platform_payment: "platform_finance",
  platform_picture: "platform_content",
  platform_service: "platform_service",
  platform_site_content: "platform_content",
  platform_social_video: "platform_content",
  platform_supplier: "platform_supplier",
  platform_supplier_catalog: "platform_supplier",
  platform_system_setting: "platform_system",
  platform_tenant: "platform_tenant",
  platform_tenant_onboarding: "platform_tenant",
  platform_usage: "platform_finance",
  platform_virtual_order: "platform_finance",
  platform_virtual_product: "platform_finance",
  platform_virtual_refund: "platform_finance",
  platform_wechat_pay: "platform_finance",
  project: "project_delivery",
  project_acceptance: "project_delivery",
  project_log: "project_delivery",
  project_procedure: "project_delivery",
  project_referral: "finance",
  service_provider: "service_provider",
  social_video: "marketing",
  supplier: "supplier_purchase",
  system: "system",
  task_center: "workspace",
  virtual_product: "brand_service",
  wechat_pay: "finance",
};

const permissionModuleLabels: Record<string, string> = {
  billing: "积分充值",
  branding: "品牌技术支持",
  customer: "客户管理",
  dashboard: "工作台",
  douyin_miniapp: "抖音小程序",
  employee: "员工管理",
  expense_request: "费用申请",
  finance: "财务管理",
  marketing: "营销活动",
  ocr: "证照识别",
  panorama: "360 全景",
  platform: "平台抖音小程序",
  platform_access: "平台账号权限",
  platform_ai_config: "平台 AI 路由",
  platform_billing: "平台计费",
  platform_branding: "平台品牌权益",
  platform_dashboard: "平台概览",
  platform_device: "平台设备资产",
  platform_entitlement: "租户增值权益",
  platform_identity: "平台身份诊断",
  platform_lead: "平台线索",
  platform_location: "平台运营区域",
  platform_marketing: "平台营销内容",
  platform_ocr: "平台 OCR",
  platform_ops: "平台运维",
  platform_partner: "城市合伙人",
  platform_payment: "平台支付",
  platform_picture: "平台图片资料",
  platform_service: "平台技术服务",
  platform_site_content: "官网内容",
  platform_social_video: "平台自媒体",
  platform_supplier: "平台供应商",
  platform_supplier_catalog: "供应标准目录",
  platform_system_setting: "平台系统配置",
  platform_tenant: "平台租户",
  platform_tenant_onboarding: "装企入驻",
  platform_usage: "平台用量",
  platform_virtual_order: "虚拟商品订单",
  platform_virtual_product: "虚拟商品",
  platform_virtual_refund: "虚拟商品退款",
  platform_wechat_pay: "平台微信支付",
  project: "项目管理",
  project_acceptance: "项目验收",
  project_log: "施工日志",
  project_procedure: "工序派工",
  project_referral: "介绍费",
  service_provider: "服务商资料",
  social_video: "短视频",
  supplier: "供应商与采购",
  system: "系统管理",
  task_center: "待办中心",
  virtual_product: "虚拟商品",
  wechat_pay: "微信支付",
};

const permissionResourceLabels: Record<string, string> = {
  ai_config: "AI 路由",
  audit_log: "审计日志",
  billing: "积分充值",
  budget: "项目预算",
  catalog: "供应标准目录",
  closing: "月度结账",
  config: "配置",
  contract: "供应商合同",
  customer: "客户",
  customer_phone: "客户手机号",
  dashboard: "工作台",
  device_asset: "设备资产",
  douyin_lead: "抖音线索",
  douyin_material_note: "抖音项目实景",
  douyin_miniapp: "抖音小程序",
  employee: "员工",
  entitlement: "增值权益",
  entitlement_order: "权益订单",
  expense: "费用",
  expense_request: "费用申请",
  finance: "财务模块",
  identity_diagnostic: "身份诊断",
  ledger: "财务台账",
  lead: "线索",
  location: "运营区域",
  marketing_event: "营销埋点",
  marketing_lead: "营销线索",
  marketing_page: "H5 活动页",
  ocr: "证照识别",
  ops_script: "运维脚本",
  operator: "运营人员",
  panorama: "360 全景",
  payment: "项目收款",
  platform_billing: "平台计费",
  platform_partner: "城市合伙人",
  platform_payment: "平台支付",
  platform_wechat_pay: "平台微信支付",
  picture: "图片资料",
  project: "项目",
  project_acceptance: "项目验收",
  project_log: "施工日志",
  project_procedure: "工序",
  project_referral: "介绍费",
  purchase_order: "采购单",
  purchase_requisition: "采购申请",
  reconciliation: "对账异常",
  release: "版本发布",
  reports: "财务报表",
  role: "角色",
  service_provider_profile: "服务商资料",
  service_trial: "技术服务试用",
  social_video: "自媒体脚本",
  settings: "系统配置",
  supplier: "供应商",
  supplier_catalog: "供应目录",
  supplier_cost_price: "供货价",
  supplier_product: "供应商商品",
  task_center: "待办中心",
  transcription: "短视频转写",
  usage: "平台用量",
  virtual_order: "虚拟商品订单",
  virtual_product: "虚拟商品",
  virtual_refund: "虚拟商品退款",
  wechat_pay: "微信支付",
};

const permissionActionLabels: Record<string, string> = {
  assign_owner: "分配负责人",
  approve_finance: "财务审批",
  approve_manager: "主管审批",
  audit_submit: "提交审核",
  call: "拨打",
  convert: "转化",
  copy: "复制",
  confirm: "确认",
  create: "新建",
  delete: "删除",
  execute: "执行",
  follow_up: "跟进",
  manage: "管理",
  pay: "登记打款",
  permission_manage: "权限管理",
  publish: "发布",
  read: "查看",
  reject: "驳回",
  retry: "重试",
  review: "复核",
  run: "执行",
  submit: "提交",
  test: "测试",
  update: "编辑",
  update_own: "编辑本人发起",
  view: "查看",
};

export function getPermissionName(permission: PermissionRecord) {
  if (isPermissionCode(permission.code)) {
    return PermissionCodeConfig[permission.code].label;
  }

  return permission.name || permission.description || "未命名权限";
}

export function getModuleLabel(module: string) {
  return permissionModuleLabels[module] || "其他模块";
}

export function getPermissionGroup(
  permission: Pick<PermissionRecord, "module" | "code">,
) {
  const module = permission.module
    || (isPermissionCode(permission.code)
      ? PermissionCodeConfig[permission.code].module
      : "");
  const groupKey = permissionModuleGroupMap[module]
    || (module.startsWith("platform_") || permission.code.startsWith("platform.")
      ? "platform"
      : "other");

  return permissionGroupByKey.get(groupKey) || fallbackPermissionGroup;
}

export function getPermissionResourceLabel(resourceKey: string) {
  return permissionResourceLabels[resourceKey] || "其他资源";
}

export function getPermissionActionLabel(actionKey: string) {
  return permissionActionLabels[actionKey] || "其他操作";
}

export function getPermissionSummary(permission: PermissionRecord) {
  const resource = getPermissionResourceLabel(permission.resource);
  const action = getPermissionActionLabel(permission.action);

  return resource === action ? resource : `${resource} · ${action}`;
}

export function getPermissionDescription(permission: PermissionRecord) {
  const description = permission.description?.trim();
  if (!description) return null;

  return description === getPermissionName(permission).trim()
    ? null
    : description;
}

export function getPermissionSearchText(permission: PermissionRecord) {
  return [
    getPermissionName(permission),
    getPermissionGroup(permission).label,
    getModuleLabel(permission.module),
    getPermissionSummary(permission),
    permission.description,
    permission.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
