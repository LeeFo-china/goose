import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import type {
  CreateProjectInput,
  ProjectListQuery,
  UpdateProjectInput,
} from "@/schema/projects";
import { getAsiaShanghaiTodayRange } from "@/utils/date-ranges";
import type { DepartmentCode } from "@gooes/domain";

export type SupabaseRpcError = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

export function normalizeRpcError(error: unknown): SupabaseRpcError {
  if (!error || typeof error !== "object") return {};

  const source = error as Record<string, unknown>;
  return {
    message: typeof source.message === "string" ? source.message : null,
    details: typeof source.details === "string" ? source.details : null,
    hint: typeof source.hint === "string" ? source.hint : null,
    code: typeof source.code === "string" ? source.code : null,
  };
}

export function getRpcErrorText(error: SupabaseRpcError) {
  return [error.message, error.details, error.hint, error.code]
    .filter((item): item is string => Boolean(item))
    .join("\n");
}

export const PROJECT_LIST_SELECT = `
  id,
  name,
  status,
  budget,
  start_date,
  created_at,
  address,
  customer:customers!projects_customer_id_fkey(
    id,
    name
  ),
  property:properties!projects_property_id_fkey(
    community,
    building_info
  )
`;

export const PROJECT_DETAIL_SELECT = `
  *,
  customer:customers!projects_customer_id_fkey(
    id,
    name,
    phone,
    status,
    owner_id,
    owner:employees!customers_owner_id_fkey(
      id,
      name,
      avatar,
      phone
    )
  ),
  property:properties!projects_property_id_fkey(
    id,
    community,
    building_info,
    layout,
    area,
    latitude,
    longitude
  )
`;

export const EMPLOYEE_PROJECT_BOOTSTRAP_SELECT = `
  id,
  tenant_id,
  customer_id,
  property_id,
  name,
  status,
  budget,
  signed_amount,
  start_date,
  created_at,
  updated_at,
  address,
  style_tags,
  visibility_status,
  customer:customers!projects_customer_id_fkey(
    id,
    name,
    phone,
    status,
    owner_id,
    owner:employees!customers_owner_id_fkey(
      id,
      name,
      avatar,
      phone
    )
  ),
  property:properties!projects_property_id_fkey(
    id,
    community,
    building_info,
    layout,
    area,
    latitude,
    longitude
  )
`;

export const PUBLIC_PROJECT_LIST_SELECT = `
  id,
  name,
  status,
  budget,
  start_date,
  created_at,
  address,
  style_tags,
  visibility_status,
  customer:customers!projects_customer_id_fkey(
    id,
    name
  ),
  property:properties!projects_property_id_fkey(
    id,
    community,
    building_info,
    area,
    layout,
    latitude,
    longitude
  )
`;

export const PUBLIC_PROJECT_DETAIL_SELECT = `
  id,
  name,
  status,
  budget,
  start_date,
  address,
  style_tags,
  visibility_status,
  customer:customers!projects_customer_id_fkey(
    name
  ),
  property:properties!projects_property_id_fkey(
    id,
    community,
    building_info,
    layout,
    area,
    latitude,
    longitude
  )
`;

export type ProjectCoreListFilters = {
  tenantId: string;
  visibleProjectIds: string[] | null;
  status?: ProjectListQuery["status"];
  keyword?: string;
  projectIds?: string[] | null;
};

export type ProjectCreateCustomerFilters = {
  tenantId: string;
  keyword?: string;
};

export type ProjectCreateEmployeeFilters = {
  tenantId: string;
  keyword?: string;
  departmentCodes?: DepartmentCode[];
  postIds?: string[];
};

export type EmployeeProjectBootstrapBundle = {
  project: Record<string, unknown> | null;
  members: Array<Record<string, unknown>>;
  acceptance_rows: Array<Record<string, unknown>>;
  log_stage_rows: Array<Record<string, unknown>>;
  latest_log_rows: Array<Record<string, unknown>>;
  logs: {
    rows: Array<Record<string, unknown>>;
    has_more: boolean;
    comment_counts: Array<{
      log_id: string;
      comment_count: number | string;
    }>;
  };
};

export function escapeSupabaseOrValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, "\\$&")
    .replace(/,/g, "\\,");
}

export { SupabaseDB, Errors, ErrorCodes, getAsiaShanghaiTodayRange };
export type { CreateProjectInput, ProjectListQuery, UpdateProjectInput, DepartmentCode };
