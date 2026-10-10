import { Errors } from "@/errors/error-factory";
import { projectLogCommunicationAccessRepository } from "@/repositories/project-log-communication-access";
import { customerProjectDetailRepository } from "@/repositories/customer-project-detail";
import { projectLogInternalCommentsRepository } from "@/repositories/project-log-internal-comments";
import { authorizationService } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { tenantServiceAccessService, type TenantServiceAccessDecision } from "@/services/tenant-service-access";
import type { JwtPayload } from "@/utils/jwt";
type Dependencies = {
  repository?: typeof projectLogCommunicationAccessRepository;
  projects?: Pick<typeof customerProjectDetailRepository, "findOwnedProjectAccess">;
  employees?: Pick<typeof projectLogInternalCommentsRepository, "findActiveEmployee">;
  authorization?: Pick<typeof authorizationService, "getRequiredAuthContext">;
  policy?: Pick<typeof accessPolicyService, "getScope" | "hasPermission" | "canWriteProjectLog">;
  tenant?: Pick<typeof tenantServiceAccessService, "resolveForRoute">;
};
export type ProjectCommunicationActor = {
  tenantId: string;
  type: "employee" | "customer";
  author: {
    id: string;
    name: string | null;
  };
  canWrite: boolean;
};
export type CommunicationAccessInput = {
  actor: JwtPayload | undefined;
  log: {
    id: string;
    tenant_id: string | null;
    project_id: string;
  };
  write: boolean;
};
export class ProjectLogCommunicationAccess {
  private readonly repository;
  private readonly projects;
  private readonly employees;
  private readonly authorization;
  private readonly policy;
  private readonly tenant;
  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ?? projectLogCommunicationAccessRepository;
    this.projects = dependencies.projects ?? customerProjectDetailRepository;
    this.employees = dependencies.employees ?? projectLogInternalCommentsRepository;
    this.authorization = dependencies.authorization ?? authorizationService;
    this.policy = dependencies.policy ?? accessPolicyService;
    this.tenant = dependencies.tenant ?? tenantServiceAccessService;
  }
  async resolve(input: CommunicationAccessInput): Promise<ProjectCommunicationActor> {
    const actor = input.actor;
    if (!actor?.sub)
      throw Errors.unauthorized();
    if (!actor.tenant_id || actor.tenant_id !== input.log.tenant_id || !actor.roles?.length
      || (actor.token_type && actor.token_type !== "auth"))
      throw Errors.forbidden();
    // Older customer sessions carry account-wide roles. The signed customer_id
    // selects customer scope; never fall back to any employee privileges.
    const type = actor.customer_id && !actor.employee_id && actor.roles.includes("customer")
      ? "customer" : actor.roles.length === 1 ? actor.roles[0] : null;
    if (type === "customer" && actor.customer_id && !actor.employee_id) {
      const scope = { tenantId: actor.tenant_id, customerId: actor.customer_id };
      const [customer, member, project] = await Promise.all([
        this.repository.findCustomer(scope),
        this.repository.hasMembership({ ...scope, userId: actor.sub }),
        // Repository call intentionally bypasses the customer page's access cache.
        this.projects.findOwnedProjectAccess({ ...scope, projectId: input.log.project_id }),
      ]);
      if (!customer || !member || !project)
        throw Errors.forbidden();
      const canWrite = await this.tenantAccess(actor.tenant_id, input.write);
      return { tenantId: actor.tenant_id, type, author: customer, canWrite };
    }
    if (type !== "employee" || !actor.employee_id || actor.customer_id)
      throw Errors.forbidden();
    const context = await this.authorization.getRequiredAuthContext(actor.sub, {
      tenantServiceAccess: "read", requiredCapability: "core.projects", freshPermissions: true,
    });
    if (context.employeeId !== actor.employee_id || context.tenantId !== actor.tenant_id
      || context.employeeStatus !== "active" || context.isPlatformAdmin || context.isPlatformStaff)
      throw Errors.forbidden();
    const employee = await this.employees.findActiveEmployee({ employeeId: actor.employee_id, tenantId: actor.tenant_id, userId: actor.sub });
    const scope = this.policy.getScope(context, "project.read");
    if (!employee || !scope || !await this.repository.canReadProjectScope({
      projectId: input.log.project_id, tenantId: actor.tenant_id, employeeId: actor.employee_id,
      scope, departmentId: context.tenantDepartmentId ?? null,
    }))
      throw Errors.forbidden();
    const tenantWritable = await this.tenantAccess(actor.tenant_id, input.write);
    const canWrite = tenantWritable && this.policy.hasPermission(context, "project_log.create")
      && await this.policy.canWriteProjectLog(context, input.log.project_id);
    if (input.write && !canWrite)
      throw Errors.forbidden();
    return { tenantId: actor.tenant_id, type, author: employee, canWrite };
  }
  private async tenantAccess(tenantId: string, write: boolean): Promise<boolean> {
    const options = { tenantId, requiredCapability: "core.projects" as const };
    const decision = await this.tenant.resolveForRoute({ ...options, routeAccess: write ? "write" : "read" });
    this.assertTenantAllowed(tenantId, decision);
    if (write)
      return true;
    const writeDecision = await this.tenant.resolveForRoute({ ...options, routeAccess: "write" });
    return writeDecision.allowed;
  }
  private assertTenantAllowed(tenantId: string, decision: TenantServiceAccessDecision): void {
    if (decision.allowed)
      return;
    throw Errors.business(decision.errorCode === "TENANT_SERVICE_ACCESS_EXPIRED" ? 402 : 403, decision.reason ?? "租户服务访问不可用", decision.errorCode ?? "TENANT_SERVICE_ACCESS_DENIED", {
      tenant_id: tenantId, access_mode: decision.mode, access_level: decision.accessLevel,
      starts_at: decision.startsAt, ends_at: decision.endsAt,
    });
  }
}
export const projectLogCommunicationAccess = new ProjectLogCommunicationAccess();
