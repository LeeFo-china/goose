import { permissionRepository } from "@/repositories/permissions";
import type { AuthContext, EffectivePermission } from "@/services/authorization";

const DIRECT_PROJECT_ACCESS_TIMEOUT_MS = 1500;

type ProjectTenant = { tenant_id?: string | null };

async function canAccessProjectByDirectScope(input: {
  projectId: string;
  tenantId: string;
  scope: EffectivePermission["scope"];
  employeeId: string;
  tenantDepartmentId?: string | null;
}) {
  const directCheck = permissionRepository.canAccessProjectByScope(input)
    .catch(() => null as boolean | null);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      directCheck,
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), DIRECT_PROJECT_ACCESS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function resolveProjectAccess(input: {
  authContext: AuthContext;
  projectId: string;
  scope: EffectivePermission["scope"];
  getVisibleProjectIds: () => Promise<string[] | null>;
  matchesTenant: (project: ProjectTenant) => boolean;
}) {
  if (input.scope === "all") {
    const project = await permissionRepository.findProjectTenantById(input.projectId);
    return Boolean(project && input.matchesTenant(project));
  }

  if (input.authContext.tenantId && input.authContext.employeeId) {
    const directAccess = await canAccessProjectByDirectScope({
      projectId: input.projectId,
      tenantId: input.authContext.tenantId,
      scope: input.scope,
      employeeId: input.authContext.employeeId,
      tenantDepartmentId: input.authContext.tenantDepartmentId,
    });
    if (directAccess !== null) return directAccess;
  }

  const visibleProjectIds = await input.getVisibleProjectIds();
  if (visibleProjectIds === null) {
    const project = await permissionRepository.findProjectTenantById(input.projectId);
    return Boolean(project && input.matchesTenant(project));
  }

  return visibleProjectIds.includes(input.projectId);
}
