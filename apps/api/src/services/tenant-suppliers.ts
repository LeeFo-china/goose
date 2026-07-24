import { Errors } from "@/errors/error-factory";
import {
  tenantSuppliersRepository,
  type TenantSupplierDetail,
  type TenantSupplierMutationResult,
  type TenantSuppliersRepositoryPort,
} from "@/repositories/tenant-suppliers";
import type {
  SupplierContractCreateInput,
  SupplierContractUpdateInput,
  TenantSupplierContractPolicyInput,
  TenantSupplierCreateInput,
  TenantSupplierDirectoryQuery,
  TenantSupplierListQuery,
  TenantSupplierUpdateInput,
} from "@/schema/tenant-suppliers";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

const PERMISSION = {
  view: "supplier.view",
  manage: "supplier.manage",
  contract: "supplier.contract.manage",
} as const;

type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "assertPermission"
>;
export type TenantSuppliersServiceDependencies = {
  repository?: TenantSuppliersRepositoryPort;
  accessPolicy?: AccessPolicyPort;
};
export type RelationshipAction =
  | "activate"
  | "suspend"
  | "terminate"
  | "blacklist";
export type ContractAction = "activate" | "terminate";
type LifecycleInput = {
  expected_version: number;
  reason?: string;
};
type ChildPageQuery = {
  page: number;
  pageSize: number;
};

export class TenantSuppliersService {
  private readonly repository: TenantSuppliersRepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;

  constructor(dependencies: TenantSuppliersServiceDependencies = {}) {
    this.repository = dependencies.repository ?? tenantSuppliersRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
  }

  async getSettings(authContext: AuthContext) {
    const tenantId = this.requireTenant(authContext, "view");
    return this.requireEnabled(tenantId);
  }

  async updateContractPolicy(
    authContext: AuthContext,
    input: TenantSupplierContractPolicyInput,
  ) {
    const tenantId = this.requireTenant(authContext, "manage");
    await this.requireEnabled(tenantId);
    return this.repository.updateContractPolicy({
      tenant_id: tenantId,
      require_active_contract_for_new_order:
        input.require_active_contract_for_new_order,
      expected_version: input.expected_version,
    });
  }

  async listRelationships(
    authContext: AuthContext,
    query: TenantSupplierListQuery,
  ) {
    const tenantId = this.requireTenant(authContext, "view");
    await this.requireEnabled(tenantId);
    return this.repository.listRelationships({
      ...omitTenantId(query),
      tenant_id: tenantId,
    });
  }

  async listDirectory(
    authContext: AuthContext,
    query: TenantSupplierDirectoryQuery,
  ) {
    const tenantId = this.requireTenant(authContext, "view");
    await this.requireEnabled(tenantId);
    return this.repository.listDirectory({
      ...omitTenantId(query),
      tenant_id: tenantId,
    });
  }

  async getRelationship(
    authContext: AuthContext,
    tenantSupplierId: string,
  ) {
    const tenantId = this.requireTenant(authContext, "view");
    await this.requireEnabled(tenantId);
    return this.requireRelationship(tenantId, tenantSupplierId);
  }

  async createRelationship(
    authContext: AuthContext,
    tenantSupplierId: string,
    input: TenantSupplierCreateInput,
    idempotencyKey: string,
  ) {
    const actor = this.requireActor(authContext, "manage");
    await this.requireEnabled(actor.tenantId);
    return this.requireMutation(await this.mapDatabaseErrors(() =>
      this.repository.createRelationship({
        tenant_id: actor.tenantId,
        tenant_supplier_id: tenantSupplierId,
        supplier_id: input.supplier_id,
        actor_user_id: actor.authUserId,
        actor_employee_id: actor.employeeId,
        idempotency_key: idempotencyKey,
      })));
  }

  async updateRelationship(
    authContext: AuthContext,
    tenantSupplierId: string,
    input: TenantSupplierUpdateInput,
  ) {
    const actor = this.requireActor(authContext, "manage");
    await this.requireEnabled(actor.tenantId);
    return this.requireMutation(await this.mapDatabaseErrors(() =>
      this.repository.updateRelationship({
        ...omitTenantId(input),
        tenant_id: actor.tenantId,
        tenant_supplier_id: tenantSupplierId,
        updated_by_employee_id: actor.employeeId,
      })));
  }

