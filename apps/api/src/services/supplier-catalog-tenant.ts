import { Errors } from "@/errors/error-factory";
import type {
  CatalogSpecDefinitionCreateInput,
  CatalogSpecDefinitionListQuery,
  CatalogSpecDefinitionUpdateInput,
  CatalogUnitSuggestionCreateInput,
  CatalogUnitSuggestionListQuery,
  CopyPlatformSpecDefinitionsInput,
  TenantCatalogBrandCreateInput,
  TenantCatalogBrandListQuery,
  TenantCatalogBrandUpdateInput,
  TenantCatalogCategoryCreateInput,
  TenantCatalogCategoryListQuery,
  TenantCatalogCategoryUpdateInput,
} from "@/schema/supplier-catalog";
import type { SupplierCatalogRepositoryPort } from "@/repositories/supplier-catalog";
import type { TenantSupplierSettings } from "@/repositories/tenant-suppliers";
import { effectiveSupplierRolloutSettings } from "@/services/supplier-rollout-settings";
import type { AuthContext } from "@/services/authorization";
import type { SupplierCatalogCommandIdFactory } from "./supplier-catalog-command-id";
import { validateCatalogSpecFinalState } from "./supplier-catalog-spec-state";
import {
  resolveBrandUpdateReplay,
  resolveCategoryUpdateReplay,
  resolveSpecUpdateReplay,
} from "./supplier-catalog-update-replay";

type TenantSettingsPort = {
  getSettings(tenantId: string): Promise<TenantSupplierSettings | null>;
};
type TenantAccessPolicyPort = {
  assertTenantContext(auth: AuthContext): string;
  assertPermission(auth: AuthContext, permission: string): unknown;
};
type CatalogActor = {
  tenantId: string;
  authUserId: string;
  employeeId: string;
};

export class SupplierCatalogTenantService {
  constructor(
    private readonly repository: SupplierCatalogRepositoryPort,
    private readonly settingsRepository: TenantSettingsPort,
    private readonly accessPolicy: TenantAccessPolicyPort,
    private readonly commandIdFactory: SupplierCatalogCommandIdFactory,
  ) {}

  async listCategories(auth: AuthContext, query: TenantCatalogCategoryListQuery) {
    const tenantId = await this.requireRead(auth);
    const { scope, ...listQuery } = query;
    return this.repository.listCategories(
      scope === "platform" ? activeOnly(listQuery) : tenantOwnedStatus(listQuery),
      scope === "platform" ? { kind: "platform" } : { kind: "tenant", tenantId },
    );
  }

  async listBrands(auth: AuthContext, query: TenantCatalogBrandListQuery) {
    const tenantId = await this.requireRead(auth);
    const { scope, ...listQuery } = query;
    return this.repository.listBrands(
      scope === "platform" ? activeOnly(listQuery) : tenantOwnedStatus(listQuery),
      scope === "platform" ? { kind: "platform" } : { kind: "tenant", tenantId },
    );
  }

  async listUnits(auth: AuthContext, query: Parameters<
    SupplierCatalogRepositoryPort["listUnits"]
  >[0]) {
    await this.requireRead(auth);
    return this.repository.listUnits(activeOnly(query));
  }

  async createCategory(
    auth: AuthContext,
    input: TenantCatalogCategoryCreateInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireWrite(auth);
    const categoryId = this.commandIdFactory(
      "tenant.catalog.category.create",
      actor.authUserId,
      idempotencyKey,
    );
    return this.repository.createTenantCategory({
      ...input,
      category_id: categoryId,
      code: generatedTenantCategoryCode(categoryId),
      sort_order: 100,
      mapped_platform_category_id: null,
      ...tenantCommandContext(actor, idempotencyKey),
    });
  }

  async updateCategory(
    auth: AuthContext,
    categoryId: string,
    input: TenantCatalogCategoryUpdateInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireWrite(auth);
    const replay = await resolveCategoryUpdateReplay(
      this.repository,
      actor,
      categoryId,
      input,
      idempotencyKey,
    );
    if (replay) return this.repository.updateTenantCategory(replay);
    const current = await this.requireWritableCategory(actor.tenantId, categoryId);
    return this.repository.updateTenantCategory({
      category_id: categoryId,
      parent_id: input.parent_id ?? current.parent_id,
      code: current.code,
      name: input.name ?? current.name,
      status: input.status ?? current.status,
      sort_order: current.sort_order,
      mapped_platform_category_id: current.mapped_platform_category_id,
      expected_version: input.expected_version,
      ...tenantCommandContext(actor, idempotencyKey),
    });
  }

