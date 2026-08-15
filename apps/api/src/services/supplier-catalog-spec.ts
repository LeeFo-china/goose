import { Errors } from "@/errors/error-factory";
import {
  findCategoryOwnership,
  getTenantSupplierSettings,
} from "@/repositories/supplier-catalog-tenant";
import {
  copyPlatformSpecs,
  createPlatformSpecDefinition,
  createSpecDefinition,
  findSpecDefinitionOwnership,
  listPlatformSpecDefinitions,
  listSpecDefinitions,
  listUnitSuggestions,
  processUnitSuggestion,
  submitUnitSuggestion,
  updatePlatformSpecDefinition,
  updateSpecDefinition,
} from "@/repositories/supplier-catalog-spec-repository";
import type {
  CatalogSpecDefinitionCreateInput,
  CatalogSpecDefinitionListQuery,
  CatalogSpecDefinitionUpdateInput,
  CatalogUnitSuggestionCreateInput,
  CatalogUnitSuggestionListQuery,
} from "@/schema/supplier-catalog";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { SupabaseDB } from "@/utils/supabase";

const TENANT_CATALOG_PERMISSION = "supplier.catalog.manage";
const TENANT_VIEW_PERMISSION = "supplier.view";

type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertPermission" | "assertTenantContext"
>;

export type CatalogOwnershipSnapshot = {
  ownershipScope: "platform" | "tenant";
  ownerTenantId: string | null;
};

export type SupplierCatalogSpecRepositoryPort = {
  getTenantSupplierSettings(
    tenantId: string,
  ): Promise<{ private_catalog_writes_enabled: boolean } | null>;
  findCategoryOwnership(
    categoryId: string,
  ): Promise<CatalogOwnershipSnapshot | null>;
  findSpecDefinitionOwnership(
    specId: string,
  ): Promise<CatalogOwnershipSnapshot | null>;
  listSpecDefinitions(
    categoryId: string,
    tenantId: string,
    query: CatalogSpecDefinitionListQuery,
  ): Promise<unknown>;
  createSpecDefinition(input: unknown): Promise<unknown>;
  updateSpecDefinition(input: unknown): Promise<unknown>;
  copyPlatformSpecs(input: unknown): Promise<unknown>;
  submitUnitSuggestion(input: unknown): Promise<unknown>;
  listUnitSuggestions(
    tenantId: string | null,
    query: CatalogUnitSuggestionListQuery,
  ): Promise<unknown>;
  listPlatformSpecDefinitions(
    categoryId: string,
    query: CatalogSpecDefinitionListQuery,
  ): Promise<unknown>;
  createPlatformSpecDefinition(input: unknown): Promise<unknown>;
  updatePlatformSpecDefinition(input: unknown): Promise<unknown>;
  processUnitSuggestion(input: unknown): Promise<unknown>;
};

export type SupplierCatalogSpecServiceDependencies = {
  repository?: SupplierCatalogSpecRepositoryPort;
  accessPolicy?: AccessPolicyPort;
  idFactory?: () => string;
};

export class SupplierCatalogSpecService {
  private readonly repository: SupplierCatalogSpecRepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly idFactory: () => string;

  constructor(dependencies: SupplierCatalogSpecServiceDependencies = {}) {
    this.repository = dependencies.repository ??
      createSupplierCatalogSpecRepository();
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.idFactory = dependencies.idFactory ?? (() => crypto.randomUUID());
  }

  listSpecDefinitions(
    authContext: AuthContext,
    categoryId: string,
    query: CatalogSpecDefinitionListQuery,
  ) {
    const tenantId = this.requireTenant(authContext);
    return this.repository.listSpecDefinitions(categoryId, tenantId, query);
  }

  async createTenantSpecDefinition(
    authContext: AuthContext,
    categoryId: string,
    input: CatalogSpecDefinitionCreateInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireTenantCatalogWriteActor(authContext);
    await this.assertTenantCategory(categoryId, actor.tenantId);
    return this.repository.createSpecDefinition({
      ...input,
      spec_id: this.idFactory(),
      category_id: categoryId,
      tenant_id: actor.tenantId,
      actor_user_id: actor.authUserId,
      actor_employee_id: actor.employeeId,
      idempotency_key: idempotencyKey,
    });
  }

