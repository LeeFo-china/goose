import { Errors } from "@/errors/error-factory";
import {
  sameLimitedDecimal,
  SupplierPurchasableProductCommandEnvelopeSchema,
  type SupplierPurchasableProductCommandResult,
} from "@/repositories/supplier-purchasable-product-records";
import { mapSupplierCommandDatabaseError } from "@/repositories/supplier-command-errors";
import type { SupplierPurchasableProductCreateInput } from "@/schema/supplier-purchasable-products";
import { SupabaseDB } from "@/utils/supabase";

export type SupplierPurchasableProductCommandInput = {
  product_id: string;
  sku_id: string;
  tenant_id: string;
  tenant_supplier_id: string;
  supplier_id: string;
  product: SupplierPurchasableProductCreateInput["product"] & {
    product_code: string;
  };
  sku: SupplierPurchasableProductCreateInput["sku"] & {
    sku_code: string;
  };
  price: SupplierPurchasableProductCreateInput["price"];
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
};

type RpcResult = { data: unknown; error: unknown };
type SupplierPurchasableProductRpcClient = {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<RpcResult>;
};

const CREATE_FAILED_CODE = "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED";
const CREATE_FAILED_MESSAGE = "创建可采购商品失败";

export class SupplierPurchasableProductsRepository {
  constructor(
    private readonly clientProvider: () =>
      SupplierPurchasableProductRpcClient = () =>
        SupabaseDB.getAdminClient() as unknown as
          SupplierPurchasableProductRpcClient,
  ) {}

  async create(
    input: SupplierPurchasableProductCommandInput,
  ): Promise<SupplierPurchasableProductCommandResult> {
    const { data, error } = await this.clientProvider().rpc(
      "command_supplier_purchasable_product_v2",
      {
        p_product_id: input.product_id,
        p_sku_id: input.sku_id,
        p_tenant_id: input.tenant_id,
        p_tenant_supplier_id: input.tenant_supplier_id,
        p_supplier_id: input.supplier_id,
        p_product: input.product,
        p_sku: input.sku,
        p_price: input.price,
        p_actor_user_id: input.actor_user_id,
        p_actor_employee_id: input.actor_employee_id,
        p_idempotency_key: input.idempotency_key,
      },
    );
    if (error) {
      throw mapSupplierCommandDatabaseError(error) ??
        Errors.dbError(CREATE_FAILED_MESSAGE);
    }

    const parsed = SupplierPurchasableProductCommandEnvelopeSchema.safeParse(
      data,
    );
    if (!parsed.success || !matchesCommandIdentity(parsed.data, input)) {
      throw Errors.business(
        500,
        CREATE_FAILED_MESSAGE,
        CREATE_FAILED_CODE,
      );
    }
    return parsed.data;
  }
}

function matchesCommandIdentity(
  result: SupplierPurchasableProductCommandResult,
  input: SupplierPurchasableProductCommandInput,
): boolean {
  if (result.status !== "created") return true;
  return sameUuid(result.product.id, input.product_id) &&
    result.product.product_code === input.product.product_code &&
    result.product.name === input.product.name &&
    sameUuid(result.product.category_id, input.product.category_id) &&
    sameUuid(result.product.brand_id, input.product.brand_id) &&
    sameUuid(result.product.supplier_id, input.supplier_id) &&
    sameUuid(result.product.owner_tenant_id, input.tenant_id) &&
    sameUuid(result.product.acting_employee_id, input.actor_employee_id) &&
    sameUuid(result.sku.id, input.sku_id) &&
    matchesSkuCode(result.sku.sku_code, input, result.idempotent) &&
    result.sku.name === input.sku.name &&
    sameUuid(result.sku.purchase_unit_id, input.sku.purchase_unit_id) &&
    sameJsonValue(result.sku.spec_values, input.sku.spec_values) &&
    sameUuid(result.price.tenant_id, input.tenant_id) &&
    sameUuid(result.price.supplier_id, input.supplier_id) &&
    sameUuid(result.price.acting_employee_id, input.actor_employee_id) &&
    sameLimitedDecimal(result.price.unit_price, input.price.unit_price) &&
    sameLimitedDecimal(result.price.tax_rate, input.price.tax_rate) &&
    result.price.tax_inclusive === input.price.tax_inclusive;
}

function matchesSkuCode(
  resultCode: string,
  input: SupplierPurchasableProductCommandInput,
  idempotent: boolean,
): boolean {
  const legacyCode = `TS-${input.sku_id.replaceAll("-", "").slice(0, 16)}`;
  return resultCode === input.sku.sku_code ||
    (idempotent && resultCode === legacyCode);
}

function sameUuid(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
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
  return leftKeys.length === Object.keys(rightRecord).length &&
    leftKeys.every((key) => Object.hasOwn(rightRecord, key) &&
      sameJsonValue(leftRecord[key], rightRecord[key]));
}

export const supplierPurchasableProductsRepository =
  new SupplierPurchasableProductsRepository();
