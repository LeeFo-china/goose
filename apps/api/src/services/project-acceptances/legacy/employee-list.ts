import type { ProjectAcceptanceListQuery } from "@/schema/project-acceptances";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { permissionRepository } from "@/repositories/permissions";
import {
  projectAcceptanceRepository,
  type ProjectAcceptanceCustomerRow,
  type ProjectAcceptanceDetailGraphRow,
  type ProjectAcceptanceEmployeeRow,
  type ProjectAcceptanceRow,
} from "@/repositories/project-acceptances";
import {
  measureProjectAcceptanceTiming,
  type ProjectAcceptanceTimingSteps,
} from "./timing";

type EmployeeAcceptanceListResult = {
  list: any[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

function buildPagination(query: ProjectAcceptanceListQuery, total: number) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: total ? Math.ceil(total / query.pageSize) : 0,
  };
}

async function buildGraphDetails(
  service: any,
  graphs: ProjectAcceptanceDetailGraphRow[],
  timing?: ProjectAcceptanceTimingSteps,
) {
  const details = await measureProjectAcceptanceTiming(
    timing,
    "detail_graph_build_ms",
    () => Promise.all(
      graphs.map((graph) => {
        const {
          action_employees: actionEmployees,
          action_customers: actionCustomers,
          ...cleanGraph
        } = graph as ProjectAcceptanceDetailGraphRow & {
          action_employees?: unknown;
          action_customers?: unknown;
        };
        return service.buildDetailFromGraph(cleanGraph, {
          timing,
          employees: parseRelationList<ProjectAcceptanceEmployeeRow>(
            actionEmployees,
          ),
          customers: parseRelationList<ProjectAcceptanceCustomerRow>(
            actionCustomers,
          ),
        });
      }),
    ),
  );
  for (const detail of details) {
    const cacheKey = service.employeeAcceptanceDetailCacheKey(
      detail.tenant_id,
      detail.id,
    );
    service.setCachedEmployeeAcceptanceDetail(cacheKey, detail);
  }
  return details;
}

function parseRelationList<T>(value: unknown): T[] {
  const parsed = typeof value === "string" ? safeJsonParse(value) : value;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => typeof item === "string" ? safeJsonParse(item) : item)
    .filter((item): item is T => typeof item === "object" && item !== null);
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function buildRowDetails(service: any, rows: ProjectAcceptanceRow[]) {
  const details = await service.buildDetails(rows);
  for (const detail of details) {
    const cacheKey = service.employeeAcceptanceDetailCacheKey(
      detail.tenant_id,
      detail.id,
    );
    service.setCachedEmployeeAcceptanceDetail(cacheKey, detail);
  }
  return details;
}

export async function listAcceptances(
  this: any,
  authContext: AuthContext,
  query: ProjectAcceptanceListQuery,
  options?: { timing?: ProjectAcceptanceTimingSteps },
): Promise<EmployeeAcceptanceListResult> {
  const timing = options?.timing;
  const tenantId = this.requireTenantId(authContext);
  const projectId = query.project_id;
  if (projectId) {
    const scope = accessPolicyService.assertPermission(
      authContext,
      "project_acceptance.read",
    );
    const hasProjectAccess = await measureProjectAcceptanceTiming(
      timing,
      "project_access_ms",
      async () => {
        if (!scope || !authContext.employeeId) return false;
        const directAccess = await permissionRepository.canAccessProjectByScope({
          projectId,
          tenantId,
          scope,
          employeeId: authContext.employeeId,
          tenantDepartmentId: authContext.tenantDepartmentId,
        });
        return directAccess ?? accessPolicyService.canAccessProject(
          authContext,
          projectId,
          "project_acceptance.read",
        );
      },
    );
    if (!hasProjectAccess) {
      return { list: [], pagination: buildPagination(query, 0) };
    }

    const graphResult = await measureProjectAcceptanceTiming(
      timing,
      "acceptance_list_graph_query_ms",
      () => projectAcceptanceRepository.listProjectAcceptanceDetailGraphs({
        ...query,
        project_id: projectId,
        tenantId,
      }),
    );
    if (graphResult) {
      return {
        list: await buildGraphDetails(this, graphResult.list, timing),
        pagination: buildPagination(query, graphResult.total),
      };
    }
  }

  const visibleProjectIds = await measureProjectAcceptanceTiming(
    timing,
    "visible_projects_ms",
    () => accessPolicyService.getVisibleProjectIds(
      authContext,
      "project_acceptance.read",
    ),
  );
  if (visibleProjectIds?.length === 0) {
    return { list: [], pagination: buildPagination(query, 0) };
  }

  const { list, total } = await measureProjectAcceptanceTiming(
    timing,
    "acceptance_list_query_ms",
    () => projectAcceptanceRepository.listAcceptances({
      ...query,
      visibleProjectIds,
      tenantId,
    }),
  );
  return {
    list: await measureProjectAcceptanceTiming(
      timing,
      "detail_bulk_build_ms",
      () => buildRowDetails(this, list),
    ),
    pagination: buildPagination(query, total),
  };
}
