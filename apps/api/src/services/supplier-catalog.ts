import { Errors } from "@/errors/error-factory";
import {
  supplierCatalogRepository,
  type SupplierCatalogRepositoryPort,
} from "@/repositories/supplier-catalog";
import {
  tenantSuppliersRepository,
  type TenantSupplierSettings,
} from "@/repositories/tenant-suppliers";
import {
  isSupplierIdempotencyConflict,
} from "@/repositories/supplier-create-command-rpc";
import type {
  CatalogBrandCreateInput,
  CatalogBrandListQuery,
  CatalogBrandUpdateInput,
  CatalogCategoryCreateInput,
  CatalogCategoryListQuery,
  CatalogCategoryUpdateInput,
  CatalogSpecDefinitionCreateInput,
  CatalogSpecDefinitionListQuery,
  CatalogSpecDefinitionUpdateInput,
  CatalogUnitCreateInput,
  CatalogUnitListQuery,
  CatalogUnitSuggestionReviewInput,
  CatalogUnitUpdateInput,
  PlatformCatalogUnitSuggestionListQuery,
  TenantCatalogBrandCreateInput,
  TenantCatalogBrandListQuery,
  TenantCatalogBrandUpdateInput,
  TenantCatalogCategoryCreateInput,
  TenantCatalogCategoryListQuery,
  TenantCatalogCategoryUpdateInput,
  CopyPlatformSpecDefinitionsInput,
  CatalogUnitSuggestionCreateInput,
  CatalogUnitSuggestionListQuery,
} from "@/schema/supplier-catalog";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { SupplierCatalogPlatformWorkflows } from "./supplier-catalog-platform-workflows";
import { SupplierCatalogTenantService } from "./supplier-catalog-tenant";
import {
  deriveSupplierCatalogCommandId,
  type SupplierCatalogCommandIdFactory,
} from "./supplier-catalog-command-id";
import { isCatalogConflict } from "./supplier-catalog-conflict-detection";

const PLATFORM_PERMISSION = "platform.catalog.manage";
type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertPermission" | "assertTenantContext"
>;
type SettingsRepositoryPort = {
  getSettings(tenantId: string): Promise<TenantSupplierSettings | null>;
};

export type SupplierCatalogServiceDependencies = {
  repository?: SupplierCatalogRepositoryPort;
  accessPolicy?: AccessPolicyPort;
  settingsRepository?: SettingsRepositoryPort;
  commandIdFactory?: SupplierCatalogCommandIdFactory;
};

export class SupplierCatalogService {
  private readonly repository: SupplierCatalogRepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly commandIdFactory: SupplierCatalogCommandIdFactory;
  private readonly tenantService: SupplierCatalogTenantService;
  private readonly platformWorkflows: SupplierCatalogPlatformWorkflows;

  constructor(dependencies: SupplierCatalogServiceDependencies = {}) {
    this.repository = dependencies.repository ?? supplierCatalogRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.commandIdFactory = dependencies.commandIdFactory ??
      deriveSupplierCatalogCommandId;
    this.tenantService = new SupplierCatalogTenantService(
      this.repository,
      dependencies.settingsRepository ?? tenantSuppliersRepository,
      this.accessPolicy,
      this.commandIdFactory,
    );
    this.platformWorkflows = new SupplierCatalogPlatformWorkflows({
      repository: this.repository,
      commandIdFactory: this.commandIdFactory,
      requirePlatform: (authContext) => this.requirePlatform(authContext),
      requirePlatformActor: (authContext) =>
        this.requirePlatformActor(authContext),
      mapCatalogConflict: (operation) => this.mapCatalogConflict(operation),
    });
  }

  listPlatformCategories(
    authContext: AuthContext,
    query: CatalogCategoryListQuery,
  ) {
    this.requirePlatform(authContext);
    return this.repository.listCategories(query, { kind: "platform" });
  }

  listTenantCategories(
    authContext: AuthContext,
    query: TenantCatalogCategoryListQuery,
  ) {
    return this.tenantService.listCategories(authContext, query);
  }

  listPlatformBrands(
    authContext: AuthContext,
    query: CatalogBrandListQuery,
  ) {
    this.requirePlatform(authContext);
    return this.repository.listBrands(query, { kind: "platform" });
  }

  listTenantBrands(
    authContext: AuthContext,
    query: TenantCatalogBrandListQuery,
  ) {
    return this.tenantService.listBrands(authContext, query);
  }

