import type { PlatformServiceTrialCapability } from "@gooes/domain";
import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { tenantServiceAccessService } from "@/services/tenant-service-access";

export async function assertWorkflowTaskBusinessWriteAccess(
  authContext: AuthContext,
  requiredCapability: PlatformServiceTrialCapability,
): Promise<void> {
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const decision = await tenantServiceAccessService.resolveForRoute({
    tenantId, routeAccess: "write", requiredCapability,
  });
  if (decision.allowed) return;
  throw Errors.business(
    decision.errorCode === "TENANT_SERVICE_ACCESS_EXPIRED" ? 402 : 403,
    decision.reason ?? "租户服务访问不可用",
    decision.errorCode ?? "TENANT_SERVICE_ACCESS_DENIED",
    {
      tenant_id: tenantId, access_mode: decision.mode,
      access_level: decision.accessLevel,
      starts_at: decision.startsAt, ends_at: decision.endsAt,
    },
  );
}