  async pinCategory(
    auth: AuthContext,
    categoryId: string,
    input: { expected_version: number },
    idempotencyKey: string,
  ) {
    const actor = await this.requireWrite(auth);
    const current = await this.requireWritableCategory(actor.tenantId, categoryId);
    const siblings = await this.repository.listCategories(
      { parent_id: current.parent_id, page: 1, pageSize: 100 },
      { kind: "tenant", tenantId: actor.tenantId },
    );
    const siblingSortOrders = siblings.list
      .map((category) => category.sort_order)
      .filter((sortOrder) => Number.isFinite(sortOrder));
    const minSortOrder = siblingSortOrders.length
      ? Math.min(...siblingSortOrders)
      : current.sort_order;
    return this.repository.updateTenantCategory({
      category_id: categoryId,
      parent_id: current.parent_id,
      code: current.code,
      name: current.name,
      status: current.status,
      sort_order: minSortOrder - 10,
      mapped_platform_category_id: current.mapped_platform_category_id,
      expected_version: input.expected_version,
      ...tenantCommandContext(actor, idempotencyKey),
    });
  }

  async createBrand(
    auth: AuthContext,
    input: TenantCatalogBrandCreateInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireWrite(auth);
    const brandId = this.commandIdFactory(
      "tenant.catalog.brand.create",
      actor.authUserId,
      idempotencyKey,
    );
    return this.repository.createTenantBrand({
      ...input,
      brand_id: brandId,
      code: generatedTenantBrandCode(brandId),
      legal_name: null,
      sort_order: 100,
      mapped_platform_brand_id: null,
      ...tenantCommandContext(actor, idempotencyKey),
    });
  }

  async updateBrand(
    auth: AuthContext,
    brandId: string,
    input: TenantCatalogBrandUpdateInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireWrite(auth);
    const replay = await resolveBrandUpdateReplay(
      this.repository,
      actor,
      brandId,
      input,
      idempotencyKey,
    );
    if (replay) return this.repository.updateTenantBrand(replay);
    const current = await this.requireWritableBrand(actor.tenantId, brandId);
    return this.repository.updateTenantBrand({
      brand_id: brandId,
      code: current.code,
      name: input.name ?? current.name,
      legal_name: current.legal_name,
      logo_file_id: current.logo_file_id,
      status: input.status ?? current.status,
      sort_order: current.sort_order,
      mapped_platform_brand_id: current.mapped_platform_brand_id,
      expected_version: input.expected_version,
      ...tenantCommandContext(actor, idempotencyKey),
    });
  }

  async listSpecDefinitions(
    auth: AuthContext,
    categoryId: string,
    query: CatalogSpecDefinitionListQuery,
  ) {
    const tenantId = await this.requireRead(auth);
    return this.repository.listSpecDefinitions(
      categoryId,
      tenantOwnedStatus(query),
      { kind: "tenant", tenantId },
    );
  }

  async createSpecDefinition(
    auth: AuthContext,
    categoryId: string,
    input: CatalogSpecDefinitionCreateInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireWrite(auth);
    await this.requireWritableCategory(actor.tenantId, categoryId);
    return this.repository.createSpecDefinition({
      ...input,
      spec_definition_id: this.commandIdFactory(
        "tenant.catalog.spec-definition.create",
        actor.authUserId,
        idempotencyKey,
      ),
      category_id: categoryId,
      tenant_id: actor.tenantId,
      ...actorCommandContext(actor, idempotencyKey),
    });
  }

  async updateSpecDefinition(
    auth: AuthContext,
    categoryId: string,
    definitionId: string,
    input: CatalogSpecDefinitionUpdateInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireWrite(auth);
    const replay = await resolveSpecUpdateReplay(
      this.repository,
      actor,
      categoryId,
      definitionId,
      input,
      idempotencyKey,
    );
    if (replay) {
      validateCatalogSpecFinalState(replay);
      return this.repository.updateSpecDefinition(replay);
    }
    await this.requireWritableCategory(actor.tenantId, categoryId);
    const current = await this.requireWritableSpec(
      actor.tenantId,
      categoryId,
      definitionId,
    );
    const command = {
      spec_definition_id: definitionId,
      category_id: categoryId,
      code: input.code ?? current.code,
      name: input.name ?? current.name,
      value_type: input.value_type ?? current.value_type,
      enum_options: input.enum_options ?? current.enum_options,
      unit_dimension: input.unit_dimension === undefined
        ? current.unit_dimension
        : input.unit_dimension,
      is_required: input.is_required ?? current.is_required,
      participates_in_sku_name: input.participates_in_sku_name ??
        current.participates_in_sku_name,
      is_filterable: input.is_filterable ?? current.is_filterable,
      sort_order: input.sort_order ?? current.sort_order,
      status: input.status ?? current.status,
      expected_version: input.expected_version,
      tenant_id: actor.tenantId,
      ...actorCommandContext(actor, idempotencyKey),
    };
    validateCatalogSpecFinalState(command);
    return this.repository.updateSpecDefinition(command);
  }

  async copyPlatformSpecDefinitions(
    auth: AuthContext,
    categoryId: string,
    input: CopyPlatformSpecDefinitionsInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireWrite(auth);
    await this.requireWritableCategory(actor.tenantId, categoryId);
    return this.repository.copyPlatformSpecDefinitions({
      tenant_category_id: categoryId,
      platform_category_id: input.platform_category_id,
      expected_version: input.expected_version,
      ...tenantCommandContext(actor, idempotencyKey),
    });
  }

