import { Errors } from "@/errors/error-factory";
import type { Client } from "./supplier-products";

export async function applyOwnership(
  client: Client,
  table: "supplier_products" | "supplier_skus",
  id: string,
  ownershipScope: "platform" | "tenant" | undefined,
  ownerTenantId: string | null | undefined,
) {
  if (!id || ownershipScope === undefined) return;
  const { error } = await client.from(table)
    .update({
      ownership_scope: ownershipScope,
      owner_tenant_id: ownerTenantId ?? null,
    })
    .eq("id", id);
  if (error) throw Errors.dbError("写入商品所有权失败", error);
}

export async function applySkuPostCreate(
  client: Client,
  input: Record<string, unknown>,
) {
  const skuId = String(input.sku_id ?? "");
  await applyOwnership(
    client,
    "supplier_skus",
    skuId,
    input.ownership_scope as "platform" | "tenant" | undefined,
    input.owner_tenant_id as string | null | undefined,
  );

  if (input.spec_values !== undefined) {
    const { error } = await client.from("supplier_skus")
      .update({ spec_values: input.spec_values })
      .eq("id", skuId);
    if (error) throw Errors.dbError("写入 SKU 规格值失败", error);
  }

  const conversions = input.unit_conversions as {
    from_unit_id: string;
    to_unit_id: string;
    factor: string;
  }[] | undefined;
  if (conversions?.length) {
    const employeeId = String(input.actor_employee_id ?? "");
    const { error } = await client.from("supplier_sku_unit_conversions")
      .insert(conversions.map((edge) => ({
        supplier_sku_id: skuId,
        from_unit_id: edge.from_unit_id,
        to_unit_id: edge.to_unit_id,
        factor: Number(edge.factor),
        status: "active",
        version: 1,
        created_by_employee_id: employeeId,
        updated_by_employee_id: employeeId,
      })));
    if (error) throw Errors.dbError("写入 SKU 单位换算链失败", error);
  }
}