  async updateTenantSpecDefinition(
    authContext: AuthContext,
    specId: string,
    input: CatalogSpecDefinitionUpdateInput,
  ) {
    const actor = await this.requireTenantCatalogWriteActor(authContext);
    const ownership = await this.repository.findSpecDefinitionOwnership(specId);
    if (!ownership || ownership.ownershipScope === "platform") {
      throw Errors.business(
        403,
        "平台共享目录记录为只读",
        "SHARED_RESOURCE_READ_ONLY",
      );
    }
    if (ownership.ownerTenantId !== actor.tenantId) {
      throw Errors.business(
        404,
        "规格定义不存在",
        "SPEC_TEMPLATE_VALIDATION_ERROR",
      );
    }
    return this.repository.updateSpecDefinition({
      ...input,
      spec_id: specId,
      tenant_id: actor.tenantId,
      actor_user_id: actor.authUserId,
      actor_employee_id: actor.employeeId,
    });
  }

  async copyPlatformSpecs(
    authContext: AuthContext,
    categoryId: string,
    idempotencyKey: string,
  ) {
    const actor = await this.requireTenantCatalogWriteActor(authContext);
    await this.assertTenantCategory(categoryId, actor.tenantId);
    return this.repository.copyPlatformSpecs({
      target_category_id: categoryId,
      tenant_id: actor.tenantId,
      actor_user_id: actor.authUserId,
      actor_employee_id: actor.employeeId,
      idempotency_key: idempotencyKey,
    });
  }

  async submitUnitSuggestion(
    authContext: AuthContext,
    input: CatalogUnitSuggestionCreateInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireTenantCatalogWriteActor(authContext);
    return this.repository.submitUnitSuggestion({
      ...input,
      tenant_id: actor.tenantId,
      actor_user_id: actor.authUserId,
      actor_employee_id: actor.employeeId,
      idempotency_key: idempotencyKey,
    });
  }

  listUnitSuggestions(
    authContext: AuthContext,
    query: CatalogUnitSuggestionListQuery,
  ) {
    const tenantId = this.requireTenant(authContext);
    return this.repository.listUnitSuggestions(tenantId, query);
  }

  listPlatformSpecDefinitions(
    authContext: AuthContext,
    categoryId: string,
    query: CatalogSpecDefinitionListQuery,
  ) {
    this.requirePlatform(authContext);
    return this.repository.listPlatformSpecDefinitions(categoryId, query);
  }

  async createPlatformSpecDefinition(
    authContext: AuthContext,
    categoryId: string,
    input: CatalogSpecDefinitionCreateInput,
    idempotencyKey: string,
  ) {
    const actor = this.requirePlatformActor(authContext);
    return this.repository.createPlatformSpecDefinition({
      ...input,
      spec_id: this.idFactory(),
      category_id: categoryId,
      actor_user_id: actor.authUserId,
      actor_employee_id: actor.employeeId,
      idempotency_key: idempotencyKey,
    });
  }

  async updatePlatformSpecDefinition(
    authContext: AuthContext,
    specId: string,
    input: CatalogSpecDefinitionUpdateInput,
  ) {
    const actor = this.requirePlatformActor(authContext);
    const ownership = await this.repository.findSpecDefinitionOwnership(specId);
    if (!ownership || ownership.ownershipScope !== "platform") {
      throw Errors.business(
        404,
        "平台规格定义不存在",
        "SPEC_TEMPLATE_VALIDATION_ERROR",
      );
    }
    return this.repository.updatePlatformSpecDefinition({
      ...input,
      spec_id: specId,
      actor_user_id: actor.authUserId,
      actor_employee_id: actor.employeeId,
    });
  }

  listPlatformUnitSuggestions(
    authContext: AuthContext,
    query: CatalogUnitSuggestionListQuery,
  ) {
    this.requirePlatform(authContext);
    return this.repository.listUnitSuggestions(null, query);
  }

