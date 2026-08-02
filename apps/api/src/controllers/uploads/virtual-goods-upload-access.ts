import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import type { JwtPayload } from "@/utils/jwt";

type VirtualGoodsUploadAccessDependencies = {
  authorizationService: Pick<
    typeof authorizationService,
    "getRequiredAuthContext"
  >;
  accessPolicyService: Pick<typeof accessPolicyService, "assertPermission">;
};

const defaultDependencies: VirtualGoodsUploadAccessDependencies = {
  authorizationService,
  accessPolicyService,
};

export async function assertVirtualGoodsUploadSceneAccess(
  user: JwtPayload,
  scene: string,
  dependencies: VirtualGoodsUploadAccessDependencies = defaultDependencies,
) {
  if (scene !== "branding_virtual_goods") return null;
  if (!user.sub) throw Errors.forbidden();

  const authContext = await dependencies.authorizationService
    .getRequiredAuthContext(user.sub);
  if (
    !authContext.isPlatformAdmin ||
    authContext.tenantId ||
    !authContext.employeeId
  ) {
    throw Errors.forbidden();
  }
  dependencies.accessPolicyService.assertPermission(
    authContext,
    "platform.payment.config.manage",
  );
  return {
    tenantId: null,
    employeeId: authContext.employeeId,
    customerId: null,
    visitorId: null,
    isPlatformAdmin: true,
  };
}
