import { Errors } from "@/errors/error-factory";
import { authorizationService } from "@/services/authorization";
import { uploadService } from "@/services/uploads";
import type { JwtPayload } from "@/utils/jwt";

export async function assertApplymentUploadSceneAccess(
  user: JwtPayload,
  scene: string,
) {
  if (scene !== "wechat_pay_applyment") return null;
  if (!user.sub) throw Errors.unauthorized();
  const authContext = await authorizationService.getRequiredAuthContext(
    user.sub,
    { tenantServiceAccess: "write" },
  );
  uploadService.assertDirectUploadAccess({ authContext, scene });
  if (
    ("tenant_id" in user && (user.tenant_id ?? null) !== authContext.tenantId) ||
    ("employee_id" in user &&
      (user.employee_id ?? null) !== authContext.employeeId)
  ) {
    throw Errors.forbidden();
  }
  return {
    tenantId: authContext.tenantId,
    employeeId: authContext.employeeId,
    customerId: null,
    visitorId: null,
    isPlatformAdmin: authContext.isPlatformAdmin,
    isPlatformIdentity:
      authContext.isPlatformStaff === true || authContext.isPlatformAdmin === true,
  };
}
