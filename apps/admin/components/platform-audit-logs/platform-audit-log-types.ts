export type PlatformAuditLogAction =
  | "tenant_create"
  | "tenant_update"
  | "tenant_suspend"
  | "tenant_activate"
  | "tenant_admin_create"
  | "platform_lead_assign"
  | "platform_device_access_view"
  | "platform_device_sync"
  | "platform_device_password_query"
  | "platform_device_password_reset"
  | "platform_device_cloud_delete"
  | "platform_config_update";

export type PlatformAuditLogStatus = "success" | "failure";

export type PlatformAuditLogTenantLite = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
};

export type PlatformAuditLogEmployeeLite = {
  id: string;
  name: string | null;
  phone: string | null;
};

export type PlatformAuditLogRecord = {
  id: string;
  action: PlatformAuditLogAction | string;
  actor_employee_id: string | null;
  actor_user_id: string | null;
  target_tenant_id: string | null;
  resource_type: string;
  resource_id: string | null;
  resource_label: string | null;
  status: PlatformAuditLogStatus | string;
  summary: string | null;
  metadata: unknown;
  created_at: string;
  target_tenant?: PlatformAuditLogTenantLite | null;
  actor_employee?: PlatformAuditLogEmployeeLite | null;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PlatformAuditLogListData = {
  list: PlatformAuditLogRecord[];
  pagination: Pagination;
};

export const platformAuditLogActionOptions = [
  { value: "tenant_create", label: "创建租户" },
  { value: "tenant_update", label: "更新租户" },
  { value: "tenant_suspend", label: "停用租户" },
  { value: "tenant_activate", label: "启用租户" },
  { value: "tenant_admin_create", label: "创建管理员" },
  { value: "platform_lead_assign", label: "分配平台线索" },
  { value: "platform_device_access_view", label: "查看设备接入信息" },
  { value: "platform_device_sync", label: "同步设备资产" },
  { value: "platform_device_password_query", label: "查询设备密码" },
  { value: "platform_device_password_reset", label: "重置设备密码" },
  { value: "platform_device_cloud_delete", label: "删除云端设备" },
  { value: "platform_config_update", label: "更新平台配置" },
] as const;

export function getPlatformAuditLogActionLabel(action: string | null | undefined) {
  return platformAuditLogActionOptions.find((item) => item.value === action)?.label || action || "未知操作";
}

export function getPlatformAuditLogActionVariant(action: string | null | undefined) {
  if (action === "tenant_suspend") return "warning" as const;
  if (action === "tenant_activate" || action === "tenant_create") return "success" as const;
  if (action === "platform_lead_assign") return "secondary" as const;
  if (action === "platform_device_sync") return "secondary" as const;
  if (action === "platform_device_password_reset") return "warning" as const;
  if (action === "platform_device_cloud_delete") return "danger" as const;
  if (action === "platform_config_update") return "secondary" as const;
  return "outline" as const;
}

export function getPlatformAuditLogStatusMeta(status: string | null | undefined) {
  if (status === "success") {
    return { label: "成功", variant: "success" as const };
  }
  if (status === "failure") {
    return { label: "失败", variant: "danger" as const };
  }
  return { label: status || "未知", variant: "outline" as const };
}