  async listUnitSuggestions(
    auth: AuthContext,
    query: CatalogUnitSuggestionListQuery,
  ) {
    const actor = await this.requireReadActor(auth);
    return this.repository.listUnitSuggestions({
      ...query,
      tenant_id: actor.tenantId,
      actor_user_id: actor.authUserId,
      actor_employee_id: actor.employeeId,
    });
  }

  async submitUnitSuggestion(
    auth: AuthContext,
    input: CatalogUnitSuggestionCreateInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireWrite(auth);
    return this.repository.submitUnitSuggestion({
      ...input,
      suggestion_id: this.commandIdFactory(
        "tenant.catalog.unit-suggestion.submit",
        actor.authUserId,
        idempotencyKey,
      ),
      ...tenantCommandContext(actor, idempotencyKey),
    });
  }

  private async requireRead(auth: AuthContext) {
    const tenantId = this.accessPolicy.assertTenantContext(auth);
    this.accessPolicy.assertPermission(auth, "supplier.catalog.manage");
    await this.assertRollout(tenantId, false);
    return tenantId;
  }

  private async requireReadActor(auth: AuthContext) {
    const tenantId = await this.requireRead(auth);
    return requireActor(auth, tenantId);
  }

  private async requireWrite(auth: AuthContext) {
    const tenantId = this.accessPolicy.assertTenantContext(auth);
    this.accessPolicy.assertPermission(auth, "supplier.catalog.manage");
    const actor = requireActor(auth, tenantId);
    await this.assertRollout(tenantId, true);
    return actor;
  }

  private async assertRollout(tenantId: string, write: boolean) {
    const settings = await this.settingsRepository.getSettings(tenantId);
    if (!settings?.module_enabled) {
      throw Errors.business(
        403,
        "当前租户尚未启用供应商模块",
        "SUPPLIER_MODULE_DISABLED",
      );
    }
    const effective = effectiveSupplierRolloutSettings(settings);
    if (!effective.ownership_reads_enabled) {
      throw Errors.business(
        403,
        "当前租户尚未开放供应商所有权读取",
        "SUPPLIER_OWNERSHIP_READS_DISABLED",
      );
    }
    if (write && !effective.private_catalog_writes_enabled) {
      throw Errors.business(
        403,
        "当前租户尚未开放私有目录维护",
        "PRIVATE_CATALOG_WRITES_DISABLED",
      );
    }
  }

  private async requireWritableCategory(tenantId: string, id: string) {
    const category = await this.repository.findVisibleCategory(
      id,
      { kind: "tenant", tenantId },
    );
    return requireTenantOwned(category, tenantId, "目录分类");
  }

  private async requireWritableBrand(tenantId: string, id: string) {
    const brand = await this.repository.findVisibleBrand(
      id,
      { kind: "tenant", tenantId },
    );
    return requireTenantOwned(brand, tenantId, "目录品牌");
  }

  private async requireWritableSpec(
    tenantId: string,
    categoryId: string,
    definitionId: string,
  ) {
    const definition = await this.repository.findVisibleSpecDefinition(
      categoryId,
      definitionId,
      { kind: "tenant", tenantId },
    );
    return requireTenantOwned(definition, tenantId, "规格定义");
  }
}

function requireActor(auth: AuthContext, tenantId: string): CatalogActor {
  if (!auth.authUserId || !auth.employeeId) throw Errors.forbidden();
  return {
    tenantId,
    authUserId: auth.authUserId,
    employeeId: auth.employeeId,
  };
}

function requireTenantOwned<Output extends {
  ownership_scope: "platform" | "tenant";
  owner_tenant_id: string | null;
}>(resource: Output | null, tenantId: string, label: string): Output {
  if (!resource) {
    throw Errors.business(404, `${label}不存在`, "SUPPLIER_CATALOG_NOT_FOUND");
  }
  if (resource.ownership_scope === "platform") {
    throw Errors.business(
      403,
      `平台共享${label}只读`,
      "SHARED_RESOURCE_READ_ONLY",
    );
  }
  if (resource.owner_tenant_id !== tenantId) {
    throw Errors.business(404, `${label}不存在`, "SUPPLIER_CATALOG_NOT_FOUND");
  }
  return resource;
}

function activeOnly<T extends { status?: "active" | "inactive" }>(input: T) {
  const { status: _status, ...query } = input;
  return { ...query, status: "active" as const };
}

function tenantOwnedStatus<T extends { status?: "active" | "inactive" }>(
  input: T,
) {
  return { ...input, status: input.status ?? "active" as const };
}

function generatedTenantCategoryCode(categoryId: string) {
  return `TC-${categoryId.replaceAll("-", "").toUpperCase()}`;
}

function generatedTenantBrandCode(brandId: string) {
  return `TB-${brandId.replaceAll("-", "").toUpperCase()}`;
}

function actorCommandContext(actor: CatalogActor, idempotencyKey: string) {
  return {
    actor_user_id: actor.authUserId,
    actor_employee_id: actor.employeeId,
    idempotency_key: idempotencyKey,
  };
}

function tenantCommandContext(actor: CatalogActor, idempotencyKey: string) {
  return {
    tenant_id: actor.tenantId,
    ...actorCommandContext(actor, idempotencyKey),
  };
}