  listPlatformUnits(
    authContext: AuthContext,
    query: CatalogUnitListQuery,
  ) {
    this.requirePlatform(authContext);
    return this.repository.listUnits(query);
  }

  listTenantUnits(
    authContext: AuthContext,
    query: CatalogUnitListQuery,
  ) {
    return this.tenantService.listUnits(authContext, query);
  }

  createTenantCategory(
    authContext: AuthContext,
    input: TenantCatalogCategoryCreateInput,
    idempotencyKey: string,
  ) {
    return this.tenantService.createCategory(
      authContext,
      input,
      idempotencyKey,
    );
  }

  updateTenantCategory(
    authContext: AuthContext,
    categoryId: string,
    input: TenantCatalogCategoryUpdateInput,
    idempotencyKey: string,
  ) {
    return this.tenantService.updateCategory(
      authContext,
      categoryId,
      input,
      idempotencyKey,
    );
  }

  pinTenantCategory(
    authContext: AuthContext,
    categoryId: string,
    input: { expected_version: number },
    idempotencyKey: string,
  ) {
    return this.tenantService.pinCategory(
      authContext,
      categoryId,
      input,
      idempotencyKey,
    );
  }

  createTenantBrand(
    authContext: AuthContext,
    input: TenantCatalogBrandCreateInput,
    idempotencyKey: string,
  ) {
    return this.tenantService.createBrand(authContext, input, idempotencyKey);
  }

  updateTenantBrand(
    authContext: AuthContext,
    brandId: string,
    input: TenantCatalogBrandUpdateInput,
    idempotencyKey: string,
  ) {
    return this.tenantService.updateBrand(
      authContext,
      brandId,
      input,
      idempotencyKey,
    );
  }

  listTenantSpecDefinitions(
    authContext: AuthContext,
    categoryId: string,
    query: CatalogSpecDefinitionListQuery,
  ) {
    return this.tenantService.listSpecDefinitions(
      authContext,
      categoryId,
      query,
    );
  }

  createTenantSpecDefinition(
    authContext: AuthContext,
    categoryId: string,
    input: CatalogSpecDefinitionCreateInput,
    idempotencyKey: string,
  ) {
    return this.tenantService.createSpecDefinition(
      authContext,
      categoryId,
      input,
      idempotencyKey,
    );
  }

  updateTenantSpecDefinition(
    authContext: AuthContext,
    categoryId: string,
    definitionId: string,
    input: CatalogSpecDefinitionUpdateInput,
    idempotencyKey: string,
  ) {
    return this.tenantService.updateSpecDefinition(
      authContext,
      categoryId,
      definitionId,
      input,
      idempotencyKey,
    );
  }

  copyPlatformSpecDefinitions(
    authContext: AuthContext,
    categoryId: string,
    input: CopyPlatformSpecDefinitionsInput,
    idempotencyKey: string,
  ) {
    return this.tenantService.copyPlatformSpecDefinitions(
      authContext,
      categoryId,
      input,
      idempotencyKey,
    );
  }

  listTenantUnitSuggestions(
    authContext: AuthContext,
    query: CatalogUnitSuggestionListQuery,
  ) {
    return this.tenantService.listUnitSuggestions(authContext, query);
  }

  submitTenantUnitSuggestion(
    authContext: AuthContext,
    input: CatalogUnitSuggestionCreateInput,
    idempotencyKey: string,
  ) {
    return this.tenantService.submitUnitSuggestion(
      authContext,
      input,
      idempotencyKey,
    );
  }

  createCategory(
    authContext: AuthContext,
    input: CatalogCategoryCreateInput,
    idempotencyKey: string,
  ) {
    const actor = this.requirePlatformActor(authContext);
    return this.mapCatalogConflict(() =>
      this.repository.createCategory({
        ...input,
        category_id: this.commandIdFactory(
          "platform.catalog.category.create",
          actor.authUserId,
          idempotencyKey,
        ),
        ...createContext(actor, idempotencyKey),
      })
    );
  }

  updateCategory(
    authContext: AuthContext,
    categoryId: string,
    input: CatalogCategoryUpdateInput,
  ) {
    const actor = this.requirePlatformActor(authContext);
    return this.mapCatalogConflict(() =>
      this.repository.updateCategory({
        ...input,
        category_id: categoryId,
        updated_by_employee_id: actor.employeeId,
      })
    );
  }

