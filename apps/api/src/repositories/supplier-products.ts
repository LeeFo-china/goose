import { throwSupplierCommandDatabaseError } from "@/repositories/supplier-command-errors";
import {
  supplierCommandBaseParams,
  supplierProductCommandPayload,
} from "@/repositories/supplier-product-command-payload";
import {
  attachProductSkuCounts,
  type ProductCountScope,
} from "@/repositories/supplier-product-sku-counts";
import {
  attachProductCostCategories,
  attachSkuCurrentPrices,
  type SupplierSkuCurrentPriceScope,
} from "@/repositories/supplier-product-list-summaries";
import type {
  CommandActor,
  OwnershipScope,
  PlatformSupplierProductListInput,
  PlatformSupplierSkuListInput,
  ProductFilters,
  SupplierCommandContext,
  SupplierProductCreateCommand,
  SupplierProductListInput,
  SupplierSkuListInput,
} from "@/repositories/supplier-products-inputs";
import {
  listPlatformSkuUnitConversions,
  listTenantSkuUnitConversions,
  type PlatformSkuUnitConversionListInput,
  type TenantSkuUnitConversionListInput,
} from "@/repositories/supplier-product-subresources";
import {
  applyProductKeyword,
  applySkuKeyword,
  type Client,
  normalizePage,
  pageRange,
  parse,
  parseRows,
  ProductCommandResultSchema,
  ProductRowSchema,
  PRODUCT_SELECT,
  SkuSchema,
  SKU_SELECT,
  tenantReadScopeFilter,
  toPage,
  type Page,
  type SupplierProduct,
  type SupplierProductCommandResult,
  type SupplierSku,
  type SupplierSkuUnitConversion,
} from "@/repositories/supplier-products-model";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type { Page, SupplierProduct, SupplierProductCommandResult, SupplierSku, SupplierSkuUnitConversion } from "@/repositories/supplier-products-model";
export type {
  PlatformSkuUnitConversionListInput,
  TenantSkuUnitConversionListInput,
} from "@/repositories/supplier-product-subresources";
export type {
  PlatformSupplierProductListInput,
  PlatformSupplierSkuListInput,
  ProductFilters,
  SupplierCommandContext,
  SupplierProductCreateCommand,
  SupplierProductListInput,
  SupplierSkuListInput,
} from "@/repositories/supplier-products-inputs";

