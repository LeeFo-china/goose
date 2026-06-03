import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { permissionRepository } from "@/repositories/permissions";
import { projectAcceptanceRepository } from "@/repositories/project-acceptances";
import type {
  ProjectAcceptanceCustomerRow,
  ProjectAcceptanceEmployeeRow,
  ProjectAcceptanceRow,
} from "@/repositories/project-acceptances";
import {
  measureProjectAcceptanceTiming,
  type ProjectAcceptanceTimingSteps,
} from "./timing";

const EMPLOYEE_ACCEPTANCE_DETAIL_CACHE_TTL_MS = 10_000;
const MAX_EMPLOYEE_ACCEPTANCE_DETAIL_CACHE_SIZE = 2_000;

export function employeeAcceptanceDetailCacheKey(
  this: any,
  tenantId: string,
  acceptanceId: string,
) {
  return `${tenantId}:${acceptanceId}`;
}

export function getCachedEmployeeAcceptanceDetail(this: any, cacheKey: string) {
  const item = this.employeeAcceptanceDetailCache.get(cacheKey);
  if (!item) return null;

  if (item.expiresAt <= Date.now()) {
    this.employeeAcceptanceDetailCache.delete(cacheKey);
    return null;
  }

  return item.value;
}

export function setCachedEmployeeAcceptanceDetail(
  this: any,
  cacheKey: string,
  value: any,
) {
  const now = Date.now();
  if (this.employeeAcceptanceDetailCache.size >= MAX_EMPLOYEE_ACCEPTANCE_DETAIL_CACHE_SIZE) {
    for (const [key, item] of this.employeeAcceptanceDetailCache.entries()) {
      if (item.expiresAt <= now) {
        this.employeeAcceptanceDetailCache.delete(key);
      }
    }

    if (this.employeeAcceptanceDetailCache.size >= MAX_EMPLOYEE_ACCEPTANCE_DETAIL_CACHE_SIZE) {
      this.employeeAcceptanceDetailCache.clear();
    }
  }

  this.employeeAcceptanceDetailCache.set(cacheKey, {
    expiresAt: now + EMPLOYEE_ACCEPTANCE_DETAIL_CACHE_TTL_MS,
    value,
  });
}

export function clearEmployeeAcceptanceDetailCache(this: any) {
  this.employeeAcceptanceDetailCache.clear();
  this.employeeAcceptanceDetailInFlight.clear();
}

async function loadEmployeeAcceptanceDetail(
  service: any,
  id: string,
  tenantId: string,
  timing?: ProjectAcceptanceTimingSteps,
) {
  const graph = await measureProjectAcceptanceTiming(
    timing,
    "acceptance_detail_graph_query_ms",
    async () => await projectAcceptanceRepository.getAcceptanceDetailGraphDirect(
      id,
      tenantId,
    ) ?? projectAcceptanceRepository.getAcceptanceDetailGraph(id, tenantId),
  );
  if (!graph) throw Errors.badRequest("项目验收单不存在");

  const {
    action_employees: actionEmployees,
    action_customers: actionCustomers,
    ...cleanGraph
  } = graph as typeof graph & {
    action_employees?: unknown;
    action_customers?: unknown;
  };
  return service.buildDetailFromGraph(cleanGraph, {
    timing,
    employees: parseRelationList<ProjectAcceptanceEmployeeRow>(actionEmployees),
    customers: parseRelationList<ProjectAcceptanceCustomerRow>(actionCustomers),
  });
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

async function assertCanReadFast(
  authContext: AuthContext,
  row: ProjectAcceptanceRow,
) {
  const tenantId = row.tenant_id ?? authContext.tenantId;
  const scope = accessPolicyService.assertPermission(
    authContext,
    "project_acceptance.read",
  );
  if (!tenantId || !scope || !authContext.employeeId) {
    throw Errors.forbidden();
  }

  const directAccess = await permissionRepository.canAccessProjectByScope({
    projectId: row.project_id,
    tenantId,
    scope,
    employeeId: authContext.employeeId,
    tenantDepartmentId: authContext.tenantDepartmentId,
  });
  const hasAccess = directAccess ?? await accessPolicyService.canAccessProject(
    authContext,
    row.project_id,
    "project_acceptance.read",
  );
  if (!hasAccess) throw Errors.forbidden();
}

export async function getAcceptance(
  this: any,
  authContext: AuthContext,
  id: string,
  options?: { timing?: ProjectAcceptanceTimingSteps },
) {
  const timing = options?.timing;
  const tenantId = this.requireTenantId(authContext);
  const cacheKey = this.employeeAcceptanceDetailCacheKey(tenantId, id);
  const cached = this.getCachedEmployeeAcceptanceDetail(cacheKey);
  if (cached) {
    if (timing) timing.cache_hit = 1;
    await measureProjectAcceptanceTiming(
      timing,
      "permission_ms",
      () => assertCanReadFast(authContext, cached),
    );
    return cached;
  }

  if (timing) timing.cache_hit = 0;
  let request = this.employeeAcceptanceDetailInFlight.get(cacheKey);
  if (!request) {
    request = loadEmployeeAcceptanceDetail(this, id, tenantId, timing)
      .then((detail) => {
        this.setCachedEmployeeAcceptanceDetail(cacheKey, detail);
        return detail;
      })
      .finally(() => {
        if (this.employeeAcceptanceDetailInFlight.get(cacheKey) === request) {
          this.employeeAcceptanceDetailInFlight.delete(cacheKey);
        }
      });
    this.employeeAcceptanceDetailInFlight.set(cacheKey, request);
  }

  const detail = await measureProjectAcceptanceTiming(
    timing,
    "employee_detail_inflight_wait_ms",
    () => request,
  );
  await measureProjectAcceptanceTiming(
    timing,
    "permission_ms",
    () => assertCanReadFast(authContext, detail),
  );

  return detail;
}
