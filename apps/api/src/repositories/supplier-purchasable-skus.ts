import { Errors } from "@/errors/error-factory";
import {
  SupplierPurchasableSkuCommandFailureSchema,
  SupplierPurchasableSkuCommandResultSchema,
  SupplierPurchasableSkuIdentitySchema,
  SupplierPurchasableSkuPriceContextEnvelopeSchema,
  type SupplierPurchasableSkuCommandResult,
  type SupplierPurchasableSkuIdentity,
  type SupplierPurchasableSkuPriceContext,
} from "@/repositories/supplier-purchasable-sku-records";
import { mapSupplierCommandDatabaseError } from "@/repositories/supplier-command-errors";
import { sameLimitedDecimal } from "@/repositories/supplier-purchasable-product-records";
import { SupabaseDB } from "@/utils/supabase";

const PRICE_CONTEXT_RPC = "get_supplier_purchasable_sku_price_context_v1";
const PRICE_READ_ERROR = "查询供应商 SKU 当前价格失败";
const SAVE_ERROR = "保存供应商 SKU 与供货价失败";
const SAVE_ERROR_CODE = "SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED";
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

export type SupplierPurchasableSkuSaveInput = SupplierPurchasableSkuScopeInput & {
  action: "create" | "update";
  supplier_sku_id: string;
  expected_sku_version: number | null;
  sku: Record<string, unknown>;
  price: { unit_price: string; tax_rate: string; tax_inclusive: boolean };
  expected_price_list_id: string | null;
  expected_price_list_version: number | null;
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
};

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

  async save(
    input: SupplierPurchasableSkuSaveInput,
  ): Promise<SupplierPurchasableSkuCommandResult> {
    const { data, error } = await this.clientProvider().rpc(
      "command_supplier_purchasable_sku_v1",
      {
        p_action: input.action,
        p_tenant_id: input.tenant_id,
        p_tenant_supplier_id: input.tenant_supplier_id,
        p_supplier_id: input.supplier_id,
        p_supplier_product_id: input.supplier_product_id,
        p_supplier_sku_id: input.supplier_sku_id,
        p_expected_sku_version: input.expected_sku_version,
        p_sku: input.sku,
        p_price: input.price,
        p_expected_price_list_id: input.expected_price_list_id,
        p_expected_price_list_version: input.expected_price_list_version,
        p_actor_user_id: input.actor_user_id,
        p_actor_employee_id: input.actor_employee_id,
        p_idempotency_key: input.idempotency_key,
      },
    );
    if (error) {
      throw mapSupplierCommandDatabaseError(error) ??
        Errors.dbError(SAVE_ERROR);
    }

    const parsed = SupplierPurchasableSkuCommandResultSchema.safeParse(data);
    if (parsed.success && matchesSaveIdentity(parsed.data, input)) {
      return parsed.data;
    }
    const failure = SupplierPurchasableSkuCommandFailureSchema.safeParse(data);
    if (failure.success) {
      const mapped = mapSupplierCommandDatabaseError(
        failure.data.error_code,
      ) ?? mapSupplierCommandDatabaseError(failure.data.reason);
      if (mapped) throw mapped;
    }
    throw Errors.business(500, SAVE_ERROR, SAVE_ERROR_CODE);
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

function matchesSaveIdentity(
  result: SupplierPurchasableSkuCommandResult,
  input: SupplierPurchasableSkuSaveInput,
): boolean {
  return result.product.id === canonicalUuid(input.supplier_product_id) &&
    result.product.supplier_id === canonicalUuid(input.supplier_id) &&
    result.product.owner_tenant_id === canonicalUuid(input.tenant_id) &&
    result.product.acting_tenant_id === canonicalUuid(input.tenant_id) &&
    result.sku.id === canonicalUuid(input.supplier_sku_id) &&
    matchesSkuCode(result.sku.sku_code, input) &&
    result.sku.owner_tenant_id === canonicalUuid(input.tenant_id) &&
    matchesSkuPayload(result.sku, input.sku) &&
    sameLimitedDecimal(result.current_price.unit_price, input.price.unit_price) &&
    sameLimitedDecimal(result.current_price.tax_rate, input.price.tax_rate) &&
    result.current_price.tax_inclusive === input.price.tax_inclusive;
}

function matchesSkuPayload(
  sku: SupplierPurchasableSkuCommandResult["sku"],
  payload: Record<string, unknown>,
): boolean {
  return Object.entries(payload).every(([key, value]) => {
    if (key === "sku_code") return sku.sku_code === value;
    if (key === "purchase_unit_id" && typeof value === "string") {
      return sku.purchase_unit_id === canonicalUuid(value);
    }
    return sameJsonValue(sku[key as keyof typeof sku], value);
  });
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameJsonValue(value, right[index]));
  }
  if (typeof left !== "object" || left === null ||
    typeof right !== "object" || right === null) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(rightRecord, key) &&
      sameJsonValue(leftRecord[key], rightRecord[key]));
}

function generatedSkuCode(skuId: string): string {
  return `TS-${skuId.replaceAll("-", "").toUpperCase()}`;
}

function matchesSkuCode(
  resultCode: string,
  input: SupplierPurchasableSkuSaveInput,
): boolean {
  if (resultCode === generatedSkuCode(input.supplier_sku_id)) return true;
  const legacyCode = `TS-${canonicalUuid(input.supplier_sku_id)
    .replaceAll("-", "").slice(0, 16)}`;
  return input.action === "update" && resultCode === legacyCode;
}

export const supplierPurchasableSkusRepository =
  new SupplierPurchasableSkusRepository();
