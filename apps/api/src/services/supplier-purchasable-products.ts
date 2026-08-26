import { Errors } from "@/errors/error-factory";
import {
  supplierPurchasableProductsRepository,
  type SupplierPurchasableProductsRepository,
} from "@/repositories/supplier-purchasable-products";
import { mapSupplierPurchasableProductEnvelopeError } from "@/repositories/supplier-command-errors";
import type { SupplierPurchasableProductCreateInput } from "@/schema/supplier-purchasable-products";
import type { AuthContext } from "@/services/authorization";
import {
  supplierProductAccessService,
  type SupplierProxyScope,
} from "@/services/supplier-product-access";
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
  idFactory?: () => string;
};

export class SupplierPurchasableProductsService {
  private readonly access: ProductAccessPort;
  private readonly repository: ProductRepositoryPort;
  private readonly idFactory: () => string;

  constructor(
    dependencies: SupplierPurchasableProductsServiceDependencies = {},
  ) {
    this.access = dependencies.access ?? supplierProductAccessService;
    this.repository = dependencies.repository ??
      supplierPurchasableProductsRepository;
    this.idFactory = dependencies.idFactory ?? (() => crypto.randomUUID());
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

    const productId = createProductId(this.idFactory);
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
        product_code: generatedCode("TP", productId),
      },
      sku: {
        ...input.sku,
        purchase_unit_id: canonicalUuid(input.sku.purchase_unit_id),
        sku_code: generatedCode("TS", skuId),
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

function createProductId(idFactory: () => string): string {
  let generatedId: string;
  try {
    generatedId = idFactory();
  } catch {
    throw productCreateFailed();
  }
  const parsed = ProductIdSchema.safeParse(generatedId);
  if (!parsed.success) throw productCreateFailed();
  return canonicalUuid(parsed.data);
}

function productCreateFailed() {
  return Errors.business(
    500,
    "创建可采购商品失败",
    "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
  );
}

function generatedCode(prefix: "TP" | "TS", id: string): string {
  return `${prefix}-${id.replaceAll("-", "").slice(0, 16)}`;
}

export const supplierPurchasableProductsService =
  new SupplierPurchasableProductsService();
