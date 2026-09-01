import { Errors } from "@/errors/error-factory";
import {
  SupplierPurchasableSkuIdentitySchema,
  SupplierPurchasableSkuPriceContextEnvelopeSchema,
  type SupplierPurchasableSkuIdentity,
  type SupplierPurchasableSkuPriceContext,
} from "@/repositories/supplier-purchasable-sku-records";
import { SupabaseDB } from "@/utils/supabase";

const PRICE_CONTEXT_RPC = "get_supplier_purchasable_sku_price_context_v1";
const PRICE_READ_ERROR = "查询供应商 SKU 当前价格失败";
const SKU_IDENTITY_SELECT =
  "id,supplier_id,supplier_product_id,ownership_scope,owner_tenant_id,status,version";

type SingleResult = { data: unknown; error: unknown };
type Query = {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  maybeSingle(): Promise<SingleResult>;
};
type Client = {
  from(table: string): Query;
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<SingleResult>;
};

export type SupplierPurchasableSkuScopeInput = {
  tenant_id: string;
  tenant_supplier_id: string;
  supplier_id: string;
  supplier_product_id: string;
};

export type SupplierPurchasableSkuIdentityInput =
  SupplierPurchasableSkuScopeInput & { sku_id: string };

export class SupplierPurchasableSkusRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  getPriceDefaults(
    input: SupplierPurchasableSkuScopeInput,
  ): Promise<SupplierPurchasableSkuPriceContext> {
    return this.getPriceContext(input, null);
  }

  getCurrentPrice(
    input: SupplierPurchasableSkuIdentityInput,
  ): Promise<SupplierPurchasableSkuPriceContext> {
    return this.getPriceContext(input, input.sku_id);
  }

  async findTenantSkuIdentity(
    input: SupplierPurchasableSkuIdentityInput,
  ): Promise<SupplierPurchasableSkuIdentity | null> {
    const { data, error } = await this.clientProvider()
      .from("supplier_skus")
      .select(SKU_IDENTITY_SELECT)
      .eq("id", input.sku_id)
      .eq("supplier_id", input.supplier_id)
      .eq("supplier_product_id", input.supplier_product_id)
      .eq("ownership_scope", "tenant")
      .eq("owner_tenant_id", input.tenant_id)
      .maybeSingle();
    if (error) throw Errors.dbError("查询供应商 SKU 失败");
    if (data === null) return null;

    const parsed = SupplierPurchasableSkuIdentitySchema.safeParse(data);
    if (!parsed.success) {
      throw Errors.dbError("查询供应商 SKU 失败", parsed.error.issues);
    }
    return parsed.data;
  }

  private async getPriceContext(
    input: SupplierPurchasableSkuScopeInput,
    skuId: string | null,
  ): Promise<SupplierPurchasableSkuPriceContext> {
    const { data, error } = await this.clientProvider().rpc(
      PRICE_CONTEXT_RPC,
      {
        p_tenant_id: input.tenant_id,
        p_tenant_supplier_id: input.tenant_supplier_id,
        p_supplier_id: input.supplier_id,
        p_supplier_product_id: input.supplier_product_id,
        p_supplier_sku_id: skuId,
      },
    );
    if (error) throw Errors.dbError(PRICE_READ_ERROR);

    const parsed = SupplierPurchasableSkuPriceContextEnvelopeSchema.safeParse(
      data,
    );
    if (!parsed.success) {
      throw Errors.dbError(PRICE_READ_ERROR, parsed.error.issues);
    }
    if (!matchesScope(parsed.data, input, skuId)) {
      throw Errors.dbError(PRICE_READ_ERROR);
    }

    return {
      currency: parsed.data.currency,
      recommended_tax_rate: parsed.data.recommended_tax_rate,
      recommended_tax_inclusive: parsed.data.recommended_tax_inclusive,
      next_scheduled_effective_from:
        parsed.data.next_scheduled_effective_from,
      current_price: parsed.data.current_price,
    };
  }
}

function matchesScope(
  result: {
    tenant_id: string;
    tenant_supplier_id: string;
    supplier_id: string;
    supplier_product_id: string;
    supplier_sku_id: string | null;
  },
  input: SupplierPurchasableSkuScopeInput,
  skuId: string | null,
): boolean {
  return result.tenant_id === canonicalUuid(input.tenant_id) &&
    result.tenant_supplier_id === canonicalUuid(input.tenant_supplier_id) &&
    result.supplier_id === canonicalUuid(input.supplier_id) &&
    result.supplier_product_id === canonicalUuid(input.supplier_product_id) &&
    result.supplier_sku_id === (skuId === null ? null : canonicalUuid(skuId));
}

function canonicalUuid(value: string): string {
  return value.toLowerCase();
}

export const supplierPurchasableSkusRepository =
  new SupplierPurchasableSkusRepository();
