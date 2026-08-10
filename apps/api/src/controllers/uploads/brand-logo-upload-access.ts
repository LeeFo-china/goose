import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import {
  authorizationService,
  type AuthContext,
} from "@/services/authorization";
import { tenantEntitlementsService } from "@/services/tenant-entitlements";
import type { JwtPayload } from "@/utils/jwt";

type BrandLogoUploadAccessDependencies = {
  authorizationService: Pick<
    typeof authorizationService,
    "getRequiredAuthContext"
  >;
  accessPolicyService: Pick<typeof accessPolicyService, "assertPermission">;
  tenantEntitlementsService: {
    assertCanCustomize(
      authContext: AuthContext,
      now: Date,
    ): Promise<{ tenantId: string }>;
  };
};

const defaultDependencies: BrandLogoUploadAccessDependencies = {
  authorizationService,
  accessPolicyService,
  tenantEntitlementsService,
};

export async function assertBrandLogoUploadSceneAccess(
  user: JwtPayload,
  scene: string,
  dependencies: BrandLogoUploadAccessDependencies = defaultDependencies,
) {
  if (scene !== "brand_logo") return null;
  if (!user.sub) throw Errors.forbidden();

  const authContext = await dependencies.authorizationService
    .getRequiredAuthContext(user.sub, { tenantServiceAccess: "write" });
  if (!authContext.employeeId) throw Errors.forbidden();

  if (authContext.isPlatformAdmin) {
    if (authContext.tenantId) throw Errors.forbidden();
    dependencies.accessPolicyService.assertPermission(
      authContext,
      "platform.branding.manage",
    );
    return {
      tenantId: null,
      employeeId: authContext.employeeId,
      customerId: null,
      visitorId: null,
      isPlatformAdmin: true,
    };
  }

  if (!authContext.tenantId) throw Errors.forbidden();
  const customization = await dependencies.tenantEntitlementsService
    .assertCanCustomize(authContext, new Date());
  return {
    tenantId: customization.tenantId,
    employeeId: authContext.employeeId,
    customerId: null,
    visitorId: null,
    isPlatformAdmin: false,
  };
}
