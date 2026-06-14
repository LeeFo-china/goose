import { accessPolicyService } from "./shared";
import type {
  AuthContext,
  BootstrapPermissions,
  ConstructionStagesResult,
  InternalBootstrapPermissions,
  ProjectMembersResult,
} from "./shared";

export async function buildPermissions(this: any, input: {
  authContext: AuthContext;
  projectId: string;
  constructionStages: ConstructionStagesResult | null;
}): Promise<BootstrapPermissions> {
  const [
    canUpdateProject,
    canWriteProjectLogByPermission,
    canAccessAcceptance,
    canViewProjectReferral,
    canManageProjectReferral,
  ] = await Promise.all([
    this.canAccessProjectByPermission(
      input.authContext,
      input.projectId,
      "project.update",
    ),
    this.canWriteProjectLog(input.authContext, input.projectId),
    this.canAccessProjectByOptionalPermission(
      input.authContext,
      input.projectId,
      [
        "project_acceptance.read",
        "project_acceptance.create",
        "project_acceptance.update_own",
        "project_acceptance.submit",
        "project_acceptance.review",
        "project_acceptance.reject",
        "project_acceptance.manage",
      ],
    ),
    this.canAccessProjectByOptionalPermission(
      input.authContext,
      input.projectId,
      ["project_referral.read", "project_referral.manage"],
    ),
    this.canAccessProjectByPermission(
      input.authContext,
      input.projectId,
      "project_referral.manage",
    ),
  ]);
  const canCreateProjectLogByStage = input.constructionStages
    ? input.constructionStages.stages?.some((item) => Boolean(item.can_create_log)) ??
      false
    : true;

  return {
    employee_id: input.authContext.employeeId ?? null,
    can_read_project: true,
    can_update_project: canUpdateProject,
    can_manage_project_team: canUpdateProject,
    can_create_project_log: canWriteProjectLogByPermission &&
      canCreateProjectLogByStage,
    can_access_project_acceptance: canAccessAcceptance,
    can_view_project_referral: canViewProjectReferral,
    can_manage_project_referral: canManageProjectReferral,
    scopes: {
      project_update: accessPolicyService.getScope(
        input.authContext,
        "project.update",
      ),
      project_log_create: accessPolicyService.getScope(
        input.authContext,
        "project_log.create",
      ),
      project_acceptance_manage: accessPolicyService.getScope(
        input.authContext,
        "project_acceptance.manage",
      ),
    },
  };
}

export async function buildPermissionsFromKnownData(this: any, input: {
  authContext: AuthContext;
  project: Record<string, unknown>;
  storedMembers: ProjectMembersResult;
  rawMembers: Array<Record<string, unknown>>;
}): Promise<InternalBootstrapPermissions> {
  const permissionMembers = input.rawMembers.length > 0
    ? input.rawMembers
    : input.storedMembers as unknown as Array<Record<string, unknown>>;
  const [
    canUpdateProject,
    canWriteProjectLogByPermission,
    canAccessAcceptance,
    canCreateAcceptance,
    canManageAcceptance,
    canViewProjectReferral,
    canManageProjectReferral,
  ] = await Promise.all([
    this.canAccessKnownProjectByPermission(
      input.authContext,
      input.project,
      permissionMembers,
      "project.update",
    ),
    this.canWriteKnownProjectLog(
      input.authContext,
      input.project,
      permissionMembers,
    ),
    this.canAccessKnownProjectByOptionalPermission(
      input.authContext,
      input.project,
      permissionMembers,
      [
        "project_acceptance.read",
        "project_acceptance.create",
        "project_acceptance.update_own",
        "project_acceptance.submit",
        "project_acceptance.review",
        "project_acceptance.reject",
        "project_acceptance.manage",
      ],
    ),
    this.canAccessKnownProjectByPermission(
      input.authContext,
      input.project,
      permissionMembers,
      "project_acceptance.create",
    ),
    this.canAccessKnownProjectByPermission(
      input.authContext,
      input.project,
      permissionMembers,
      "project_acceptance.manage",
    ),
    this.canAccessKnownProjectByOptionalPermission(
      input.authContext,
      input.project,
      permissionMembers,
      ["project_referral.read", "project_referral.manage"],
    ),
    this.canAccessKnownProjectByPermission(
      input.authContext,
      input.project,
      permissionMembers,
      "project_referral.manage",
    ),
  ]);

  return {
    employee_id: input.authContext.employeeId ?? null,
    can_read_project: true,
    can_update_project: canUpdateProject,
    can_manage_project_team: canUpdateProject,
    can_create_project_log: canWriteProjectLogByPermission,
    can_access_project_acceptance: canAccessAcceptance,
    can_view_project_referral: canViewProjectReferral,
    can_manage_project_referral: canManageProjectReferral,
    scopes: {
      project_update: accessPolicyService.getScope(
        input.authContext,
        "project.update",
      ),
      project_log_create: accessPolicyService.getScope(
        input.authContext,
        "project_log.create",
      ),
      project_acceptance_manage: accessPolicyService.getScope(
        input.authContext,
        "project_acceptance.manage",
      ),
    },
    internal_can_create_acceptance: canCreateAcceptance,
    internal_can_manage_acceptance: canManageAcceptance,
  };
}

