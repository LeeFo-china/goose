import { createHash } from "node:crypto";
import type { PermissionCode, PlatformServiceTrialCapability } from "@gooes/domain";
import { Errors } from "@/errors/error-factory";
import { tenantActivityRepository } from "@/repositories/tenant-activity";
import { authorizationService, type AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import type { TenantActivityViewInput } from "@/schema/tenant-activity";
import { verifyTokenDetailed, type JwtPayload } from "@/utils/jwt";
import { resolveActivityChannel, type CapturedTenantActivity } from "./tenant-activity-capture";

const SCREEN_ACCESS: Record<TenantActivityViewInput["screen"], {
  permission: PermissionCode; capability: PlatformServiceTrialCapability;
}> = {
  customers: { permission: "customer.read", capability: "core.customers" },
  projects: { permission: "project.read", capability: "core.projects" },
  dashboard: { permission: "dashboard.read", capability: "core.projects" },
  finance: { permission: "finance.reports.read", capability: "business.finance" },
};

export class TenantActivityCollectionService {
  constructor(private readonly repository: Pick<typeof tenantActivityRepository, "record"> = tenantActivityRepository) {}

  async recordView(user: JwtPayload | undefined, input: TenantActivityViewInput) {
    const channel = resolveActivityChannel(user);
    if (!channel) throw Errors.business(403, "仅支持租户员工使用统计", "TENANT_ACTIVITY_EMPLOYEE_REQUIRED");
    const access = SCREEN_ACCESS[input.screen];
    // A telemetry POST records an already viewed page, so read access remains valid in grace.
    const context = await authorizationService.getRequiredAuthContext(user?.sub, {
      tenantServiceAccess: "read", requiredCapability: access.capability,
    });
    if (!isTenantEmployee(context, user)) throw Errors.business(403, "仅支持租户员工使用统计", "TENANT_ACTIVITY_EMPLOYEE_REQUIRED");
    accessPolicyService.assertPermission(context, access.permission);
    const recorded = await this.repository.record({
      tenantId: context.tenantId, employeeId: context.employeeId, channel, kind: "view",
      eventKey: `view:${input.screen}:${Math.floor(Date.now() / 300_000)}`,
    });
    return { recorded };
  }

  async recordResponse(input: {
    activity: CapturedTenantActivity;
    user?: JwtPayload;
    authContext?: AuthContext;
  }): Promise<void> {
    const isLogin = input.activity.kind === "login";
    const user = input.activity.kind === "login"
      ? verifyTokenDetailed(input.activity.token).payload ?? undefined : input.user;
    const channel = resolveActivityChannel(user);
    if (!channel) return;
    // Mutations use the exact context that authorized the business operation, never re-resolve a different identity.
    const context = isLogin
      ? await authorizationService.getRequiredAuthContext(user?.sub, { tenantServiceAccess: "session" })
      : input.authContext;
    if (!context || !isTenantEmployee(context, user)) return;
    const eventKey = input.activity.kind === "login"
      ? input.activity.eventKey ?? `login:${createHash("sha256").update(input.activity.token).digest("hex")}`
      : input.activity.eventKey;
    await this.repository.record({
      tenantId: context.tenantId, employeeId: context.employeeId, channel,
      kind: input.activity.kind, eventKey,
    });
  }
}

function isTenantEmployee(context: AuthContext, user?: JwtPayload): context is AuthContext & {
  tenantId: string; employeeId: string;
} {
  return Boolean(context.tenantId && context.employeeId && context.authUserId === user?.sub
    && context.employeeStatus === "active" && !context.isPlatformAdmin && !context.isPlatformStaff
    && (!user?.employee_id || user.employee_id === context.employeeId)
    && (!user?.tenant_id || user.tenant_id === context.tenantId));
}
export const tenantActivityCollectionService = new TenantActivityCollectionService();
