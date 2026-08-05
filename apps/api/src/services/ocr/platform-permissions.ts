import { Errors } from "@/errors/error-factory";
import type { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import type { PermissionCode } from "@gooes/domain";

type AccessPolicyPort = Pick<typeof accessPolicyService, "hasPermission">;

export function assertPlatformOcrPermission(
  authContext: AuthContext,
  accessPolicy: AccessPolicyPort,
  permission: PermissionCode,
) {
  const isPlatformIdentity =
    authContext.isPlatformStaff === true || authContext.isPlatformAdmin === true;
  if (
    authContext.tenantId !== null ||
    !isPlatformIdentity ||
    !accessPolicy.hasPermission(authContext, permission)
  ) {
    throw Errors.forbidden();
  }
}