  async mutateRelationship(
    authContext: AuthContext,
    tenantSupplierId: string,
    action: RelationshipAction,
    input: LifecycleInput,
    idempotencyKey: string,
  ) {
    const actor = this.requireActor(authContext, "manage");
    await this.requireEnabled(actor.tenantId);
    return this.requireMutation(await this.mapDatabaseErrors(() =>
      this.repository.mutateRelationship({
        tenant_id: actor.tenantId,
        tenant_supplier_id: tenantSupplierId,
        action,
        expected_version: input.expected_version,
        reason: input.reason,
        actor_user_id: actor.authUserId,
        actor_employee_id: actor.employeeId,
        idempotency_key: idempotencyKey,
      })));
  }

  async getOrderEligibility(
    authContext: AuthContext,
    tenantSupplierId: string,
  ) {
    const tenantId = this.requireTenant(authContext, "view");
    await this.requireEnabled(tenantId);
    return this.repository.getOrderEligibility({
      tenant_id: tenantId,
      id: tenantSupplierId,
    });
  }

  async assertCanCreatePurchaseOrder(
    authContext: AuthContext,
    tenantSupplierId: string,
  ): Promise<void> {
    const tenantId = this.requireTenant(authContext, "view");
    const eligibility = await this.repository.getOrderEligibility({
      tenant_id: tenantId,
      id: tenantSupplierId,
    });
    if (eligibility.eligible) return;
    throw Errors.business(
      409,
      "供应商当前不满足新订单创建条件",
      "SUPPLIER_ORDER_NOT_ELIGIBLE",
      {
        blocking_reasons: eligibility.blocking_reasons,
        eligibility,
      },
    );
  }

  async listContracts(
    authContext: AuthContext,
    tenantSupplierId: string,
    query: ChildPageQuery,
  ) {
    const tenantId = this.requireTenant(authContext, "view");
    await this.requireEnabled(tenantId);
    await this.requireRelationship(tenantId, tenantSupplierId);
    return this.repository.listContracts({
      tenant_id: tenantId,
      tenant_supplier_id: tenantSupplierId,
      ...omitTenantId(query),
    });
  }

  async createContract(
    authContext: AuthContext,
    tenantSupplierId: string,
    contractId: string,
    input: SupplierContractCreateInput,
    idempotencyKey: string,
  ) {
    const actor = this.requireActor(authContext, "contract");
    await this.requireEnabled(actor.tenantId);
    await this.requireRelationship(actor.tenantId, tenantSupplierId);
    return this.requireMutation(await this.mapDatabaseErrors(() =>
      this.repository.createContract({
        ...input,
        contract_id: contractId,
        tenant_id: actor.tenantId,
        tenant_supplier_id: tenantSupplierId,
        created_by_employee_id: actor.employeeId,
        updated_by_employee_id: actor.employeeId,
        actor_user_id: actor.authUserId,
        actor_employee_id: actor.employeeId,
        idempotency_key: idempotencyKey,
      })));
  }

  async updateContract(
    authContext: AuthContext,
    tenantSupplierId: string,
    contractId: string,
    input: SupplierContractUpdateInput,
  ) {
    const actor = this.requireActor(authContext, "contract");
    await this.requireEnabled(actor.tenantId);
    await this.requireRelationship(actor.tenantId, tenantSupplierId);
    return this.mapDatabaseErrors(() => this.repository.updateContract({
      ...omitTenantId(input),
      tenant_id: actor.tenantId,
      tenant_supplier_id: tenantSupplierId,
      contract_id: contractId,
      updated_by_employee_id: actor.employeeId,
    }));
  }

  async mutateContract(
    authContext: AuthContext,
    tenantSupplierId: string,
    contractId: string,
    action: ContractAction,
    input: LifecycleInput,
    idempotencyKey: string,
  ) {
    const actor = this.requireActor(authContext, "contract");
    await this.requireEnabled(actor.tenantId);
    await this.requireRelationship(actor.tenantId, tenantSupplierId);
    return this.requireMutation(await this.mapDatabaseErrors(() =>
      this.repository.mutateContract({
        tenant_id: actor.tenantId,
        tenant_supplier_id: tenantSupplierId,
        contract_id: contractId,
        action,
        expected_version: input.expected_version,
        reason: input.reason,
        actor_user_id: actor.authUserId,
        actor_employee_id: actor.employeeId,
        idempotency_key: idempotencyKey,
      })));
  }

