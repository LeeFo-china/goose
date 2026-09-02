import { Errors } from "@/errors/error-factory";
import {
  supplierProductsRepository,
  type SupplierProductCommandResult,
} from "@/repositories/supplier-products";
import type {
  SupplierProductCommandInput,
  SupplierProductCreateInput,
  SupplierProductListQuery,
  SupplierProductUpdateInput,
  SupplierSkuCreateInput,
  SupplierSkuListQuery,
  SupplierSkuUnitConversionsReplaceInput,
  SupplierSkuUpdateInput,
} from "@/schema/supplier-products";
import type { AuthContext } from "@/services/authorization";
import { supplierCatalogRepository } from "@/repositories/supplier-catalog";
import {
  supplierProductAccessService,
  type SupplierProxyScope,
} from "@/services/supplier-product-access";
import {
  type SpecTemplateRepositoryPort,
  validateSkuSpecsAgainstCurrentTemplate,
} from "@/services/supplier-product-spec-template";
import { generateSupplierSkuCode } from "@/services/supplier-sku-codes";

type ProductAccessPort = Pick<
  typeof supplierProductAccessService,
  "requireProductRead" | "requireProductWrite"
>;
type ProductRepositoryPort = Pick<
  typeof supplierProductsRepository,
  | "listProducts"
  | "findProduct"
  | "listSkus"
  | "listSkuUnitConversions"
  | "createProduct"
  | "updateProduct"
  | "createSku"
  | "updateSku"
  | "mutateProduct"
  | "mutateSku"
  | "replaceSkuUnitConversions"
>;

export type SupplierProductsServiceDependencies = {
  access?: ProductAccessPort;
  repository?: ProductRepositoryPort;
  catalogRepository?: SpecTemplateRepositoryPort;
};

export class SupplierProductsService {
  private readonly access: ProductAccessPort;
  private readonly repository: ProductRepositoryPort;
  private readonly catalogRepository: SpecTemplateRepositoryPort;

  constructor(dependencies: SupplierProductsServiceDependencies = {}) {
    this.access = dependencies.access ?? supplierProductAccessService;
    this.repository = dependencies.repository ?? supplierProductsRepository;
    this.catalogRepository = dependencies.catalogRepository ??
      supplierCatalogRepository;
  }

  async listProducts(auth: AuthContext, query: SupplierProductListQuery) {
    const scope = await this.access.requireProductRead(
      auth,
      query.tenantSupplierId,
    );
    const { tenantSupplierId: _relationship, ...filters } = query;
    return this.repository.listProducts({
      ...filters,
      supplier_id: scope.supplierId,
      tenant_id: scope.tenantId,
    });
  }

  async getProduct(
    auth: AuthContext,
    tenantSupplierId: string,
    productId: string,
  ) {
    const scope = await this.access.requireProductRead(auth, tenantSupplierId);
    const product = await this.repository.findProduct(
      scope.supplierId,
      productId,
      scope.tenantId,
    );
    if (!product) {
      throw Errors.business(
        404,
        "供应商商品不存在",
        "SUPPLIER_PRODUCT_NOT_FOUND",
      );
    }
    return product;
  }

  async createProduct(
    auth: AuthContext,
    tenantSupplierId: string,
    productId: string,
    input: SupplierProductCreateInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireProductWrite(
      auth,
      tenantSupplierId,
    );
    const { proxy_reason: _legacyProxyReason, ...safeInput } = input as
      SupplierProductCreateInput & { proxy_reason?: unknown };
    const productCode = safeInput.product_code?.trim() ||
      generatedTenantProductCode(productId);
    return requireCommand(await this.repository.createProduct({
      ...safeInput,
      product_code: productCode,
      product_id: productId,
      ...commandContext(scope, idempotencyKey),
    }));
  }

  async updateProduct(
    auth: AuthContext,
    tenantSupplierId: string,
    productId: string,
    input: SupplierProductUpdateInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireProductWrite(
      auth,
      tenantSupplierId,
    );
    const { expected_version, ...fields } = input;
    return requireCommand(await this.repository.updateProduct({
      ...fields,
      supplier_id: scope.supplierId,
      tenant_id: scope.tenantId,
      tenant_supplier_id: scope.tenantSupplierId,
      product_id: productId,
      expected_version,
      ...actorContext(scope, idempotencyKey),
    }));
  }

  async mutateProduct(
    auth: AuthContext,
    tenantSupplierId: string,
    productId: string,
    action: "activate" | "deactivate",
    input: SupplierProductCommandInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireProductWrite(
      auth,
      tenantSupplierId,
    );
    return requireCommand(await this.repository.mutateProduct({
      product_id: productId,
      action,
      expected_version: input.expected_version,
      ...commandContext(scope, idempotencyKey),
    }));
  }

  async listSkus(
    auth: AuthContext,
    tenantSupplierId: string,
    productId: string,
    query: SupplierSkuListQuery,
  ) {
    const scope = await this.access.requireProductRead(auth, tenantSupplierId);
    return this.repository.listSkus({
      ...query,
      supplier_id: scope.supplierId,
      tenant_id: scope.tenantId,
      tenant_supplier_id: scope.tenantSupplierId,
      supplier_product_id: productId,
    });
  }

  async createSku(
    auth: AuthContext,
    tenantSupplierId: string,
    productId: string,
    skuId: string,
    input: SupplierSkuCreateInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireProductWrite(
      auth,
      tenantSupplierId,
    );
    const product = await this.requireTenantProduct(scope, productId);
    const { proxy_reason: _legacyProxyReason, ...safeInput } = input as
      SupplierSkuCreateInput & { proxy_reason?: unknown };
    await validateSkuSpecsAgainstCurrentTemplate(
      product.category.id,
      safeInput.spec_values,
      { kind: "tenant", tenantId: scope.tenantId },
      this.catalogRepository,
    );
    return requireCommand(await this.repository.createSku({
      ...safeInput,
      sku_code: generateSupplierSkuCode("tenant", skuId),
      sku_id: skuId,
      product_id: productId,
      ...commandContext(scope, idempotencyKey),
    }));
  }

