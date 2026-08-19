import { Errors } from "@/errors/error-factory";
import {
  type Client,
  parseRows,
  SKU_UNIT_CONVERSION_SELECT,
  SkuUnitConversionSchema,
  tenantReadScopeFilter,
  type SupplierSkuUnitConversion,
} from "@/repositories/supplier-products-model";

type SkuIdentity = {
  supplier_id: string;
  supplier_product_id: string;
  sku_id: string;
};

export type TenantSkuUnitConversionListInput = SkuIdentity & {
  tenant_id: string;
};
export type PlatformSkuUnitConversionListInput = SkuIdentity;

export function listTenantSkuUnitConversions(
  client: Client,
  input: TenantSkuUnitConversionListInput,
) {
  return listSkuUnitConversions(client, input, (request) =>
    request.or(tenantReadScopeFilter(input.tenant_id)));
}

export function listPlatformSkuUnitConversions(
  client: Client,
  input: PlatformSkuUnitConversionListInput,
) {
  return listSkuUnitConversions(client, input, (request) =>
    request.eq("ownership_scope", "platform").is("owner_tenant_id", null));
}

async function listSkuUnitConversions(
  client: Client,
  input: SkuIdentity,
  applyScope: (request: ReturnType<Client["from"]>) =>
    ReturnType<Client["from"]>,
): Promise<SupplierSkuUnitConversion[] | null> {
  const visibleSku = await applyScope(client.from("supplier_skus")
    .select("id")
    .eq("supplier_id", input.supplier_id)
    .eq("supplier_product_id", input.supplier_product_id)
    .eq("id", input.sku_id))
    .maybeSingle();
  if (visibleSku.error) {
    throw Errors.dbError("查询供应商 SKU 失败", visibleSku.error);
  }
  if (!visibleSku.data) return null;

  // The command contract bounds one SKU conversion graph to 100 edges.
  const { data, error } = await client.from("supplier_sku_unit_conversions")
    .select(SKU_UNIT_CONVERSION_SELECT)
    .eq("supplier_sku_id", input.sku_id)
    .eq("status", "active")
    .order("from_unit_id", { ascending: true })
    .order("to_unit_id", { ascending: true })
    .limit(100);
  if (error) {
    throw Errors.dbError("查询供应商 SKU 单位换算失败", error);
  }
  return parseRows(
    SkuUnitConversionSchema,
    data,
    "查询供应商 SKU 单位换算失败",
  );
}