  async listEvents(
    authContext: AuthContext,
    tenantSupplierId: string,
    query: ChildPageQuery,
  ) {
    const tenantId = this.requireTenant(authContext, "view");
    await this.requireEnabled(tenantId);
    await this.requireRelationship(tenantId, tenantSupplierId);
    return this.repository.listEvents({
      tenant_id: tenantId,
      tenant_supplier_id: tenantSupplierId,
      ...omitTenantId(query),
    });
  }

  private requireTenant(
    authContext: AuthContext,
    permission: keyof typeof PERMISSION,
  ) {
    const tenantId = this.accessPolicy.assertTenantContext(authContext);
    this.accessPolicy.assertPermission(authContext, PERMISSION[permission]);
    return tenantId;
  }

  private requireActor(
    authContext: AuthContext,
    permission: keyof typeof PERMISSION,
  ) {
    const tenantId = this.requireTenant(authContext, permission);
    if (!authContext.employeeId || !authContext.authUserId) {
      throw Errors.forbidden();
    }
    return {
      tenantId,
      authUserId: authContext.authUserId,
      employeeId: authContext.employeeId,
    };
  }

  private async requireEnabled(tenantId: string) {
    const settings = await this.repository.getSettings(tenantId);
    if (settings?.module_enabled) return settings;
    throw Errors.business(
      403,
      "当前租户尚未启用供应商模块",
      "SUPPLIER_MODULE_DISABLED",
    );
  }

  private async requireRelationship(
    tenantId: string,
    tenantSupplierId: string,
  ): Promise<TenantSupplierDetail> {
    const relationship = await this.repository.findRelationship({
      tenant_id: tenantId,
      id: tenantSupplierId,
    });
    if (relationship) return relationship;
    throw Errors.business(
      404,
      "租户供应商合作关系不存在",
      "TENANT_SUPPLIER_NOT_FOUND",
    );
  }

  private requireMutation(result: TenantSupplierMutationResult) {
    if (result.status === "created" || result.status === "updated") {
      return result;
    }
    const errorCode = result.error_code ?? mutationErrorCode(result.status);
    const isNotFound = result.status === "supplier_not_found" ||
      result.status === "tenant_supplier_not_found";
    throw Errors.business(
      isNotFound ? 404 : 409,
      isNotFound
        ? "供应商或租户合作关系不存在"
        : "供应商状态、版本或幂等键已变化，请刷新后重试",
      errorCode,
      result,
    );
  }

  private async mapDatabaseErrors<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (containsDatabaseCode(error, "SUPPLIER_MODULE_DISABLED")) {
        throw Errors.business(
          403,
          "当前租户尚未启用供应商模块",
          "SUPPLIER_MODULE_DISABLED",
        );
      }
      if (containsDatabaseCode(error, "SUPPLIER_IDEMPOTENCY_CONFLICT")) {
        throw Errors.business(
          409,
          "幂等键已用于其他供应商操作",
          "SUPPLIER_IDEMPOTENCY_CONFLICT",
        );
      }
      if (containsDatabaseCode(error, "TENANT_SUPPLIER_STATE_CONFLICT")) {
        throw Errors.business(
          409,
          "供应商合作关系数据不属于当前租户",
          "TENANT_SUPPLIER_STATE_CONFLICT",
        );
      }
      throw error;
    }
  }
}

function mutationErrorCode(status: TenantSupplierMutationResult["status"]) {
  return {
    supplier_not_found: "SUPPLIER_NOT_FOUND",
    tenant_supplier_not_found: "TENANT_SUPPLIER_NOT_FOUND",
    state_conflict: "TENANT_SUPPLIER_STATE_CONFLICT",
    version_conflict: "SUPPLIER_VERSION_CONFLICT",
    idempotency_conflict: "SUPPLIER_IDEMPOTENCY_CONFLICT",
    created: "TENANT_SUPPLIER_STATE_CONFLICT",
    updated: "TENANT_SUPPLIER_STATE_CONFLICT",
  }[status];
}

function omitTenantId<T extends object>(input: T): Omit<T, "tenant_id"> {
  const { tenant_id: _tenantId, ...rest } =
    input as T & { tenant_id?: unknown };
  return rest;
}

function containsDatabaseCode(error: unknown, code: string): boolean {
  if (typeof error === "string") return error.includes(code);
  if (Array.isArray(error)) {
    return error.some((item) => containsDatabaseCode(item, code));
  }
  if (typeof error !== "object" || error === null) return false;
  return Object.values(error).some((value) =>
    containsDatabaseCode(value, code)
  );
}

export const tenantSuppliersService = new TenantSuppliersService();
