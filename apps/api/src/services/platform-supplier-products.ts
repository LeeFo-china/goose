import { Errors } from "@/errors/error-factory";
import {
  supplierProductsRepository,
  type SupplierProductCommandResult,
} from "@/repositories/supplier-products";
import type {
  PlatformSupplierProductCreateInput,
  PlatformSupplierProductListQuery,
  PlatformSupplierSkuCreateInput,
  SupplierProductCommandInput,
  SupplierProductUpdateInput,
  SupplierSkuListQuery,
  SupplierSkuUnitConversionsReplaceInput,
  SupplierSkuUpdateInput,
} from "@/schema/supplier-products";
import type { AuthContext } from "@/services/authorization";
import { platformAuthorizationService } from "@/services/platform-authorization";
import { supplierCatalogRepository } from "@/repositories/supplier-catalog";
import {
  type SpecTemplateRepositoryPort,
  validateSkuSpecsAgainstCurrentTemplate,
} from "@/services/supplier-product-spec-template";

const MANAGE_PERMISSION = "platform.supplier-product.manage" as const;

type AuthorizationPort = Pick<
  typeof platformAuthorizationService,
  "assertPlatformSession" | "assertPermission"
>;
type RepositoryPort = Pick<
  typeof supplierProductsRepository,
  | "listPlatformProducts"
  | "findPlatformProduct"
  | "listPlatformSkus"
  | "listPlatformSkuUnitConversions"
  | "createPlatformProduct"
  | "updatePlatformProduct"
  | "mutatePlatformProduct"
  | "createPlatformSku"
  | "updatePlatformSku"
  | "mutatePlatformSku"
  | "replaceSkuUnitConversions"
>;

export type PlatformSupplierProductsServiceDependencies = {
  authorization?: AuthorizationPort;
  repository?: RepositoryPort;
  catalogRepository?: SpecTemplateRepositoryPort;
};

export class PlatformSupplierProductsService {
  private readonly authorization: AuthorizationPort;
  private readonly repository: RepositoryPort;
  private readonly catalogRepository: SpecTemplateRepositoryPort;

  constructor(dependencies: PlatformSupplierProductsServiceDependencies = {}) {
    this.authorization = dependencies.authorization ?? platformAuthorizationService;
    this.repository = dependencies.repository ?? supplierProductsRepository;
    this.catalogRepository = dependencies.catalogRepository ??
      supplierCatalogRepository;
  }

  async listProducts(auth: AuthContext, query: PlatformSupplierProductListQuery) {
    await this.requireActor(auth);
    const { supplierId, ...filters } = query;
    return this.repository.listPlatformProducts({
      ...filters,
      supplier_id: supplierId,
    });
  }

  async getProduct(
    auth: AuthContext,
    supplierId: string,
    productId: string,
  ) {
    await this.requireActor(auth);
    const product = await this.repository.findPlatformProduct(
      supplierId,
      productId,
    );
    if (!product) throw productNotFound();
    return product;
  }

  async listSkus(
    auth: AuthContext,
    supplierId: string,
    productId: string,
    query: SupplierSkuListQuery,
  ) {
    await this.requireActor(auth);
    return this.repository.listPlatformSkus({
      ...query,
      supplier_id: supplierId,
      supplier_product_id: productId,
    });
  }

  async createProduct(
    auth: AuthContext,
    supplierId: string,
    productId: string,
    input: PlatformSupplierProductCreateInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireActor(auth);
    return requireCommand(await this.repository.createPlatformProduct({
      ...input,
      product_id: productId,
      ...commandContext(actor, supplierId, idempotencyKey),
    }));
  }

  async updateProduct(
    auth: AuthContext,
    supplierId: string,
    productId: string,
    input: SupplierProductUpdateInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireActor(auth);
    return requireCommand(await this.repository.updatePlatformProduct({
      ...input,
      product_id: productId,
      ...commandContext(actor, supplierId, idempotencyKey),
    }));
  }

  async mutateProduct(
    auth: AuthContext,
    supplierId: string,
    productId: string,
    action: "activate" | "deactivate",
    input: SupplierProductCommandInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireActor(auth);
    return requireCommand(await this.repository.mutatePlatformProduct({
      product_id: productId,
      action,
      expected_version: input.expected_version,
      ...commandContext(actor, supplierId, idempotencyKey),
    }));
  }

