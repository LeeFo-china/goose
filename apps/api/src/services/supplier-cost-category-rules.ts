import { Errors } from "@/errors/error-factory";
import {
  supplierCostCategoryRulesRepository,
  type SupplierCostCategoryRulesRepository,
} from "@/repositories/supplier-cost-category-rules";
import type {
  SupplierCostCategoryOptionQuery,
  SupplierCostCategoryRuleListQuery,
  SupplierCostCategoryRuleScope,
  SupplierCostCategoryRuleUpsertInput,
} from "@/schema/supplier-cost-category-rules";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

type RepositoryPort = Pick<SupplierCostCategoryRulesRepository,
  | "listCostCategories"
  | "listRules"
  | "findActiveCostCategory"
  | "findVisibleCategory"
  | "findVisibleProduct"
  | "findRule"
  | "saveRule"
  | "deleteRule"
>;

type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "assertPermission"
>;

export class SupplierCostCategoryRulesService {
  private readonly repository: RepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;

  constructor(dependencies: {
    repository?: RepositoryPort;
    accessPolicy?: AccessPolicyPort;
  } = {}) {
    this.repository = dependencies.repository ?? supplierCostCategoryRulesRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
  }

  listCostCategoryOptions(
    auth: AuthContext,
    query: SupplierCostCategoryOptionQuery,
  ) {
    const { tenantId } = this.requireManage(auth);
    return this.repository.listCostCategories(tenantId, query);
  }

  listRules(auth: AuthContext, query: SupplierCostCategoryRuleListQuery) {
    const { tenantId } = this.requireManage(auth);
    return this.repository.listRules(tenantId, query);
  }

  async saveRule(
    auth: AuthContext,
    scope: SupplierCostCategoryRuleScope,
    targetId: string,
    input: SupplierCostCategoryRuleUpsertInput,
  ) {
    const actor = this.requireManage(auth);
    await this.requireVisibleTarget(actor.tenantId, scope, targetId);
    const costCategory = await this.repository.findActiveCostCategory(
      actor.tenantId,
      input.cost_category_id,
    );
    if (!costCategory) {
      throw Errors.business(
        400,
        "成本分类不存在或已停用",
        "SUPPLIER_COST_CATEGORY_INVALID",
      );
    }
    const current = await this.repository.findRule(
      actor.tenantId,
      scope,
      targetId,
    );
    if ((current?.version ?? 0) !== input.expected_version) {
      throw this.versionConflict();
    }
    return this.repository.saveRule({
      tenantId: actor.tenantId,
      employeeId: actor.employeeId,
      scope,
      targetId,
      costCategoryId: input.cost_category_id,
      currentRuleId: current?.id ?? null,
      expectedVersion: input.expected_version,
    });
  }

  async deleteRule(
    auth: AuthContext,
    scope: SupplierCostCategoryRuleScope,
    targetId: string,
    expectedVersion: number,
  ) {
    const actor = this.requireManage(auth);
    await this.requireVisibleTarget(actor.tenantId, scope, targetId);
    const current = await this.repository.findRule(
      actor.tenantId,
      scope,
      targetId,
    );
    if (!current || current.version !== expectedVersion) {
      throw this.versionConflict();
    }
    const deleted = await this.repository.deleteRule({
      tenantId: actor.tenantId,
      ruleId: current.id,
      expectedVersion,
    });
    if (!deleted) throw this.versionConflict();
    return { deleted: true };
  }

  private requireManage(auth: AuthContext) {
    const tenantId = this.accessPolicy.assertTenantContext(auth);
    this.accessPolicy.assertPermission(auth, "supplier.catalog.manage");
    if (!auth.employeeId) throw Errors.forbidden();
    return { tenantId, employeeId: auth.employeeId };
  }

  private async requireVisibleTarget(
    tenantId: string,
    scope: SupplierCostCategoryRuleScope,
    targetId: string,
  ) {
    const target = scope === "category"
      ? await this.repository.findVisibleCategory(tenantId, targetId)
      : await this.repository.findVisibleProduct(tenantId, targetId);
    if (!target) {
      throw Errors.business(
        404,
        scope === "category" ? "商品分类不存在" : "商品不存在",
        "SUPPLIER_COST_CATEGORY_TARGET_NOT_FOUND",
      );
    }
  }

  private versionConflict() {
    return Errors.business(
      409,
      "成本归类规则已发生变化，请刷新后重试",
      "SUPPLIER_COST_CATEGORY_RULE_VERSION_CONFLICT",
    );
  }
}

export const supplierCostCategoryRulesService =
  new SupplierCostCategoryRulesService();
