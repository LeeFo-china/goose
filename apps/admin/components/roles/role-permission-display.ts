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

const permissionModuleLabels: Record<string, string> = {
  customer: "客户管理",
  dashboard: "工作台",
  employee: "员工管理",
  expense_request: "费用申请",
  finance: "财务管理",
  marketing: "营销活动",
  panorama: "360 全景",
  project: "项目管理",
  project_acceptance: "项目验收",
  project_log: "施工日志",
  project_referral: "介绍费",
  social_video: "短视频",
  system: "系统管理",
  task_center: "待办中心",
};

const permissionResourceLabels: Record<string, string> = {
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
  project: "项目",
  project_acceptance: "项目验收",
  project_log: "施工日志",
  project_referral: "介绍费",
  release: "版本发布",
  settings: "系统配置",
  task_center: "待办中心",
  transcription: "短视频转写",
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
    getModuleLabel(permission.module),
    getPermissionSummary(permission),
    permission.description,
    permission.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
