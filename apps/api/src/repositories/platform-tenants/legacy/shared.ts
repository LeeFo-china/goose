import { Errors } from "@/errors/error-factory";
import type {
  CreatePlatformTenantInput,
  PlatformTenantListQuery,
  PlatformTenantAddressSource,
  PlatformTenantStatus,
  UpdatePlatformTenantInput,
} from "@/schema/platform-tenants";
import { SupabaseDB } from "@/utils/supabase";
import {
  DepartmentConfig,
  DEPARTMENT_CODE_VALUES,
  EmployeePostConfig,
  EMPLOYEE_POST_CODE_VALUES,
} from "@gooes/domain";

export type PlatformTenantRecord = {
  id: string;
  name: string;
  slug: string;
  status: PlatformTenantStatus;
  address: string | null;
  address_title: string | null;
  address_poi_id: string | null;
  address_province: string | null;
  address_city: string | null;
  address_district: string | null;
  address_adcode: string | null;
  address_latitude: number | null;
  address_longitude: number | null;
  address_source: PlatformTenantAddressSource | null;
  address_confidence: number | null;
  address_confirmed_at: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  unified_social_credit_code: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformTenantUsageStats = {
  employee_count: number;
  customer_count: number;
  project_count: number;
  h5_page_count: number;
  camera_count: number;
};

export type PlatformTenantInitializationResult = {
  template_code: string;
  template_version: string;
  departments_count: number;
  posts_count: number;
  roles_count: number;
  admin_employee_id: string | null;
  admin_role_id: string | null;
};

export type PlatformTenantTemplateApplication = {
  id: string;
  tenant_id: string;
  template_id: string | null;
  template_code: string;
  template_version: string;
  applied_by_employee_id: string | null;
  applied_at: string;
  result: Record<string, unknown>;
  created_at: string;
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

export type PlatformTenantEmployeeRow = Omit<PlatformTenantEmployeeLite, "role">;

export type PlatformTenantRoleLite = {
  id: string;
  tenant_id: string | null;
  code: string | null;
  name: string | null;
  description: string | null;
  status: string | null;
  created_at: string | null;
};

export type PlatformTenantDepartmentLite = {
  id: string;
  code: string;
  name: string;
};

export const EMPTY_USAGE: PlatformTenantUsageStats = {
  employee_count: 0,
  customer_count: 0,
  project_count: 0,
  h5_page_count: 0,
  camera_count: 0,
};

export type UsageTableKey = keyof PlatformTenantUsageStats;

export const USAGE_TABLES: Array<{ table: string; key: UsageTableKey }> = [
  { table: "employees", key: "employee_count" },
  { table: "customers", key: "customer_count" },
  { table: "projects", key: "project_count" },
  { table: "marketing_pages", key: "h5_page_count" },
  { table: "project_cameras", key: "camera_count" },
];

export {
  Errors,
  SupabaseDB,
  DepartmentConfig,
  DEPARTMENT_CODE_VALUES,
  EmployeePostConfig,
  EMPLOYEE_POST_CODE_VALUES,
};
export type {
  CreatePlatformTenantInput,
  PlatformTenantListQuery,
  PlatformTenantAddressSource,
  PlatformTenantStatus,
  UpdatePlatformTenantInput,
};
