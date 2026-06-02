import {
  accessPolicyService,
  type AuthContext,
  type ProjectAcceptanceRow,
} from "./shared";

export async function canAccessProjectByOptionalPermission(
  authContext: AuthContext,
  projectId: string,
  permissionCodes: string[],
) {
  for (const permissionCode of permissionCodes) {
    if (!accessPolicyService.hasPermission(authContext, permissionCode)) {
      continue;
    }

    if (
      await accessPolicyService.canAccessProject(
        authContext,
        projectId,
        permissionCode,
      )
    ) {
      return true;
    }
  }

  return false;
}

async function canManageAcceptance(
  authContext: AuthContext,
  acceptance: ProjectAcceptanceRow,
) {
  if (!accessPolicyService.hasPermission(authContext, "project_acceptance.manage")) {
    return false;
  }

  return accessPolicyService.canAccessProject(
    authContext,
    acceptance.project_id,
    "project_acceptance.manage",
  );
}

function canUpdateOrSubmitOwnAcceptance(
  authContext: AuthContext,
  acceptance: ProjectAcceptanceRow,
) {
  return Boolean(
    authContext.employeeId &&
      acceptance.initiator_id === authContext.employeeId &&
      (
        accessPolicyService.hasPermission(authContext, "project_acceptance.update_own") ||
        accessPolicyService.hasPermission(authContext, "project_acceptance.submit")
      ),
  );
}

function canReviewOrRejectAcceptance(
  authContext: AuthContext,
  acceptance: ProjectAcceptanceRow,
) {
  const employeeId = authContext.employeeId;
  const permissionCodes = [
    "project_acceptance.review",
    "project_acceptance.reject",
  ];

  return permissionCodes.some((permissionCode) => {
    if (!accessPolicyService.hasPermission(authContext, permissionCode)) {
      return false;
    }

    const scope = accessPolicyService.getScope(authContext, permissionCode);
    if (scope === "all") {
      return true;
    }

    return Boolean(employeeId && acceptance.reviewer_id === employeeId);
  });
}

async function canHandleExistingAcceptance(
  authContext: AuthContext,
  acceptance: ProjectAcceptanceRow,
) {
  if (await canManageAcceptance(authContext, acceptance)) {
    return true;
  }

  if (acceptance.status === "draft" || acceptance.status === "rejected") {
    return canUpdateOrSubmitOwnAcceptance(authContext, acceptance);
  }

  if (acceptance.status === "submitted") {
    return canReviewOrRejectAcceptance(authContext, acceptance);
  }

  return false;
}

export async function buildAcceptanceWritableMap(
  authContext: AuthContext,
  acceptances: ProjectAcceptanceRow[],
  canManageAcceptanceByPermission?: boolean,
) {
  if (canManageAcceptanceByPermission === true) {
    return new Map(acceptances.map((acceptance) => [
      acceptance.stage_code,
      true,
    ] as const));
  }

  const entries = await Promise.all(
    acceptances.map(async (acceptance) => [
      acceptance.stage_code,
      await canHandleExistingAcceptance(authContext, acceptance),
    ] as const),
  );

  return new Map(entries);
}
