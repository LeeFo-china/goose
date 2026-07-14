import type { ProjectOperationalRiskRpcPage } from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import { projectOperationalRiskRepository } from "@/repositories/project-operational-risks";
import type { ProjectOperationalRiskListQuery } from "@/schema/project-health";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { presentProjectOperationalRisk } from "@/services/project-operational-risk-presentation";

type Awaitable<T> = T | Promise<T>;

type AccessPolicyServicePort = {
  assertTenantContext(authContext: AuthContext): Awaitable<string>;
  assertPermission(
    authContext: AuthContext,
    permissionCode: string,
  ): Awaitable<unknown>;
  getScope(
    authContext: AuthContext,
    permissionCode: string,
  ): Awaitable<string | null>;
};

type ProjectOperationalRiskRepositoryPort = {
  listPage(input: {
    tenantId: string;
    query: ProjectOperationalRiskListQuery;
  }): Promise<{ page: ProjectOperationalRiskRpcPage; rpcMs: number }>;
};

const defaultProjectOperationalRiskRepository: ProjectOperationalRiskRepositoryPort = {
  listPage: (input) => projectOperationalRiskRepository.listPage(input),
};

const defaultAccessPolicyService: AccessPolicyServicePort = {
  assertTenantContext: (authContext) =>
    accessPolicyService.assertTenantContext(authContext),
  assertPermission: (authContext, permissionCode) =>
    accessPolicyService.assertPermission(authContext, permissionCode),
  getScope: (authContext, permissionCode) =>
    accessPolicyService.getScope(authContext, permissionCode),
};

export type ProjectOperationalRiskServiceDependencies = {
  repository?: ProjectOperationalRiskRepositoryPort;
  accessPolicyService?: AccessPolicyServicePort;
};

export class ProjectOperationalRiskService {
  private readonly repository: ProjectOperationalRiskRepositoryPort;
  private readonly accessPolicyService: AccessPolicyServicePort;

  constructor(dependencies: ProjectOperationalRiskServiceDependencies = {}) {
    this.repository =
      dependencies.repository ?? defaultProjectOperationalRiskRepository;
    this.accessPolicyService =
      dependencies.accessPolicyService ?? defaultAccessPolicyService;
  }

  private async assertReadable(authContext: AuthContext): Promise<string> {
    const tenantId = await this.accessPolicyService.assertTenantContext(authContext);
    await this.accessPolicyService.assertPermission(authContext, "dashboard.read");
    const projectReadScope = await this.accessPolicyService.assertPermission(
      authContext,
      "project.read",
    );

    if (projectReadScope !== "all") {
      throw Errors.forbidden();
    }

    return tenantId;
  }

  async listRisks(authContext: AuthContext, query: ProjectOperationalRiskListQuery) {
    const startedAt = Date.now();
    const tenantId = await this.assertReadable(authContext);
    const result = await this.repository.listPage({ tenantId, query });
    const serviceMs = Date.now() - startedAt;

    return {
      data: {
        ...result.page,
        items: result.page.items.map(presentProjectOperationalRisk),
      },
      timing: {
        rpcMs: result.rpcMs,
        serviceMs,
      },
    };
  }
}

export const projectOperationalRiskService = new ProjectOperationalRiskService();
