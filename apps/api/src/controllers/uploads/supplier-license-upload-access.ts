import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import type { JwtPayload } from "@/utils/jwt";

export async function assertSupplierLicenseUploadSceneAccess(
  user: JwtPayload,
  scene: string,
) {
  if (scene !== "supplier_business_license") return null;
  if (!user.sub) throw Errors.unauthorized();

  const authContext = await authorizationService.getRequiredAuthContext(user.sub);
  const isPlatformIdentity =
    authContext.isPlatformStaff === true ||
    authContext.isPlatformAdmin === true;
  if (
    !isPlatformIdentity ||
    authContext.tenantId !== null ||
    !authContext.employeeId
  ) {
    throw Errors.forbidden();
  }
  accessPolicyService.assertPermission(authContext, "platform.supplier.manage");

  return {
    tenantId: null,
    employeeId: authContext.employeeId,
    customerId: null,
    visitorId: null,
    isPlatformAdmin: authContext.isPlatformAdmin,
    isPlatformIdentity,
  };
}
