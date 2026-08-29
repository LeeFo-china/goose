import { Errors } from "@/errors/error-factory";
import {
  supplierPurchasableProductsRepository,
  type SupplierPurchasableProductsRepository,
} from "@/repositories/supplier-purchasable-products";
import { mapSupplierPurchasableProductEnvelopeError } from "@/repositories/supplier-command-errors";
import type { SupplierPurchasableProductCreateInput } from "@/schema/supplier-purchasable-products";
import type { AuthContext } from "@/services/authorization";
import { generateSupplierSkuCode } from "@/services/supplier-sku-codes";
import {
  supplierProductAccessService,
  type SupplierProxyScope,
} from "@/services/supplier-product-access";
import { createHash } from "node:crypto";
import { z } from "zod";

const ProductIdSchema = z.uuid();

type ProductAccessPort = Pick<
  typeof supplierProductAccessService,
  "requirePurchasableProductWrite"
>;
type ProductRepositoryPort = Pick<
  SupplierPurchasableProductsRepository,
  "create"
>;

export type SupplierPurchasableProductsServiceDependencies = {
  access?: ProductAccessPort;
  repository?: ProductRepositoryPort;
  idFactory?: (seed: string) => string;
};

export class SupplierPurchasableProductsService {
  private readonly access: ProductAccessPort;
  private readonly repository: ProductRepositoryPort;
  private readonly idFactory: (seed: string) => string;

  constructor(
    dependencies: SupplierPurchasableProductsServiceDependencies = {},
  ) {
    this.access = dependencies.access ?? supplierProductAccessService;
    this.repository = dependencies.repository ??
      supplierPurchasableProductsRepository;
    this.idFactory = dependencies.idFactory ?? deterministicProductId;
  }

  async create(
    auth: AuthContext,
    tenantSupplierId: string,
    supplierId: string,
    input: SupplierPurchasableProductCreateInput,
    idempotencyKey: string,
  ) {
    const canonicalTenantSupplierId = canonicalUuid(tenantSupplierId);
    const canonicalSupplierId = canonicalUuid(supplierId);
    const scope = await this.access.requirePurchasableProductWrite(
      auth,
      canonicalTenantSupplierId,
    );
    const canonicalScope = canonicalizeScope(scope);
    assertPathScope(
      canonicalScope,
      canonicalTenantSupplierId,
      canonicalSupplierId,
    );

    const productId = createProductId(
      this.idFactory,
      JSON.stringify([
        canonicalScope.tenantId,
        canonicalScope.authUserId,
        idempotencyKey,
      ]),
    );
    const skuId = canonicalUuid(input.sku_id);
    const result = await this.repository.create({
      product_id: productId,
      sku_id: skuId,
      tenant_id: canonicalScope.tenantId,
      tenant_supplier_id: canonicalScope.tenantSupplierId,
      supplier_id: canonicalScope.supplierId,
      product: {
        ...input.product,
        category_id: canonicalUuid(input.product.category_id),
        brand_id: canonicalUuid(input.product.brand_id),
        product_code: generatedProductCode(productId),
      },
      sku: {
        ...input.sku,
        purchase_unit_id: canonicalUuid(input.sku.purchase_unit_id),
        sku_code: generateSupplierSkuCode("tenant", skuId),
      },
      price: {
        unit_price: input.price.unit_price,
        tax_rate: input.price.tax_rate,
        tax_inclusive: input.price.tax_inclusive,
      },
      actor_user_id: canonicalScope.authUserId,
      actor_employee_id: canonicalScope.employeeId,
      idempotency_key: idempotencyKey,
    });

    if (result.status === "created") return result;
    throw mapSupplierPurchasableProductEnvelopeError(
      result.status,
      result.error_code,
      result.reason,
    ) ?? Errors.business(
      500,
      "创建可采购商品失败",
      "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
    );
  }
}

function assertPathScope(
  scope: SupplierProxyScope,
  tenantSupplierId: string,
  supplierId: string,
): void {
  if (scope.tenantSupplierId !== tenantSupplierId) {
    throw Errors.business(
      404,
      "租户供应商合作关系不存在",
      "TENANT_SUPPLIER_NOT_FOUND",
    );
  }
  if (scope.supplierId !== supplierId) {
    throw Errors.business(404, "供应商不存在", "SUPPLIER_NOT_FOUND");
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

function createProductId(
  idFactory: (seed: string) => string,
  seed: string,
): string {
  let generatedId: string;
  try {
    generatedId = idFactory(seed);
  } catch {
    throw productCreateFailed();
  }
  const parsed = ProductIdSchema.safeParse(generatedId);
  if (!parsed.success) throw productCreateFailed();
  return canonicalUuid(parsed.data);
}

function deterministicProductId(seed: string): string {
  const hash = createHash("sha256").update(seed, "utf8").digest("hex");
  const variant = ((Number.parseInt(hash[16]!, 16) & 0b0011) | 0b1000)
    .toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function productCreateFailed() {
  return Errors.business(
    500,
    "创建可采购商品失败",
    "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
  );
}

function generatedProductCode(id: string): string {
  return `TP-${id.replaceAll("-", "").slice(0, 16)}`;
}

export const supplierPurchasableProductsService =
  new SupplierPurchasableProductsService();
