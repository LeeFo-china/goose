import { Errors } from "@/errors/error-factory";
import {
  TenantDouyinLeadAssigneeCandidatesQuerySchema,
  TenantDouyinLeadAssigneeFilterOptionsQuerySchema,
  type TenantDouyinLeadAssigneeCandidatesQueryInput,
  type TenantDouyinLeadAssigneeFilterOptionsQueryInput,
} from "@/schema/tenant-douyin-leads";
import type { AuthContext, EffectivePermission } from
  "@/services/authorization";
import { serializeAssigneeCandidate } from
  "@/services/tenant-douyin-leads-serializer";

type CandidateRow = { readonly id: string; readonly name: string | null };
type CandidatePage = { rows: readonly CandidateRow[]; total: number };
type RepositoryPort = {
  listAssigneeCandidates(input: {
    tenantId: string; scope: EffectivePermission["scope"];
    employeeId: string; tenantDepartmentId: string | null;
    page: number; pageSize: number; keyword?: string;
  }): Promise<CandidatePage>;
  listAssigneeFilterOptions(input: {
    tenantId: string; visibleEmployeeIds: readonly string[] | null;
    page: number; pageSize: number; keyword?: string;
  }): Promise<CandidatePage>;
};
type AccessPolicyPort = {
  assertTenantContext(authContext: AuthContext): string;
  assertPermission(authContext: AuthContext, permission: string):
    EffectivePermission["scope"] | null;
  getVisibleCustomerOwnerIds(authContext: AuthContext, permission: string):
    Promise<string[] | null>;
};
type Dependencies = { repository: RepositoryPort; accessPolicy: AccessPolicyPort };

export async function listTenantDouyinLeadAssigneeCandidates(input: {
  authContext: AuthContext;
  query: TenantDouyinLeadAssigneeCandidatesQueryInput;
  dependencies: Dependencies;
}) {
  const tenantId = input.dependencies.accessPolicy
    .assertTenantContext(input.authContext);
  const scope = input.dependencies.accessPolicy.assertPermission(
    input.authContext, "douyin_lead.assign",
  );
  if (!scope || !input.authContext.employeeId
    || (scope === "department" && !input.authContext.tenantDepartmentId)) {
    throw Errors.forbidden();
  }
  const query = parseQuery(TenantDouyinLeadAssigneeCandidatesQuerySchema,
    input.query);
  const result = await input.dependencies.repository.listAssigneeCandidates({
    tenantId, scope, employeeId: input.authContext.employeeId,
    tenantDepartmentId: input.authContext.tenantDepartmentId, ...query,
  });
  return candidatePage(result, query.page, query.pageSize);
}

export async function listTenantDouyinLeadAssigneeFilterOptions(input: {
  authContext: AuthContext;
  query: TenantDouyinLeadAssigneeFilterOptionsQueryInput;
  dependencies: Dependencies;
}) {
  const tenantId = input.dependencies.accessPolicy
    .assertTenantContext(input.authContext);
  input.dependencies.accessPolicy.assertPermission(
    input.authContext, "douyin_lead.read",
  );
  const query = parseQuery(TenantDouyinLeadAssigneeFilterOptionsQuerySchema,
    input.query);
  const visibleEmployeeIds = await input.dependencies.accessPolicy
    .getVisibleCustomerOwnerIds(input.authContext, "douyin_lead.read");
  if (visibleEmployeeIds !== null && visibleEmployeeIds.length === 0) {
    return candidatePage({ rows: [], total: 0 }, query.page, query.pageSize);
  }
  const result = await input.dependencies.repository.listAssigneeFilterOptions({
    tenantId, visibleEmployeeIds, ...query,
  });
  if (visibleEmployeeIds !== null) {
    const visible = new Set(visibleEmployeeIds);
    if (result.rows.some((row) => !visible.has(row.id))) throwInvalidResponse();
  }
  return candidatePage(result, query.page, query.pageSize);
}

function parseQuery<T>(schema: { safeParse(input: unknown):
  | { success: true; data: T }
  | { success: false; error: Parameters<typeof Errors.fromZod>[0] } },
input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

function candidatePage(result: CandidatePage, page: number, pageSize: number) {
  if (!Number.isInteger(result.total) || result.total < 0) {
    throwInvalidResponse();
  }
  return { list: result.rows.map(serializeAssigneeCandidate), pagination: {
    page, pageSize, total: result.total,
    totalPages: result.total === 0 ? 0 : Math.ceil(result.total / pageSize),
  } };
}

function throwInvalidResponse(): never {
  throw Errors.business(500, "抖音线索响应数据无效",
    "DOUYIN_LEAD_RESPONSE_INVALID");
}
