import { SupabaseDB, escapeSupabaseOrValue } from "./legacy/shared";
import { listTodayWorkProjectIds, count, listRows } from "./legacy/lists";
import {
  findById,
  findDetailById,
  findEmployeeBootstrapDetailById,
  getEmployeeBootstrapBundle,
} from "./legacy/detail";
import {
  applyPublicProjectVisibilityQuery,
  listPublicProjects,
  listPublicProjectsByIds,
  findPublicVisibilityById,
  findPublicDetailById,
  listPublicProjectLogs,
  listPublicProjectLogsPage,
} from "./legacy/public";
import {
  create,
  findActiveByCustomerProperty,
  findCustomerInTenant,
  findPropertyInTenant,
  listCreateCustomers,
  listCreateEmployees,
  listCreateProperties,
} from "./legacy/create-options";
import { update, updateIfStatus } from "./legacy/mutations";
import type { ProjectCoreListFilters } from "./legacy/shared";

export {
  EMPLOYEE_PROJECT_BOOTSTRAP_SELECT,
  PROJECT_DETAIL_SELECT,
  PROJECT_LIST_SELECT,
  PUBLIC_PROJECT_DETAIL_SELECT,
  PUBLIC_PROJECT_LIST_SELECT,
} from "./legacy/shared";
export type {
  EmployeeProjectBootstrapBundle,
  ProjectCoreListFilters,
  ProjectCreateCustomerFilters,
  ProjectCreateEmployeeFilters,
  ProjectCreatePropertyFilters,
  PublicProjectListQuery,
  PublicProjectListResult,
} from "./legacy/shared";

class ProjectRepository {
  private rpc(name: string, params: Record<string, unknown>) {
    return (SupabaseDB.getAdminClient() as unknown as {
      rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<{
        data: unknown;
        error: { message?: string; code?: string; details?: string } | null;
      }>;
    }).rpc(name, params);
  }

  private applyProjectIdsFilter(query: any, visibleProjectIds: string[] | null) {
    if (visibleProjectIds === null) {
      return query;
    }

    if (visibleProjectIds.length === 0) {
      return query.eq("id", "00000000-0000-0000-0000-000000000000");
    }

    return query.in("id", visibleProjectIds);
  }

  private applyProjectListFilters(query: any, filters: ProjectCoreListFilters) {
    let filteredQuery = this.applyProjectIdsFilter(
      query,
      filters.visibleProjectIds,
    ).eq("tenant_id", filters.tenantId);

    if (filters.status) {
      filteredQuery = filteredQuery.eq("status", filters.status);
    }

    if (filters.keyword) {
      const escapedKeyword = escapeSupabaseOrValue(filters.keyword);
      filteredQuery = filteredQuery.or(
        `name.ilike.%${escapedKeyword}%,address.ilike.%${escapedKeyword}%`,
      );
    }

    if (filters.projectIds !== undefined && filters.projectIds !== null) {
      if (filters.projectIds.length === 0) {
        filteredQuery = filteredQuery.eq("id", "00000000-0000-0000-0000-000000000000");
      } else {
        filteredQuery = filteredQuery.in("id", filters.projectIds);
      }
    }

    return filteredQuery;
  }

  listTodayWorkProjectIds = listTodayWorkProjectIds;
  count = count;
  listRows = listRows;
  findById = findById;
  findDetailById = findDetailById;
  findEmployeeBootstrapDetailById = findEmployeeBootstrapDetailById;
  getEmployeeBootstrapBundle = getEmployeeBootstrapBundle;
  private applyPublicProjectVisibilityQuery = applyPublicProjectVisibilityQuery;
  listPublicProjects = listPublicProjects;
  listPublicProjectsByIds = listPublicProjectsByIds;
  findPublicVisibilityById = findPublicVisibilityById;
  findPublicDetailById = findPublicDetailById;
  listPublicProjectLogs = listPublicProjectLogs;
  listPublicProjectLogsPage = listPublicProjectLogsPage;
  create = create;
  findActiveByCustomerProperty = findActiveByCustomerProperty;
  findCustomerInTenant = findCustomerInTenant;
  findPropertyInTenant = findPropertyInTenant;
  listCreateCustomers = listCreateCustomers;
  listCreateProperties = listCreateProperties;
  listCreateEmployees = listCreateEmployees;
  update = update;
  updateIfStatus = updateIfStatus;
}

export const projectRepository = new ProjectRepository();
