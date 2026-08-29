import { Errors } from "@/errors/error-factory";
import {
  type Client,
  ProductSchema,
  ProductSkuCountSchema,
  type SupplierProduct,
  type SupplierProductRow,
  type SupplierProductSkuCount,
  parse,
  parseRows,
} from "@/repositories/supplier-products-model";

export type ProductCountScope = {
  ownershipScope: "platform" | "tenant";
  tenantId: string | null;
};

export async function attachProductSkuCounts(
  client: Client,
  supplierId: string,
  products: SupplierProductRow[],
  scope: ProductCountScope,
): Promise<SupplierProduct[]> {
  if (products.length === 0) return [];
  const { data, error } = await client.rpc("list_supplier_product_sku_counts", {
    p_supplier_id: supplierId,
    p_product_ids: products.map(({ id }) => id),
    p_ownership_scope: scope.ownershipScope,
    p_tenant_id: scope.tenantId,
  });
  if (error) throw Errors.dbError("查询商品 SKU 数量失败", error);
  const counts = parseRows(
    ProductSkuCountSchema,
    data,
    "查询商品 SKU 数量失败",
  );
  const countByProductId = new Map<string, SupplierProductSkuCount>(
    counts.map((item) => [item.supplier_product_id, item]),
  );
  return products.map((product) => {
    const count = countByProductId.get(product.id);
    return parse(ProductSchema, {
      ...product,
      sku_count: count?.sku_count ?? 0,
      active_sku_count: count?.active_sku_count ?? 0,
    }, "查询供应商商品失败");
  });
}