export function toPublicPermissions(this: any, 
  permissions: InternalBootstrapPermissions,
): BootstrapPermissions {
  const {
    internal_can_create_acceptance: _create,
    internal_can_manage_acceptance: _manage,
    ...publicPermissions
  } = permissions;

  return publicPermissions;
}

export async function canAccessKnownProjectByOptionalPermission(this: any, 
  authContext: AuthContext,
  project: Record<string, unknown>,
  members: Array<Record<string, unknown>>,
  permissionCodes: string[],
) {
  const results = await Promise.all(
    permissionCodes.map((permissionCode) =>
      this.canAccessKnownProjectByPermission(
        authContext,
        project,
        members,
        permissionCode,
      )
    ),
  );

  return results.some(Boolean);
}

export async function canAccessKnownProjectByPermission(this: any, 
  authContext: AuthContext,
  project: Record<string, unknown>,
  members: Array<Record<string, unknown>>,
  permissionCode: string,
) {
  if (!accessPolicyService.hasPermission(authContext, permissionCode)) {
    return false;
  }

  const scope = accessPolicyService.getScope(authContext, permissionCode);
  if (!scope || !authContext.employeeId) {
    return false;
  }

  if (!this.isKnownProjectInTenant(authContext, project)) {
    return false;
  }

  if (scope === "all") {
    return true;
  }

  if (scope === "department") {
    return this.hasDepartmentMember(authContext, members) ||
      accessPolicyService.canAccessProject(
        authContext,
        String(project.id ?? ""),
        permissionCode,
      );
  }

  return this.hasEmployeeProjectAccess(authContext, project, members);
}

export async function canWriteKnownProjectLog(this: any, 
  authContext: AuthContext,
  project: Record<string, unknown>,
  members: Array<Record<string, unknown>>,
) {
  if (!accessPolicyService.hasPermission(authContext, "project_log.create")) {
    return false;
  }

  const scope = accessPolicyService.getScope(authContext, "project_log.create");
  if (!scope || !authContext.employeeId) {
    return false;
  }

  if (!this.isKnownProjectInTenant(authContext, project)) {
    return false;
  }

  if (scope === "all") {
    return true;
  }

  if (scope === "department") {
    return this.hasDepartmentMember(authContext, members) ||
      accessPolicyService.canWriteProjectLog(
        authContext,
        String(project.id ?? ""),
      );
  }

  return members.some((member) =>
    member.employee_id === authContext.employeeId &&
    !member.deleted_at
  );
}

export function isKnownProjectInTenant(this: any, 
  authContext: AuthContext,
  project: Record<string, unknown>,
) {
  if (authContext.isPlatformAdmin) {
    return true;
  }

  return Boolean(
    authContext.tenantId &&
    typeof project.tenant_id === "string" &&
    project.tenant_id === authContext.tenantId,
  );
}

export function hasEmployeeProjectAccess(this: any, 
  authContext: AuthContext,
  project: Record<string, unknown>,
  members: Array<Record<string, unknown>>,
) {
  if (!authContext.employeeId) {
    return false;
  }

  if (members.some((member) =>
    member.employee_id === authContext.employeeId &&
    !member.deleted_at
  )) {
    return true;
  }

  const customer = this.normalizeObject(project.customer);
  return customer?.owner_id === authContext.employeeId;
}

export function hasDepartmentMember(this: any, 
  authContext: AuthContext,
  members: Array<Record<string, unknown>>,
) {
  if (!authContext.tenantDepartmentId) {
    return false;
  }

  return members.some((member) => {
    const employee = this.normalizeObject(member.employee);
    return this.getRelationId(employee?.tenant_department) ===
      authContext.tenantDepartmentId;
  });
}

export function normalizeObject(this: any, value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return this.normalizeObject(value[0]);
  }

  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

export function getRelationId(this: any, value: unknown) {
  const object = this.normalizeObject(value);
  return typeof object?.id === "string" ? object.id : null;
}

export function completePermissionsByStages(this: any, 
  permissions: BootstrapPermissions,
  constructionStages: ConstructionStagesResult | null,
): BootstrapPermissions {
  const canCreateProjectLogByStage = constructionStages?.stages
    ?.some((item) => Boolean(item.can_create_log)) ?? false;

  return {
    ...permissions,
    can_create_project_log: permissions.can_create_project_log &&
      canCreateProjectLogByStage,
  };
}

export async function canAccessProjectByOptionalPermission(this: any, 
  authContext: AuthContext,
  projectId: string,
  permissionCodes: string[],
) {
  const results = await Promise.all(
    permissionCodes.map((permissionCode) =>
      this.canAccessProjectByPermission(authContext, projectId, permissionCode)
    ),
  );

  return results.some(Boolean);
}

export async function canAccessProjectByPermission(this: any, 
  authContext: AuthContext,
  projectId: string,
  permissionCode: string,
) {
  if (!accessPolicyService.hasPermission(authContext, permissionCode)) {
    return false;
  }

  return accessPolicyService.canAccessProject(
    authContext,
    projectId,
    permissionCode,
  );
}

export async function canWriteProjectLog(this: any, authContext: AuthContext, projectId: string) {
  if (!accessPolicyService.hasPermission(authContext, "project_log.create")) {
    return false;
  }

  return accessPolicyService.canWriteProjectLog(authContext, projectId);
}
