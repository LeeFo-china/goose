import { Errors } from "@/errors/error-factory";
import type { SupplierSkuCostCategoryDefault } from
  "@/repositories/supplier-purchase-batch-records";
import type { SupplierPurchaseBatchDraftInput } from
  "@/schema/supplier-purchase-batches";

type DraftItem = SupplierPurchaseBatchDraftInput["items"][number];
type CostCategoryResolver = {
  resolveCostCategoryDefaults: (
    tenantId: string,
    supplierSkuIds: string[],
  ) => Promise<SupplierSkuCostCategoryDefault[]>;
};

export async function resolveSupplierPurchaseBatchDraftCostCategories(
  repository: CostCategoryResolver,
  tenantId: string,
  items: DraftItem[],
): Promise<Array<DraftItem & { cost_category_id: string }>> {
  const missingSkuIds = items
    .filter((item) => !item.cost_category_id)
    .map((item) => item.supplier_sku_id);
  const defaults = missingSkuIds.length
    ? await repository.resolveCostCategoryDefaults(tenantId, missingSkuIds)
    : [];
  const defaultsBySku = new Map(
    defaults.map((item) => [item.supplier_sku_id, item.cost_category_id]),
  );
  const resolvedItems = items.map((item) => ({
    ...item,
    cost_category_id: item.cost_category_id ??
      defaultsBySku.get(item.supplier_sku_id) ?? "",
  }));
  if (resolvedItems.some((item) => !item.cost_category_id)) {
    throw Errors.business(
      409,
      "部分商品尚未配置成本分类，请先在商品目录中完成归类",
      "SUPPLIER_COST_CATEGORY_REQUIRED",
    );
  }
  return resolvedItems;
}
