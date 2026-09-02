import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { throwSupplierCommandDatabaseError } from "@/repositories/supplier-command-errors";
import {
  SupplierPurchaseBatchCatalogBaseItemSchema,
  SupplierPurchaseBatchCatalogItemSchema,
  SupplierSkuCostCategoryDefaultSchema,
  type SupplierPurchaseBatchCatalogItem,
  type SupplierSkuCostCategoryDefault,
} from "@/repositories/supplier-purchase-batch-records";

type RpcResult = { data: unknown; error: unknown };
type CostCategoryRpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<RpcResult>;
};
type CatalogBaseItem = z.infer<
  typeof SupplierPurchaseBatchCatalogBaseItemSchema
>;

export async function resolveSupplierSkuCostCategoryDefaults(
  client: CostCategoryRpcClient,
  tenantId: string,
  supplierSkuIds: string[],
): Promise<SupplierSkuCostCategoryDefault[]> {
  if (supplierSkuIds.length === 0) return [];
  const { data, error } = await client.rpc(
    "resolve_tenant_supplier_sku_cost_categories",
    {
      p_tenant_id: tenantId,
      p_supplier_sku_ids: [...new Set(supplierSkuIds)].slice(0, 100),
    },
  );
  if (error) {
    throwSupplierCommandDatabaseError(error, "解析采购商品成本分类失败");
  }
  return parseRows(SupplierSkuCostCategoryDefaultSchema, data);
}

export async function enrichCatalogCostCategoryDefaults(
  client: CostCategoryRpcClient,
  tenantId: string,
  items: CatalogBaseItem[],
): Promise<SupplierPurchaseBatchCatalogItem[]> {
  const defaults = await resolveSupplierSkuCostCategoryDefaults(
    client,
    tenantId,
    items.map((item) => item.supplier_sku_id),
  );
  const defaultsBySku = new Map(
    defaults.map((item) => [item.supplier_sku_id, item]),
  );
  return parseRows(SupplierPurchaseBatchCatalogItemSchema, items.map((item) => {
    const resolved = defaultsBySku.get(item.supplier_sku_id);
    return {
      ...item,
      default_cost_category_id: resolved?.cost_category_id ?? null,
      default_cost_category_name: resolved?.cost_category_name ?? null,
      cost_category_source: resolved?.source ?? null,
    };
  }));
}

function parseRows<T>(schema: z.ZodType<T>, data: unknown): T[] {
  const result = z.array(schema).safeParse(data ?? []);
  if (result.success) return result.data;
  throw Errors.dbError("解析采购商品成本分类失败", result.error.issues);
}