  createBrand(
    authContext: AuthContext,
    input: CatalogBrandCreateInput,
    idempotencyKey: string,
  ) {
    const actor = this.requirePlatformActor(authContext);
    return this.mapCatalogConflict(() =>
      this.repository.createBrand({
        ...input,
        brand_id: this.commandIdFactory(
          "platform.catalog.brand.create",
          actor.authUserId,
          idempotencyKey,
        ),
        ...createContext(actor, idempotencyKey),
      })
    );
  }

  updateBrand(
    authContext: AuthContext,
    brandId: string,
    input: CatalogBrandUpdateInput,
  ) {
    const actor = this.requirePlatformActor(authContext);
    return this.mapCatalogConflict(() =>
      this.repository.updateBrand({
        ...input,
        brand_id: brandId,
        updated_by_employee_id: actor.employeeId,
      })
    );
  }

  createUnit(
    authContext: AuthContext,
    input: CatalogUnitCreateInput,
    idempotencyKey: string,
  ) {
    const actor = this.requirePlatformActor(authContext);
    return this.mapCatalogConflict(() =>
      this.repository.createUnit({
        ...input,
        unit_id: this.commandIdFactory(
          "platform.catalog.unit.create",
          actor.authUserId,
          idempotencyKey,
        ),
        ...createContext(actor, idempotencyKey),
      })
    );
  }

  updateUnit(
    authContext: AuthContext,
    unitId: string,
    input: CatalogUnitUpdateInput,
  ) {
    const actor = this.requirePlatformActor(authContext);
    return this.mapCatalogConflict(() =>
      this.repository.updateUnit({
        ...input,
        unit_id: unitId,
        updated_by_employee_id: actor.employeeId,
      })
    );
  }

  listPlatformSpecDefinitions(
    authContext: AuthContext,
    categoryId: string,
    query: CatalogSpecDefinitionListQuery,
  ) {
    return this.platformWorkflows.listSpecDefinitions(
      authContext,
      categoryId,
      query,
    );
  }

  createPlatformSpecDefinition(
    authContext: AuthContext,
    categoryId: string,
    input: CatalogSpecDefinitionCreateInput,
    idempotencyKey: string,
  ) {
    return this.platformWorkflows.createSpecDefinition(
      authContext,
      categoryId,
      input,
      idempotencyKey,
    );
  }

  async updatePlatformSpecDefinition(
    authContext: AuthContext,
    categoryId: string,
    definitionId: string,
    input: CatalogSpecDefinitionUpdateInput,
    idempotencyKey: string,
  ) {
    return this.platformWorkflows.updateSpecDefinition(
      authContext,
      categoryId,
      definitionId,
      input,
      idempotencyKey,
    );
  }

  listPlatformUnitSuggestions(
    authContext: AuthContext,
    query: PlatformCatalogUnitSuggestionListQuery,
  ) {
    return this.platformWorkflows.listUnitSuggestions(authContext, query);
  }

  reviewPlatformUnitSuggestion(
    authContext: AuthContext,
    suggestionId: string,
    input: CatalogUnitSuggestionReviewInput,
    idempotencyKey: string,
  ) {
    return this.platformWorkflows.reviewUnitSuggestion(
      authContext,
      suggestionId,
      input,
      idempotencyKey,
    );
  }

  private requirePlatform(authContext: AuthContext): void {
    const isPlatformIdentity =
      authContext.isPlatformStaff || authContext.isPlatformAdmin;
    if (
      authContext.tenantId !== null ||
      !isPlatformIdentity
    ) throw Errors.forbidden();
    this.accessPolicy.assertPermission(authContext, PLATFORM_PERMISSION);
  }

  private requirePlatformActor(authContext: AuthContext) {
    this.requirePlatform(authContext);
    if (!authContext.employeeId || !authContext.authUserId) {
      throw Errors.forbidden();
    }
    return {
      employeeId: authContext.employeeId,
      authUserId: authContext.authUserId,
    };
  }

  private async mapCatalogConflict<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isSupplierIdempotencyConflict(error)) {
        throw Errors.business(
          409,
          "幂等键已用于其他供应商操作",
          "SUPPLIER_IDEMPOTENCY_CONFLICT",
        );
      }
      if (!isCatalogConflict(error)) throw error;
      throw Errors.business(
        409,
        "标准目录编码、层级或启停状态冲突",
        "SUPPLIER_CATALOG_CONFLICT",
      );
    }
  }
}

function createContext(
  actor: { authUserId: string; employeeId: string },
  idempotencyKey: string,
) {
  return {
    actor_user_id: actor.authUserId,
    actor_employee_id: actor.employeeId,
    idempotency_key: idempotencyKey,
  };
}

export const supplierCatalogService = new SupplierCatalogService();
