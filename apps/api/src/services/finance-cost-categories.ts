import { Errors } from "@/errors/error-factory";
import { financeCostCategoryRepository } from "@/repositories/finance-cost-categories";
import type {
  CreateFinanceCostCategoryInput,
  FinanceCostCategoryListQuery,
  UpdateFinanceCostCategoryInput,
} from "@/schema/finance-costs";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

type FinanceCostCategoryServiceDependencies = {
  repository: {
    list: typeof financeCostCategoryRepository.list;
    create: typeof financeCostCategoryRepository.create;
    update: typeof financeCostCategoryRepository.update;
  };
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission"
  >;
};

export class FinanceCostCategoryService {
  constructor(
    private readonly dependencies: FinanceCostCategoryServiceDependencies = {
      repository: financeCostCategoryRepository,
      accessPolicyService,
    },
  ) {}

  async list(
    authContext: AuthContext,
    query: FinanceCostCategoryListQuery,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanView(authContext);

    return this.dependencies.repository.list(tenantId, query);
  }

  async create(
    authContext: AuthContext,
    input: CreateFinanceCostCategoryInput,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    const employeeId = this.assertCurrentEmployee(authContext);
    this.assertCanManage(authContext);

    return this.dependencies.repository.create({
      tenantId,
      employeeId,
      input,
    });
  }

  async update(
    authContext: AuthContext,
    id: string,
    input: UpdateFinanceCostCategoryInput,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    const employeeId = this.assertCurrentEmployee(authContext);
    this.assertCanManage(authContext);

    return this.dependencies.repository.update({
      tenantId,
      employeeId,
      id,
      input,
    });
  }

  private assertCanView(authContext: AuthContext) {
    if (
      this.hasPermission(authContext, "finance.view") ||
      this.hasPermission(authContext, "finance.budget.view") ||
      this.hasPermission(authContext, "finance.budget.manage") ||
      this.hasPermission(authContext, "finance.cost-category.view") ||
      this.hasPermission(authContext, "finance.cost-category.manage") ||
      this.hasPermission(authContext, "expense_request.create")
    ) {
      return;
    }

    throw Errors.forbidden();
  }

  private assertCanManage(authContext: AuthContext) {
    if (!this.hasPermission(authContext, "finance.cost-category.manage")) {
      throw Errors.forbidden();
    }
  }

  private hasPermission(authContext: AuthContext, permissionCode: string) {
    return this.dependencies.accessPolicyService.hasPermission(
      authContext,
      permissionCode,
    );
  }

  private assertCurrentEmployee(authContext: AuthContext) {
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }
}

export const financeCostCategoryService =
  new FinanceCostCategoryService();