  async processUnitSuggestion(
    authContext: AuthContext,
    suggestionId: string,
    input: { status: "approved" | "rejected" },
  ) {
    const actor = this.requirePlatformActor(authContext);
    return this.repository.processUnitSuggestion({
      suggestion_id: suggestionId,
      status: input.status,
      actor_user_id: actor.authUserId,
      actor_employee_id: actor.employeeId,
    });
  }

  private requireTenant(authContext: AuthContext): string {
    this.accessPolicy.assertTenantContext(authContext);
    this.accessPolicy.assertPermission(authContext, TENANT_VIEW_PERMISSION);
    if (!authContext.tenantId) throw Errors.forbidden();
    return authContext.tenantId;
  }

  private async requireTenantCatalogWriteActor(authContext: AuthContext) {
    this.accessPolicy.assertTenantContext(authContext);
    this.accessPolicy.assertPermission(authContext, TENANT_CATALOG_PERMISSION);
    const tenantId = authContext.tenantId;
    if (!tenantId || !authContext.employeeId || !authContext.authUserId) {
      throw Errors.forbidden();
    }
    const settings = await this.repository.getTenantSupplierSettings(tenantId);
    if (!settings?.private_catalog_writes_enabled) {
      throw Errors.business(
        403,
        "当前租户尚未启用私有目录写入",
        "SUPPLIER_PRIVATE_WRITES_DISABLED",
      );
    }
    return {
      tenantId,
      authUserId: authContext.authUserId,
      employeeId: authContext.employeeId,
    };
  }

  private requirePlatform(authContext: AuthContext): void {
    const isPlatformIdentity =
      authContext.isPlatformStaff || authContext.isPlatformAdmin;
    if (authContext.tenantId !== null || !isPlatformIdentity) {
      throw Errors.forbidden();
    }
    this.accessPolicy.assertPermission(authContext, "platform.catalog.manage");
  }

  private requirePlatformActor(authContext: AuthContext) {
    this.requirePlatform(authContext);
    if (!authContext.employeeId || !authContext.authUserId) {
      throw Errors.forbidden();
    }
    return {
      authUserId: authContext.authUserId,
      employeeId: authContext.employeeId,
    };
  }

  private async assertTenantCategory(categoryId: string, tenantId: string) {
    const ownership = await this.repository.findCategoryOwnership(categoryId);
    if (!ownership || ownership.ownerTenantId !== tenantId) {
      throw Errors.business(
        404,
        "目录分类不存在",
        "CATEGORY_OWNERSHIP_CONFLICT",
      );
    }
  }
}

function createSupplierCatalogSpecRepository(): SupplierCatalogSpecRepositoryPort {
  const client = SupabaseDB.getAdminClient();
  return {
    getTenantSupplierSettings: (tenantId) =>
      getTenantSupplierSettings(client, tenantId),
    findCategoryOwnership: (categoryId) =>
      findCategoryOwnership(client, categoryId),
    findSpecDefinitionOwnership: (specId) =>
      findSpecDefinitionOwnership(client, specId),
    listSpecDefinitions: (categoryId, tenantId, query) =>
      listSpecDefinitions(client, categoryId, tenantId, query),
    createSpecDefinition: (input) =>
      createSpecDefinition(client, input as never),
    updateSpecDefinition: (input) =>
      updateSpecDefinition(client, input as never),
    copyPlatformSpecs: (input) =>
      copyPlatformSpecs(client, input as never),
    submitUnitSuggestion: (input) =>
      submitUnitSuggestion(client, input as never),
    listUnitSuggestions: (tenantId, query) =>
      listUnitSuggestions(client, tenantId, query),
    listPlatformSpecDefinitions: (categoryId, query) =>
      listPlatformSpecDefinitions(client, categoryId, query),
    createPlatformSpecDefinition: (input) =>
      createPlatformSpecDefinition(client, input as never),
    updatePlatformSpecDefinition: (input) =>
      updatePlatformSpecDefinition(client, input as never),
    processUnitSuggestion: (input) =>
      processUnitSuggestion(client, input as never),
  };
}

export const supplierCatalogSpecService = new SupplierCatalogSpecService();