export class SupplierProductsRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  private get client(): Client {
    return this.clientProvider();
  }

  listProducts(input: SupplierProductListInput): Promise<Page<SupplierProduct>> {
    return this.listProductsByScope(
      input,
      (request) => request.or(tenantReadScopeFilter(input.tenant_id)),
      { ownershipScope: "tenant", tenantId: input.tenant_id },
    );
  }

  listPlatformProducts(
    input: PlatformSupplierProductListInput,
  ): Promise<Page<SupplierProduct>> {
    return this.listProductsByScope(input, platformScope, {
      ownershipScope: "platform",
      tenantId: null,
    });
  }

  findProduct(
    supplierId: string,
    productId: string,
    tenantId: string,
    includeSkuCounts = true,
  ): Promise<SupplierProduct | null> {
    return this.findProductByScope(
      supplierId,
      productId,
      (request) => request.or(tenantReadScopeFilter(tenantId)),
      includeSkuCounts ? { ownershipScope: "tenant", tenantId } : null,
    );
  }

  findPlatformProduct(
    supplierId: string,
    productId: string,
    includeSkuCounts = true,
  ): Promise<SupplierProduct | null> {
    return this.findProductByScope(
      supplierId,
      productId,
      platformScope,
      includeSkuCounts
        ? { ownershipScope: "platform", tenantId: null }
        : null,
    );
  }

  async listSkus(input: SupplierSkuListInput): Promise<Page<SupplierSku>> {
    return this.listSkusByScope(input, (request) =>
      request.or(tenantReadScopeFilter(input.tenant_id)), {
        supplierId: input.supplier_id,
        supplierProductId: input.supplier_product_id,
        tenantId: input.tenant_id,
        tenantSupplierId: input.tenant_supplier_id,
      });
  }

  listPlatformSkus(
    input: PlatformSupplierSkuListInput,
  ): Promise<Page<SupplierSku>> {
    return this.listSkusByScope(input, platformScope);
  }

  listSkuUnitConversions(
    input: TenantSkuUnitConversionListInput,
  ): Promise<SupplierSkuUnitConversion[] | null> {
    return listTenantSkuUnitConversions(this.client, input);
  }

  listPlatformSkuUnitConversions(
    input: PlatformSkuUnitConversionListInput,
  ): Promise<SupplierSkuUnitConversion[] | null> {
    return listPlatformSkuUnitConversions(this.client, input);
  }

  private async listSkusByScope(
    input: PlatformSupplierSkuListInput,
    applyScope: (request: import("./supplier-products-model").Query) =>
      import("./supplier-products-model").Query,
    priceScope: SupplierSkuCurrentPriceScope | null = null,
  ): Promise<Page<SupplierSku>> {
    const pagination = normalizePage(input);
    let request = applyScope(this.client.from("supplier_skus")
      .select(SKU_SELECT, { count: "exact" })
      .eq("supplier_id", input.supplier_id)
      .eq("supplier_product_id", input.supplier_product_id));
    if (input.status) request = request.eq("status", input.status);
    request = applySkuKeyword(request, input.keyword);
    const { data, error, count } = await request
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError("查询供应商 SKU 失败", error);
    const skus = parseRows(SkuSchema, data, "查询供应商 SKU 失败");
    return toPage(
      await attachSkuCurrentPrices(this.client, skus, priceScope),
      pagination,
      count,
    );
  }

  createProduct(input: SupplierProductCreateCommand) {
    const {
      product_code,
      name,
      category_id,
      brand_id,
      description,
      ...context
    } = input;
    return this.productCommand("tenant", "create", context, null, {
      product_code,
      name,
      category_id,
      brand_id,
      description: description ?? null,
    });
  }

  createPlatformProduct(input: Record<string, unknown> & CommandActor & {
    product_id: string;
  }) {
    return this.productCommand(
      "platform",
      "create",
      input,
      null,
      supplierProductCommandPayload(input, ["product_id"]),
    );
  }

  updatePlatformProduct(input: Record<string, unknown> & CommandActor & {
    product_id: string;
    expected_version: number;
  }) {
    return this.productCommand(
      "platform",
      "update",
      input,
      input.expected_version,
      supplierProductCommandPayload(input, ["product_id"]),
    );
  }

  mutatePlatformProduct(input: Record<string, unknown> & CommandActor & {
    product_id: string;
    action: "activate" | "deactivate";
    expected_version: number;
  }) {
    return this.productCommand(
      "platform",
      input.action,
      input,
      input.expected_version,
      {},
    );
  }

  updateProduct(input: Record<string, unknown> & SupplierCommandContext & {
    product_id: string;
    expected_version: number;
  }) {
    const { expected_version, ...command } = input;
    return this.productCommand(
      "tenant",
      "update",
      command,
      expected_version,
      supplierProductCommandPayload(command, ["product_id"]),
    );
  }

  mutateProduct(input: Record<string, unknown> & SupplierCommandContext & {
    product_id: string;
    action: "activate" | "deactivate";
    expected_version: number;
  }) {
    return this.productCommand(
      "tenant",
      input.action,
      input,
      input.expected_version,
      {},
    );
  }

  createSku(input: Record<string, unknown> & SupplierCommandContext) {
    return this.skuCommand(
      "tenant",
      "create",
      input,
      null,
      supplierProductCommandPayload(input, ["product_id", "sku_id"]),
    );
  }

  createPlatformSku(input: Record<string, unknown> & CommandActor) {
    return this.skuCommand(
      "platform",
      "create",
      input,
      null,
      supplierProductCommandPayload(input, ["product_id", "sku_id"]),
    );
  }

  updatePlatformSku(input: Record<string, unknown> & CommandActor & {
    supplier_product_id: string;
    sku_id: string;
    expected_version: number;
  }) {
    return this.skuCommand(
      "platform",
      "update",
      input,
      input.expected_version,
      supplierProductCommandPayload(input, ["supplier_product_id", "sku_id"]),
    );
  }

  mutatePlatformSku(input: Record<string, unknown> & CommandActor & {
    product_id: string;
    sku_id: string;
    action: "activate" | "deactivate";
    expected_version: number;
  }) {
    return this.skuCommand(
      "platform",
      input.action,
      input,
      input.expected_version,
      {},
    );
  }

  updateSku(input: Record<string, unknown> & SupplierCommandContext & {
    supplier_product_id: string;
    sku_id: string;
    expected_version: number;
  }) {
    return this.skuCommand(
      "tenant",
      "update",
      input,
      input.expected_version,
      supplierProductCommandPayload(input, ["supplier_product_id", "sku_id"]),
    );
  }

  mutateSku(input: Record<string, unknown> & SupplierCommandContext & {
    product_id: string;
    sku_id: string;
    action: "activate" | "deactivate";
    expected_version: number;
  }) {
    return this.skuCommand(
      "tenant",
      input.action,
      input,
      input.expected_version,
      {},
    );
  }

  replaceSkuUnitConversions(input: Record<string, unknown> & CommandActor & {
    ownership_scope: OwnershipScope;
    product_id: string;
    sku_id: string;
    expected_version: number;
    purchase_unit_id: string;
    base_unit_id: string;
    conversions: unknown[];
  }) {
    return this.command("replace_supplier_sku_unit_conversions_v3", {
      p_ownership_scope: input.ownership_scope,
      p_tenant_id: input.tenant_id,
      p_tenant_supplier_id: input.tenant_supplier_id,
      p_supplier_id: input.supplier_id,
      p_supplier_product_id: input.product_id,
      p_supplier_sku_id: input.sku_id,
      p_expected_sku_version: input.expected_version,
      p_purchase_unit_id: input.purchase_unit_id,
      p_base_unit_id: input.base_unit_id,
      p_edges: input.conversions,
      p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: input.idempotency_key,
    }, "更新供应商 SKU 单位换算失败");
  }

  private async listProductsByScope(
    input: ProductFilters,
    applyScope: (request: import("./supplier-products-model").Query) =>
      import("./supplier-products-model").Query,
    countScope: ProductCountScope,
  ): Promise<Page<SupplierProduct>> {
    const pagination = normalizePage(input);
    let request = applyScope(this.client.from("supplier_products")
      .select(PRODUCT_SELECT, { count: "exact" })
      .eq("supplier_id", input.supplier_id));
    if (input.status) request = request.eq("status", input.status);
    if (input.category_id) request = request.eq("category_id", input.category_id);
    if (input.brand_id) request = request.eq("brand_id", input.brand_id);
    request = applyProductKeyword(request, input.keyword);
    const { data, error, count } = await request
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError("查询供应商商品失败", error);
    const products = parseRows(
      ProductRowSchema,
      data,
      "查询供应商商品失败",
    );
    const countedProducts = await attachProductSkuCounts(
        this.client,
        input.supplier_id,
        products,
        countScope,
      );
    return toPage(
      await attachProductCostCategories(
        this.client,
        countedProducts,
        countScope.tenantId,
      ),
      pagination,
      count,
    );
  }

  private async findProductByScope(
    supplierId: string,
    productId: string,
    applyScope: (request: import("./supplier-products-model").Query) =>
      import("./supplier-products-model").Query,
    countScope: ProductCountScope | null,
  ): Promise<SupplierProduct | null> {
    const request = applyScope(this.client.from("supplier_products")
      .select(PRODUCT_SELECT)
      .eq("supplier_id", supplierId)
      .eq("id", productId));
    const { data, error } = await request.maybeSingle();
    if (error) throw Errors.dbError("查询供应商商品失败", error);
    if (data === null) return null;
    const product = parse(ProductRowSchema, data, "查询供应商商品失败");
    if (!countScope) {
      return {
        ...product,
        sku_count: 0,
        active_sku_count: 0,
        default_cost_category_id: null,
        default_cost_category_name: null,
        cost_category_source: null,
      };
    }
    const counted = await attachProductSkuCounts(
      this.client,
      supplierId,
      [product],
      countScope,
    );
    return (await attachProductCostCategories(
      this.client,
      counted,
      countScope.tenantId,
    ))[0]!;
  }

  private productCommand(
    scope: OwnershipScope,
    action: string,
    input: Record<string, unknown> & CommandActor & { product_id: unknown },
    expectedVersion: number | null,
    payload: Record<string, unknown>,
  ) {
    return this.command("command_supplier_product_v2", {
      ...supplierCommandBaseParams(scope, input),
      p_action: action,
      p_product_id: input.product_id,
      p_expected_version: expectedVersion,
      p_payload: payload,
    }, "写入供应商商品失败");
  }

  private skuCommand(
    scope: OwnershipScope,
    action: string,
    input: Record<string, unknown> & CommandActor,
    expectedVersion: number | null,
    payload: Record<string, unknown>,
  ) {
    return this.command("command_supplier_sku_v3", {
      ...supplierCommandBaseParams(scope, input),
      p_action: action,
      p_supplier_product_id:
        input.supplier_product_id ?? input.product_id,
      p_sku_id: input.sku_id,
      p_expected_version: expectedVersion,
      p_payload: payload,
    }, "写入供应商 SKU 失败");
  }

  private async command(
    name: string,
    params: Record<string, unknown>,
    message: string,
  ): Promise<SupplierProductCommandResult> {
    const { data, error } = await this.client.rpc(name, params);
    if (error) throwSupplierCommandDatabaseError(error, message);
    return parse(ProductCommandResultSchema, data, message);
  }
}

function platformScope(request: import("./supplier-products-model").Query) {
  return request.eq("ownership_scope", "platform").is("owner_tenant_id", null);
}

export const supplierProductsRepository = new SupplierProductsRepository();
