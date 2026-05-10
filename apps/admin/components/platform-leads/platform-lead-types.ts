export type PlatformLeadStatus = "new" | "assigned" | "invalid";

export type PlatformLeadTenantLite = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
};

export type PlatformLeadCustomerLite = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
  source: string | null;
};

export type PlatformLeadEmployeeLite = {
  id: string;
  name: string | null;
  phone: string | null;
};

export type PlatformLeadAssignLog = {
  id: string;
  platform_lead_id: string;
  target_tenant_id: string | null;
  assigned_customer_id: string | null;
  action: string;
  dedupe_result: string | null;
  operator_employee_id: string | null;
  note: string | null;
  created_at: string;
  target_tenant?: PlatformLeadTenantLite | null;
  assigned_customer?: PlatformLeadCustomerLite | null;
  operator?: PlatformLeadEmployeeLite | null;
};

export type PlatformLeadCustomerSource = {
  id: string;
  tenant_id: string;
  customer_id: string;
  source: string;
  source_label: string | null;
  platform_lead_id: string | null;
  assigned_by_employee_id: string | null;
  assigned_at: string | null;
  metadata: unknown;
  created_at: string;
};

export type PlatformLeadRecord = {
  id: string;
  auth_user_id: string | null;
  phone: string;
  name: string | null;
  city: string | null;
  community: string | null;
  area: number | null;
  budget: string | null;
  description: string | null;
  source: string;
  status: PlatformLeadStatus | string;
  assigned_tenant_id: string | null;
  assigned_customer_id: string | null;
  assigned_by_employee_id: string | null;
  assigned_at: string | null;
  assigned_note: string | null;
  created_at: string;
  updated_at: string;
  assigned_tenant?: PlatformLeadTenantLite | null;
  assigned_customer?: PlatformLeadCustomerLite | null;
  assigned_by?: PlatformLeadEmployeeLite | null;
};

export type PlatformLeadDetail = PlatformLeadRecord & {
  assign_logs?: PlatformLeadAssignLog[];
  customer_sources?: PlatformLeadCustomerSource[];
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PlatformLeadListData = {
  list: PlatformLeadRecord[];
  pagination: Pagination;
};

export const platformLeadStatusOptions = [
  { value: "new", label: "待分配" },
  { value: "assigned", label: "已分配" },
  { value: "invalid", label: "无效" },
] as const;

export function getPlatformLeadStatusMeta(status: string | null | undefined) {
  if (status === "new") {
    return { label: "待分配", variant: "warning" as const };
  }
  if (status === "assigned") {
    return { label: "已分配", variant: "success" as const };
  }
  if (status === "invalid") {
    return { label: "无效", variant: "secondary" as const };
  }
  return { label: status || "未知", variant: "outline" as const };
}

export function getPlatformLeadDedupeLabel(value: string | null | undefined) {
  if (value === "existing_customer") return "老客户新线索";
  if (value === "created_customer") return "新客户";
  if (value === "already_assigned") return "已分配";
  return value || "-";
}
