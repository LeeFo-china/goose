export type PlatformTenantStatus = "active" | "suspended" | "archived";

export type PlatformTenantUsage = {
  employee_count: number;
  customer_count: number;
  project_count: number;
  h5_page_count: number;
  camera_count: number;
};

export type PlatformTenantInitialization = {
  id?: string;
  template_id?: string | null;
  template_code: string;
  template_version: string;
  applied_by_employee_id?: string | null;
  applied_by?: PlatformTenantEmployeeLite | null;
  applied_at?: string | null;
  result?: Record<string, unknown>;
  departments_count: number;
  posts_count: number;
  roles_count: number;
  admin_employee_id: string | null;
  admin_role_id: string | null;
  admin_employee?: PlatformTenantEmployeeLite | null;
  admin_role?: PlatformTenantRoleLite | null;
};

export type PlatformTenantEmployeeLite = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  phone: string | null;
  status: string | null;
  tenant_department_id: string | null;
  post_id: string | null;
  role: string | null;
  created_at: string | null;
};

export type PlatformTenantRoleLite = {
  id: string;
  tenant_id: string | null;
  code: string | null;
  name: string | null;
  description: string | null;
  status: string | null;
  created_at: string | null;
};

export type PlatformTenantRecord = {
  id: string;
  name: string;
  slug: string;
  status: PlatformTenantStatus | string;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: string;
  updated_at: string;
  usage?: PlatformTenantUsage | null;
  initialization?: PlatformTenantInitialization | null;
  admin_employees?: PlatformTenantEmployeeLite[];
  roles?: PlatformTenantRoleLite[];
};

export type TenantServiceAreaStatus = "active" | "inactive";

export type TenantServiceAreaRecord = {
  id: string;
  tenant_id: string;
  province: string | null;
  city: string;
  district: string | null;
  adcode: string | null;
  center_latitude: number | null;
  center_longitude: number | null;
  service_radius_km: number | null;
  priority: number;
  status: TenantServiceAreaStatus | string;
  created_at: string;
  updated_at: string;
  tenant?: {
    id: string;
    name: string | null;
    slug: string | null;
    status: string | null;
  } | null;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PlatformTenantListData = {
  list: PlatformTenantRecord[];
  pagination: Pagination;
};

export type TenantServiceAreaListData = {
  list: TenantServiceAreaRecord[];
  pagination: Pagination;
};

export const platformTenantStatusOptions = [
  { value: "active", label: "正常" },
  { value: "suspended", label: "停用" },
  { value: "archived", label: "归档" },
] as const;

export const tenantServiceAreaStatusOptions = [
  { value: "active", label: "启用" },
  { value: "inactive", label: "停用" },
] as const;

export function getPlatformTenantStatusMeta(status: string | null | undefined) {
  if (status === "active") {
    return { label: "正常", variant: "success" as const };
  }
  if (status === "suspended") {
    return { label: "停用", variant: "secondary" as const };
  }
  if (status === "archived") {
    return { label: "归档", variant: "outline" as const };
  }
  return { label: status || "未知", variant: "outline" as const };
}
