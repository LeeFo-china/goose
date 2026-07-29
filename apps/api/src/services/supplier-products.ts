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
  SupplierSkuUpdateInput,
} from "@/schema/supplier-products";
import type { AuthContext } from "@/services/authorization";
import {
  supplierProductAccessService,
  type SupplierProxyScope,
} from "@/services/supplier-product-access";

type ProductAccessPort = Pick<
  typeof supplierProductAccessService,
  "requireProductRead" | "requireProductWrite"
>;
type ProductRepositoryPort = Pick<
  typeof supplierProductsRepository,
  | "listProducts"
  | "findProduct"
  | "listSkus"
  | "createProduct"
  | "updateProduct"
  | "createSku"
  | "updateSku"
  | "mutateProduct"
  | "mutateSku"
>;

export type SupplierProductsServiceDependencies = {
  access?: ProductAccessPort;
  repository?: ProductRepositoryPort;
};

export class SupplierProductsService {
  private readonly access: ProductAccessPort;
  private readonly repository: ProductRepositoryPort;

  constructor(dependencies: SupplierProductsServiceDependencies = {}) {
    this.access = dependencies.access ?? supplierProductAccessService;
    this.repository = dependencies.repository ?? supplierProductsRepository;
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
    return requireCommand(await this.repository.createProduct({
      ...input,
      product_id: productId,
      ...commandContext(scope, input.proxy_reason, idempotencyKey),
    }));
  }

  async updateProduct(
    auth: AuthContext,
    tenantSupplierId: string,
    productId: string,
    input: SupplierProductUpdateInput,
  ) {
    const scope = await this.access.requireProductWrite(
      auth,
      tenantSupplierId,
    );
    const {
      expected_version,
      proxy_reason,
      ...fields
    } = input;
    return this.repository.updateProduct({
      ...fields,
      supplier_id: scope.supplierId,
      product_id: productId,
      expected_version,
      ...updateAudit(scope, proxy_reason),
    });
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
      ...commandContext(scope, input.proxy_reason, idempotencyKey),
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
    return requireCommand(await this.repository.createSku({
      ...input,
      sku_id: skuId,
      product_id: productId,
      ...commandContext(scope, input.proxy_reason, idempotencyKey),
    }));
  }

  async updateSku(
    auth: AuthContext,
    tenantSupplierId: string,
    productId: string,
    skuId: string,
    input: SupplierSkuUpdateInput,
  ) {
    const scope = await this.access.requireProductWrite(
      auth,
      tenantSupplierId,
    );
    const {
      expected_version,
      proxy_reason,
      ...fields
    } = input;
    return this.repository.updateSku({
      ...fields,
      supplier_id: scope.supplierId,
      supplier_product_id: productId,
      sku_id: skuId,
      expected_version,
      ...updateAudit(scope, proxy_reason),
    });
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
      ...commandContext(scope, input.proxy_reason, idempotencyKey),
    }));
  }
}

function commandContext(
  scope: SupplierProxyScope,
  proxyReason: string,
  idempotencyKey: string,
) {
  return {
    supplier_id: scope.supplierId,
    tenant_id: scope.tenantId,
    actor_user_id: scope.authUserId,
    actor_employee_id: scope.employeeId,
    idempotency_key: idempotencyKey,
    proxy_reason: proxyReason,
  };
}

function updateAudit(scope: SupplierProxyScope, proxyReason: string) {
  return {
    acting_tenant_id: scope.tenantId,
    acting_employee_id: scope.employeeId,
    operation_source: "tenant_proxy",
    proxy_reason: proxyReason,
    updated_by_employee_id: scope.employeeId,
    updated_at: new Date().toISOString(),
  };
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
  if (code.includes("VERSION_CONFLICT")) return "供应商商品版本已变化";
  return "供应商商品当前状态不允许该操作";
}

export const supplierProductsService = new SupplierProductsService();
