import { Errors } from "@/errors/error-factory";
import {
  projectReceivablePlanRepository,
  type ProjectReceivableSummary,
} from "@/repositories/project-receivable-plans";
import type {
  FinanceReceivableListQuery,
  ProjectReceivableListQuery,
} from "@/schema/finance-receivables";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

type ProjectReceivablesServiceDependencies = {
  planRepository: Pick<
    typeof projectReceivablePlanRepository,
    "list" | "summarizeProject" | "findProjectTenant"
  >;
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission" | "canAccessProject"
  >;
};

export class ProjectReceivablesService {
  constructor(
    private readonly dependencies: ProjectReceivablesServiceDependencies = {
      planRepository: projectReceivablePlanRepository,
      accessPolicyService,
    },
  ) {}

  async listReceivables(
    authContext: AuthContext,
    query: FinanceReceivableListQuery,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertFinanceReceivableView(authContext);

    return this.dependencies.planRepository.list({
      tenantId,
      query,
      tenantToday: getTenantToday(),
    });
  }

  async listProjectReceivables(
    authContext: AuthContext,
    projectId: string,
    query: ProjectReceivableListQuery,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    await this.assertCanReadProjectReceivables({
      authContext,
      tenantId,
      projectId,
    });

    const tenantToday = getTenantToday();
    const [receivables, summary] = await Promise.all([
      this.dependencies.planRepository.list({
        tenantId,
        query: {
          ...query,
          project_id: projectId,
        },
        tenantToday,
      }),
      this.dependencies.planRepository.summarizeProject({
        tenantId,
        projectId,
        tenantToday,
      }),
    ]);

    return {
      ...receivables,
      summary,
    };
  }

  async getProjectReceivableSummary(
    authContext: AuthContext,
    projectId: string,
  ): Promise<ProjectReceivableSummary> {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    await this.assertCanReadProjectReceivables({
      authContext,
      tenantId,
      projectId,
    });

    return this.dependencies.planRepository.summarizeProject({
      tenantId,
      projectId,
      tenantToday: getTenantToday(),
    });
  }

  private assertFinanceReceivableView(authContext: AuthContext) {
    if (!this.hasFinanceReceivableView(authContext)) {
      throw Errors.forbidden();
    }
  }

  private async assertCanReadProjectReceivables(input: {
    authContext: AuthContext;
    tenantId: string;
    projectId: string;
  }) {
    if (this.hasFinanceReceivableView(input.authContext)) {
      const project = await this.dependencies.planRepository.findProjectTenant(
        input.projectId,
      );
      if (!project || project.tenant_id !== input.tenantId) {
        throw Errors.forbidden();
      }
      return;
    }

    const canAccessProject = await this.dependencies.accessPolicyService
      .canAccessProject(input.authContext, input.projectId, "project.read");
    if (!canAccessProject) {
      throw Errors.forbidden();
    }
  }

  private hasFinanceReceivableView(authContext: AuthContext) {
    return this.dependencies.accessPolicyService.hasPermission(
      authContext,
      "finance.receivable.view",
    ) ||
      this.dependencies.accessPolicyService.hasPermission(
        authContext,
        "finance.receivable.manage",
      ) ||
      this.dependencies.accessPolicyService.hasPermission(
        authContext,
        "finance.view",
      );
  }
}

function getTenantToday() {
  return new Date().toISOString().slice(0, 10);
}

export const projectReceivablesService = new ProjectReceivablesService();