  async updateSku(
    auth: AuthContext,
    tenantSupplierId: string,
    productId: string,
    skuId: string,
    input: SupplierSkuUpdateInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireProductWrite(
      auth,
      tenantSupplierId,
    );
    const product = await this.requireTenantProduct(scope, productId);
    if (input.spec_values) {
      await validateSkuSpecsAgainstCurrentTemplate(
        product.category.id,
        input.spec_values,
        { kind: "tenant", tenantId: scope.tenantId },
        this.catalogRepository,
      );
    }
    const { expected_version, sku_code: _legacySkuCode, ...fields } = input;
    return requireCommand(await this.repository.updateSku({
      ...fields,
      supplier_id: scope.supplierId,
      tenant_id: scope.tenantId,
      tenant_supplier_id: scope.tenantSupplierId,
      supplier_product_id: productId,
      sku_id: skuId,
      expected_version,
      ...actorContext(scope, idempotencyKey),
    }));
  }

  async mutateSku(
    auth: AuthContext,
    tenantSupplierId: string,
    productId: string,
    skuId: string,
    action: "activate" | "deactivate",
    input: SupplierProductCommandInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireProductWrite(
      auth,
      tenantSupplierId,
    );
    return requireCommand(await this.repository.mutateSku({
      product_id: productId,
      sku_id: skuId,
      action,
      expected_version: input.expected_version,
      ...commandContext(scope, idempotencyKey),
    }));
  }

  async replaceSkuUnitConversions(
    auth: AuthContext,
    tenantSupplierId: string,
    productId: string,
    skuId: string,
    input: SupplierSkuUnitConversionsReplaceInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireProductWrite(
      auth,
      tenantSupplierId,
    );
    return requireCommand(await this.repository.replaceSkuUnitConversions({
      ownership_scope: "tenant",
      tenant_id: scope.tenantId,
      tenant_supplier_id: scope.tenantSupplierId,
      supplier_id: scope.supplierId,
      product_id: productId,
      sku_id: skuId,
      expected_version: input.expected_version,
      purchase_unit_id: input.purchase_unit_id,
      base_unit_id: input.base_unit_id,
      conversions: input.conversions,
      ...actorContext(scope, idempotencyKey),
    }));
  }

  async listSkuUnitConversions(
    auth: AuthContext,
    tenantSupplierId: string,
    productId: string,
    skuId: string,
  ) {
    const scope = await this.access.requireProductRead(auth, tenantSupplierId);
    const conversions = await this.repository.listSkuUnitConversions({
      supplier_id: scope.supplierId,
      supplier_product_id: productId,
      sku_id: skuId,
      tenant_id: scope.tenantId,
    });
    if (conversions === null) throw skuNotFound();
    return conversions;
  }

  private async requireTenantProduct(
    scope: SupplierProxyScope,
    productId: string,
  ) {
    const product = await this.repository.findProduct(
      scope.supplierId,
      productId,
      scope.tenantId,
      false,
    );
    if (!product) throw productNotFound();
    if (
      product.ownership_scope !== "tenant" ||
      product.owner_tenant_id !== scope.tenantId
    ) {
      throw Errors.business(
        409,
        "平台共享商品只读",
        "SHARED_RESOURCE_READ_ONLY",
      );
    }
    return product;
  }
}

function commandContext(
  scope: SupplierProxyScope,
  idempotencyKey: string,
) {
  return {
    supplier_id: scope.supplierId,
    tenant_id: scope.tenantId,
    tenant_supplier_id: scope.tenantSupplierId,
    ...actorContext(scope, idempotencyKey),
  };
}

function actorContext(scope: SupplierProxyScope, idempotencyKey: string) {
  return {
    actor_user_id: scope.authUserId,
    actor_employee_id: scope.employeeId,
    idempotency_key: idempotencyKey,
  };
}

function generatedTenantProductCode(productId: string) {
  return `TP-${productId.replaceAll("-", "").toUpperCase()}`;
}

function requireCommand(result: SupplierProductCommandResult) {
  if (!result.error_code) return result;
  const notFound = result.error_code.endsWith("_NOT_FOUND");
  const versionConflict = result.error_code.includes("VERSION_CONFLICT");
  throw Errors.business(
    notFound ? 404 : versionConflict ? 409 : 409,
    commandErrorMessage(result.error_code),
    result.error_code,
    {
      version: result.version,
      current_status: result.current_status,
      reason: result.reason,
    },
  );
}

function commandErrorMessage(code: string) {
  if (code === "SUPPLIER_PRODUCT_NOT_FOUND") return "供应商商品不存在";
  if (code === "SUPPLIER_SKU_NOT_FOUND") return "供应商 SKU 不存在";
  if (code === "SUPPLIER_SKU_VERSION_CONFLICT") {
    return "供应商 SKU 版本已变化";
  }
  if (code.includes("VERSION_CONFLICT")) return "供应商商品版本已变化";
  return "供应商商品当前状态不允许该操作";
}

function productNotFound() {
  return Errors.business(
    404,
    "供应商商品不存在",
    "SUPPLIER_PRODUCT_NOT_FOUND",
  );
}

function skuNotFound() {
  return Errors.business(404, "供应商 SKU 不存在", "SUPPLIER_SKU_NOT_FOUND");
}

export const supplierProductsService = new SupplierProductsService();
