import { Errors } from "@/errors/error-factory";
import {
  supplierCatalogRepository,
  type SupplierCatalogRepositoryPort,
} from "@/repositories/supplier-catalog";
import type {
  CatalogBrandCreateInput,
  CatalogBrandListQuery,
  CatalogBrandUpdateInput,
  CatalogCategoryCreateInput,
  CatalogCategoryListQuery,
  CatalogCategoryUpdateInput,
  CatalogUnitCreateInput,
  CatalogUnitListQuery,
  CatalogUnitUpdateInput,
} from "@/schema/supplier-catalog";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

const PLATFORM_PERMISSION = "platform.catalog.manage";
const TENANT_PERMISSION = "supplier.view";
const CATALOG_CONFLICT_MESSAGES = [
  "只能移动叶子目录分类",
  "目录分类不能将自身设为父分类",
  "目录分类层级不能形成环",
  "父目录分类不存在",
  "目录分类层级不能超过 6 级",
  "存在启用的子分类，当前目录分类不能停用",
  "启用的目录分类必须属于启用的父分类",
  "目录单位不能将自身设为基准单位",
  "已有派生单位引用的基准单位不能改为派生单位",
  "基准单位不存在",
  "派生单位只能引用基准单位",
  "派生单位只能引用启用的基准单位",
  "有派生单位引用的基准单位不能停用",
] as const;

type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertPermission" | "assertTenantContext"
>;

export type SupplierCatalogServiceDependencies = {
  repository?: SupplierCatalogRepositoryPort;
  accessPolicy?: AccessPolicyPort;
  idFactory?: () => string;
};

export class SupplierCatalogService {
  private readonly repository: SupplierCatalogRepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly idFactory: () => string;

  constructor(dependencies: SupplierCatalogServiceDependencies = {}) {
    this.repository = dependencies.repository ?? supplierCatalogRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.idFactory = dependencies.idFactory ?? (() => crypto.randomUUID());
  }

  listPlatformCategories(
    authContext: AuthContext,
    query: CatalogCategoryListQuery,
  ) {
    this.requirePlatform(authContext);
    return this.repository.listCategories(query);
  }

  listTenantCategories(
    authContext: AuthContext,
    query: CatalogCategoryListQuery,
  ) {
    this.requireTenant(authContext);
    return this.repository.listCategories(activeOnly(query));
  }

  listPlatformBrands(
    authContext: AuthContext,
    query: CatalogBrandListQuery,
  ) {
    this.requirePlatform(authContext);
    return this.repository.listBrands(query);
  }

  listTenantBrands(
    authContext: AuthContext,
    query: CatalogBrandListQuery,
  ) {
    this.requireTenant(authContext);
    return this.repository.listBrands(activeOnly(query));
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
    this.requireTenant(authContext);
    return this.repository.listUnits(activeOnly(query));
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
        category_id: this.idFactory(),
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
        brand_id: this.idFactory(),
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
        unit_id: this.idFactory(),
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

  private requirePlatform(authContext: AuthContext): void {
    if (!authContext.isPlatformAdmin) throw Errors.forbidden();
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

  private requireTenant(authContext: AuthContext): void {
    this.accessPolicy.assertTenantContext(authContext);
    this.accessPolicy.assertPermission(authContext, TENANT_PERMISSION);
  }

  private async mapCatalogConflict<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!isCatalogConflict(error)) throw error;
      throw Errors.business(
        409,
        "标准目录编码、层级或启停状态冲突",
        "SUPPLIER_CATALOG_CONFLICT",
      );
    }
  }
}

function activeOnly<T extends { status?: "active" | "inactive" }>(
  input: T,
): Omit<T, "status"> & { status: "active" } {
  const { status: _status, ...query } = input;
  return { ...query, status: "active" };
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

function isCatalogConflict(error: unknown): boolean {
  if (typeof error === "string") {
    return error === "23505" ||
      CATALOG_CONFLICT_MESSAGES.some((message) => error.includes(message));
  }
  if (Array.isArray(error)) {
    return error.some((value) => isCatalogConflict(value));
  }
  if (typeof error !== "object" || error === null) return false;
  return Object.entries(error).some(([key, value]) =>
    (key === "code" && value === "23505") || isCatalogConflict(value)
  );
}

export const supplierCatalogService = new SupplierCatalogService();
