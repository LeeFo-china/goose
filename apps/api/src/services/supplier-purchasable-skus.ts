import { Errors } from "@/errors/error-factory";
import {
  supplierProductsRepository,
} from "@/repositories/supplier-products";
import {
  supplierPurchasableSkusRepository,
  type SupplierPurchasableSkuIdentityInput,
  type SupplierPurchasableSkusRepository,
} from "@/repositories/supplier-purchasable-skus";
import type { AuthContext } from "@/services/authorization";
import {
  supplierProductAccessService,
  type SupplierProxyScope,
} from "@/services/supplier-product-access";

type ProductAccessPort = Pick<
  typeof supplierProductAccessService,
  "requirePurchasableSkuPriceRead"
>;
type PriceRepositoryPort = Pick<
  SupplierPurchasableSkusRepository,
  "findTenantSkuIdentity" | "getCurrentPrice" | "getPriceDefaults"
>;
type ProductIdentity = {
  id: string;
  supplier_id: string;
  ownership_scope: "platform" | "tenant";
  owner_tenant_id: string | null;
};
type SupplierProductsRepositoryPort = {
  findProduct(
    supplierId: string,
    productId: string,
    tenantId: string,
    includeSkuCounts: boolean,
  ): Promise<ProductIdentity | null>;
};

export type SupplierPurchasableSkusServiceDependencies = {
  access?: ProductAccessPort;
  repository?: PriceRepositoryPort;
  supplierProductsRepository?: SupplierProductsRepositoryPort;
};

export class SupplierPurchasableSkusService {
  private readonly access: ProductAccessPort;
  private readonly repository: PriceRepositoryPort;
  private readonly supplierProductsRepository: SupplierProductsRepositoryPort;

  constructor(
    dependencies: SupplierPurchasableSkusServiceDependencies = {},
  ) {
    this.access = dependencies.access ?? supplierProductAccessService;
    this.repository = dependencies.repository ??
      supplierPurchasableSkusRepository;
    this.supplierProductsRepository = dependencies.supplierProductsRepository ??
      supplierProductsRepository;
  }

  async getPriceDefaults(
    auth: AuthContext,
    tenantSupplierId: string,
    productId: string,
  ) {
    const resolved = await this.resolveProductScope(
      auth,
      tenantSupplierId,
      productId,
    );
    return this.repository.getPriceDefaults(scopeInput(resolved));
  }

  async getCurrentPrice(
    auth: AuthContext,
    tenantSupplierId: string,
    productId: string,
    skuId: string,
  ) {
    const resolved = await this.resolveProductScope(
      auth,
      tenantSupplierId,
      productId,
    );
    const input = {
      ...scopeInput(resolved),
      sku_id: canonicalUuid(skuId),
    };
    const sku = await this.repository.findTenantSkuIdentity(input);
    assertTenantSku(sku, input);
    return this.repository.getCurrentPrice(input);
  }

  private async resolveProductScope(
    auth: AuthContext,
    tenantSupplierId: string,
    productId: string,
  ): Promise<{ scope: SupplierProxyScope; productId: string }> {
    const canonicalTenantSupplierId = canonicalUuid(tenantSupplierId);
    const scope = canonicalizeScope(
      await this.access.requirePurchasableSkuPriceRead(
        auth,
        canonicalTenantSupplierId,
      ),
    );
    if (scope.tenantSupplierId !== canonicalTenantSupplierId) {
      throw Errors.business(
        404,
        "租户供应商合作关系不存在",
        "TENANT_SUPPLIER_NOT_FOUND",
      );
    }

    const canonicalProductId = canonicalUuid(productId);
    const product = await this.supplierProductsRepository.findProduct(
      scope.supplierId,
      canonicalProductId,
      scope.tenantId,
      false,
    );
    assertTenantProduct(product, scope, canonicalProductId);
    return { scope, productId: canonicalProductId };
  }
}

function scopeInput(resolved: {
  scope: SupplierProxyScope;
  productId: string;
}) {
  return {
    tenant_id: resolved.scope.tenantId,
    tenant_supplier_id: resolved.scope.tenantSupplierId,
    supplier_id: resolved.scope.supplierId,
    supplier_product_id: resolved.productId,
  };
}

function assertTenantProduct(
  product: ProductIdentity | null,
  scope: SupplierProxyScope,
  productId: string,
): asserts product is ProductIdentity {
  if (
    !product ||
    canonicalUuid(product.id) !== productId ||
    canonicalUuid(product.supplier_id) !== scope.supplierId ||
    (product.owner_tenant_id !== null &&
      canonicalUuid(product.owner_tenant_id) !== scope.tenantId)
  ) {
    throw productNotFound();
  }
  if (product.ownership_scope !== "tenant") {
    throw sharedResourceReadOnly();
  }
  if (
    product.owner_tenant_id === null ||
    canonicalUuid(product.owner_tenant_id) !== scope.tenantId
  ) {
    throw productNotFound();
  }
}

function assertTenantSku(
  sku: Awaited<ReturnType<PriceRepositoryPort["findTenantSkuIdentity"]>>,
  input: SupplierPurchasableSkuIdentityInput,
): void {
  if (
    !sku ||
    canonicalUuid(sku.id) !== input.sku_id ||
    canonicalUuid(sku.supplier_id) !== input.supplier_id ||
    canonicalUuid(sku.supplier_product_id) !== input.supplier_product_id ||
    (sku.owner_tenant_id !== null &&
      canonicalUuid(sku.owner_tenant_id) !== input.tenant_id)
  ) {
    throw skuNotFound();
  }
  if (sku.ownership_scope !== "tenant") throw sharedResourceReadOnly();
  if (
    sku.owner_tenant_id === null ||
    canonicalUuid(sku.owner_tenant_id) !== input.tenant_id
  ) {
    throw skuNotFound();
  }
}

function canonicalizeScope(scope: SupplierProxyScope): SupplierProxyScope {
  return {
    tenantId: canonicalUuid(scope.tenantId),
    tenantSupplierId: canonicalUuid(scope.tenantSupplierId),
    supplierId: canonicalUuid(scope.supplierId),
    authUserId: canonicalUuid(scope.authUserId),
    employeeId: canonicalUuid(scope.employeeId),
  };
}

function canonicalUuid(value: string): string {
  return value.toLowerCase();
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

function sharedResourceReadOnly() {
  return Errors.business(409, "平台共享商品只读", "SHARED_RESOURCE_READ_ONLY");
}

export const supplierPurchasableSkusService =
  new SupplierPurchasableSkusService();
