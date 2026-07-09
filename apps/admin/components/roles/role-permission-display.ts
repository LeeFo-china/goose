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
  | "finance"
  | "marketing"
  | "organization"
  | "system"
  | "platform"
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
    key: "finance",
    label: "费用与财务",
    description: "费用申请、收付款、积分充值和支付配置",
    order: 40,
  },
  {
    key: "marketing",
    label: "营销内容",
    description: "活动页、线索、全景和短视频内容",
    order: 50,
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
    key: "platform",
    label: "平台运营",
    description: "平台支付、计费和城市合伙人配置",
    order: 80,
  },
  fallbackPermissionGroup,
];

const permissionGroupByKey = new Map<PermissionGroupKey, PermissionGroup>(
  permissionGroups.map((group) => [group.key, group]),
);

const permissionModuleGroupMap: Record<string, PermissionGroupKey> = {
  billing: "finance",
  customer: "customer",
  dashboard: "workspace",
  employee: "organization",
  expense_request: "finance",
  finance: "finance",
  marketing: "marketing",
  panorama: "marketing",
  platform_billing: "platform",
  platform_partner: "platform",
  platform_payment: "platform",
  platform_wechat_pay: "platform",
  project: "project_delivery",
  project_acceptance: "project_delivery",
  project_log: "project_delivery",
  project_procedure: "project_delivery",
  project_referral: "finance",
  social_video: "marketing",
  system: "system",
  task_center: "workspace",
  wechat_pay: "finance",
};

const permissionModuleLabels: Record<string, string> = {
  billing: "积分充值",
  customer: "客户管理",
  dashboard: "工作台",
  employee: "员工管理",
  expense_request: "费用申请",
  finance: "财务管理",
  marketing: "营销活动",
  panorama: "360 全景",
  platform_billing: "平台计费",
  platform_partner: "城市合伙人",
  platform_payment: "平台支付",
  platform_wechat_pay: "平台微信支付",
  project: "项目管理",
  project_acceptance: "项目验收",
  project_log: "施工日志",
  project_procedure: "工序派工",
  project_referral: "介绍费",
  social_video: "短视频",
  system: "系统管理",
  task_center: "待办中心",
  wechat_pay: "微信支付",
};

const permissionResourceLabels: Record<string, string> = {
  billing: "积分充值",
  budget: "项目预算",
  closing: "月度结账",
  config: "配置",
  customer: "客户",
  customer_phone: "客户手机号",
  dashboard: "工作台",
  employee: "员工",
  expense: "费用",
  expense_request: "费用申请",
  finance: "财务模块",
  ledger: "财务台账",
  marketing_event: "营销埋点",
  marketing_lead: "营销线索",
  marketing_page: "H5 活动页",
  ops_script: "运维脚本",
  panorama: "360 全景",
  payment: "项目收款",
  platform_billing: "平台计费",
  platform_partner: "城市合伙人",
  platform_payment: "平台支付",
  platform_wechat_pay: "平台微信支付",
  project: "项目",
  project_acceptance: "项目验收",
  project_log: "施工日志",
  project_procedure: "工序",
  project_referral: "介绍费",
  reconciliation: "对账异常",
  release: "版本发布",
  reports: "财务报表",
  settings: "系统配置",
  task_center: "待办中心",
  transcription: "短视频转写",
  wechat_pay: "微信支付",
};

const permissionActionLabels: Record<string, string> = {
  assign_owner: "分配负责人",
  approve_finance: "财务审批",
  approve_manager: "主管审批",
  call: "拨打",
  copy: "复制",
  confirm: "确认",
  create: "新建",
  delete: "删除",
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