  async createSku(
    auth: AuthContext,
    supplierId: string,
    productId: string,
    skuId: string,
    input: PlatformSupplierSkuCreateInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireActor(auth);
    const product = await this.requirePlatformProduct(supplierId, productId);
    await validateSkuSpecsAgainstCurrentTemplate(
      product.category.id,
      input.spec_values,
      { kind: "platform" },
      this.catalogRepository,
    );
    return requireCommand(await this.repository.createPlatformSku({
      ...input,
      product_id: productId,
      sku_id: skuId,
      ...commandContext(actor, supplierId, idempotencyKey),
    }));
  }

  async updateSku(
    auth: AuthContext,
    supplierId: string,
    productId: string,
    skuId: string,
    input: SupplierSkuUpdateInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireActor(auth);
    const product = await this.requirePlatformProduct(supplierId, productId);
    if (input.spec_values) {
      await validateSkuSpecsAgainstCurrentTemplate(
        product.category.id,
        input.spec_values,
        { kind: "platform" },
        this.catalogRepository,
      );
    }
    return requireCommand(await this.repository.updatePlatformSku({
      ...input,
      supplier_product_id: productId,
      sku_id: skuId,
      ...commandContext(actor, supplierId, idempotencyKey),
    }));
  }

  async mutateSku(
    auth: AuthContext,
    supplierId: string,
    productId: string,
    skuId: string,
    action: "activate" | "deactivate",
    input: SupplierProductCommandInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireActor(auth);
    return requireCommand(await this.repository.mutatePlatformSku({
      product_id: productId,
      sku_id: skuId,
      action,
      expected_version: input.expected_version,
      ...commandContext(actor, supplierId, idempotencyKey),
    }));
  }

  async replaceSkuUnitConversions(
    auth: AuthContext,
    supplierId: string,
    productId: string,
    skuId: string,
    input: SupplierSkuUnitConversionsReplaceInput,
    idempotencyKey: string,
  ) {
    const actor = await this.requireActor(auth);
    return requireCommand(await this.repository.replaceSkuUnitConversions({
      ownership_scope: "platform",
      product_id: productId,
      sku_id: skuId,
      expected_version: input.expected_version,
      purchase_unit_id: input.purchase_unit_id,
      base_unit_id: input.base_unit_id,
      conversions: input.conversions,
      ...commandContext(actor, supplierId, idempotencyKey),
    }));
  }

  async listSkuUnitConversions(
    auth: AuthContext,
    supplierId: string,
    productId: string,
    skuId: string,
  ) {
    await this.requireActor(auth);
    const conversions = await this.repository.listPlatformSkuUnitConversions({
      supplier_id: supplierId,
      supplier_product_id: productId,
      sku_id: skuId,
    });
    if (conversions === null) {
      throw Errors.business(
        404,
        "供应商 SKU 不存在",
        "SUPPLIER_SKU_NOT_FOUND",
      );
    }
    return conversions;
  }

  private async requirePlatformProduct(supplierId: string, productId: string) {
    const product = await this.repository.findPlatformProduct(
      supplierId,
      productId,
      false,
    );
    if (!product) throw productNotFound();
    return product;
  }

  private async requireActor(auth: AuthContext) {
    const platformContext = await this.authorization.assertPlatformSession(
      auth,
      auth.adminAuthVersion,
    );
    if (
      platformContext.tenantId !== null ||
      (
        platformContext.isPlatformStaff !== true &&
        platformContext.isPlatformAdmin !== true
      )
    ) {
      throw Errors.forbidden();
    }
    this.authorization.assertPermission(platformContext, MANAGE_PERMISSION);
    return {
      authUserId: platformContext.authUserId,
      employeeId: platformContext.employeeId,
    };
  }
}

function commandContext(
  actor: { authUserId: string; employeeId: string },
  supplierId: string,
  idempotencyKey: string,
) {
  return {
    tenant_id: null,
    tenant_supplier_id: null,
    supplier_id: supplierId,
    actor_user_id: actor.authUserId,
    actor_employee_id: actor.employeeId,
    idempotency_key: idempotencyKey,
  };
}

function requireCommand(result: SupplierProductCommandResult) {
  if (!result.error_code) return result;
  const isNotFound = result.error_code.endsWith("_NOT_FOUND");
  const isVersionConflict = result.error_code.includes("VERSION_CONFLICT");
  throw Errors.business(
    isNotFound ? 404 : 409,
    isVersionConflict ? "供应商商品版本已变化" : "供应商商品当前状态不允许该操作",
    result.error_code,
    { version: result.version, current_status: result.current_status },
  );
}

function productNotFound() {
  return Errors.business(
    404,
    "供应商商品不存在",
    "SUPPLIER_PRODUCT_NOT_FOUND",
  );
}

export const platformSupplierProductsService =
  new PlatformSupplierProductsService();
