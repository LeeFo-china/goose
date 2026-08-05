import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import type { JwtPayload } from "@/utils/jwt";

type PlatformServiceFulfillmentUploadAccessDependencies = {
  authorizationService: Pick<
    typeof authorizationService,
    "getRequiredAuthContext"
  >;
  accessPolicyService: Pick<typeof accessPolicyService, "assertPermission">;
};

const defaultDependencies: PlatformServiceFulfillmentUploadAccessDependencies = {
  authorizationService,
  accessPolicyService,
};

export async function assertPlatformServiceFulfillmentUploadSceneAccess(
  user: JwtPayload,
  scene: string,
  dependencies: PlatformServiceFulfillmentUploadAccessDependencies =
    defaultDependencies,
) {
  if (scene !== "tenant_service_fulfillment_attachment") return null;
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
    "platform.service_work_order.manage",
  );
  return {
    tenantId: null,
    employeeId: authContext.employeeId,
    customerId: null,
    visitorId: null,
    isPlatformAdmin: true,
  };
}
