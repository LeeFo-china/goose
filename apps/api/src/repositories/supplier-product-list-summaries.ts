import { Errors } from "@/errors/error-factory";
import {
  CatalogCategoryParentSchema,
  type Client,
  FinanceCostCategorySummarySchema,
  parseRows,
  ProductCostCategoryRuleSchema,
  SupplierSkuPriceListItemSummarySchema,
  type FinanceCostCategorySummary,
  type SupplierProduct,
  type SupplierProductCostCategoryRule,
  type SupplierProductRow,
  type SupplierSku,
  type SupplierSkuPriceListItemSummary,
} from "@/repositories/supplier-products-model";

const SKU_PRICE_SELECT = [
  "id",
  "supplier_sku_id",
  "supplier_price_list_id",
  "minimum_quantity::text",
  "unit_price::text",
  "tax_rate::text",
  "tax_inclusive",
  "price_list:supplier_price_lists!supplier_price_items_list_tenant_supplier_fkey!inner(id,version_number,row_version,effective_from,effective_until)",
].join(",");
const SKU_PRICE_LOOKUP_MAX = 500;

export type SupplierSkuCurrentPriceScope = {
  supplierId: string;
  supplierProductId: string;
  tenantId: string;
  tenantSupplierId: string;
};

export async function attachProductCostCategories(
  client: Client,
  products: SupplierProduct[],
  tenantId: string | null,
): Promise<SupplierProduct[]> {
  if (!tenantId || products.length === 0) return products;
  const productIds = products.map(({ id }) => id);
  const categoryPaths = await collectCategoryPaths(client, tenantId, products);
  const allCategoryIds = Array.from(new Set(
    Array.from(categoryPaths.values()).flat(),
  ));
  const [productRules, categoryRules] = await Promise.all([
    fetchCostCategoryRules(client, tenantId, "product", productIds),
    fetchCostCategoryRules(client, tenantId, "category", allCategoryIds),
  ]);
  const rules = [...productRules, ...categoryRules];
  if (rules.length === 0) return products;
  const categoryNames = await fetchFinanceCostCategoryNames(
    client,
    tenantId,
    Array.from(new Set(rules.map(({ cost_category_id }) => cost_category_id))),
  );
  const productRuleByProductId = new Map(
    productRules
      .filter((rule) => rule.supplier_product_id)
      .map((rule) => [rule.supplier_product_id!, rule]),
  );
  const categoryRuleByCategoryId = new Map(
    categoryRules
      .filter((rule) => rule.catalog_category_id)
      .map((rule) => [rule.catalog_category_id!, rule]),
  );
  return products.map((product) => {
    const resolved = resolveProductCostCategory(
      product,
      categoryPaths.get(product.category.id) ?? [product.category.id],
      productRuleByProductId,
      categoryRuleByCategoryId,
      categoryNames,
    );
    return { ...product, ...resolved };
  });
}

export async function attachSkuCurrentPrices(
  client: Client,
  skus: SupplierSku[],
  scope: SupplierSkuCurrentPriceScope | null,
): Promise<SupplierSku[]> {
  if (!scope || skus.length === 0) return skus;
  const skuIds = skus.map(({ id }) => id);
  const now = new Date().toISOString();
  const { data, error } = await client.from("supplier_price_list_items")
    .select(SKU_PRICE_SELECT)
    .eq("tenant_id", scope.tenantId)
    .eq("supplier_id", scope.supplierId)
    .eq("supplier_product_id", scope.supplierProductId)
    .eq("price_list.tenant_supplier_id", scope.tenantSupplierId)
    .eq("price_list.lifecycle_status", "published")
    .eq("price_list.scope_type", "default")
    .eq("price_list.price_list_code", "DEFAULT")
    .eq("price_list.currency", "CNY")
    .lte("price_list.effective_from", now)
    .in("supplier_sku_id", skuIds)
    .order("effective_from", { ascending: false, referencedTable: "price_list" })
    .order("minimum_quantity", { ascending: true })
    .limit(Math.min(skuIds.length * 5, SKU_PRICE_LOOKUP_MAX));
  if (error) throw Errors.dbError("查询供应商 SKU 价格失败", error);
  const priceBySkuId = resolveCurrentSkuPrices(parseRows(
    SupplierSkuPriceListItemSummarySchema,
    data,
    "查询供应商 SKU 价格失败",
  ), now);
  return skus.map((sku) => ({
    ...sku,
    current_price: priceBySkuId.get(sku.id) ?? null,
  }));
}

async function collectCategoryPaths(
  client: Client,
  tenantId: string,
  products: SupplierProductRow[],
): Promise<Map<string, string[]>> {
  const paths = new Map<string, string[]>();
  const fetchedAncestors = new Set<string>();
  const parentToLeaves = new Map<string, string[]>();
  for (const product of products) {
    const leafId = product.category.id;
    paths.set(leafId, [leafId]);
    if (product.category.parent_id && product.category.parent_id !== leafId) {
      addParentLeaf(parentToLeaves, product.category.parent_id, leafId);
    }
  }
  let frontier = Array.from(parentToLeaves.keys());
  for (let depth = 0; depth < 7 && frontier.length > 0; depth += 1) {
    const { data, error } = await client.from("catalog_categories")
      .select("id,parent_id")
      .or([
        "and(ownership_scope.eq.platform,owner_tenant_id.is.null)",
        `and(ownership_scope.eq.tenant,owner_tenant_id.eq.${tenantId})`,
      ].join(","))
      .in("id", frontier)
      .limit(frontier.length);
    if (error) throw Errors.dbError("查询商品成本归类失败", error);
    const rows = parseRows(
      CatalogCategoryParentSchema,
      data,
      "查询商品成本归类失败",
    );
    const nextParents = new Map<string, string[]>();
    for (const row of rows) {
      fetchedAncestors.add(row.id);
      const leaves = parentToLeaves.get(row.id) ?? [];
      for (const leafId of leaves) {
        const path = paths.get(leafId);
        if (!path || path.includes(row.id)) continue;
        path.push(row.id);
        if (row.parent_id && !path.includes(row.parent_id)) {
          addParentLeaf(nextParents, row.parent_id, leafId);
        }
      }
    }
    for (const [parentId, leaves] of nextParents) {
      const uniqueLeaves = Array.from(new Set([
        ...(parentToLeaves.get(parentId) ?? []),
        ...leaves,
      ]));
      parentToLeaves.set(parentId, uniqueLeaves);
    }
    frontier = Array.from(nextParents.keys())
      .filter((id) => !fetchedAncestors.has(id));
  }
  return paths;
}

function addParentLeaf(
  parentToLeaves: Map<string, string[]>,
  parentId: string,
  leafId: string,
) {
  parentToLeaves.set(parentId, [
    ...(parentToLeaves.get(parentId) ?? []),
    leafId,
  ]);
}

async function fetchCostCategoryRules(
  client: Client,
  tenantId: string,
  scope: "product" | "category",
  ids: string[],
): Promise<SupplierProductCostCategoryRule[]> {
  if (ids.length === 0) return [];
  const column = scope === "product" ? "supplier_product_id" : "catalog_category_id";
  const { data, error } = await client.from("tenant_catalog_cost_category_rules")
    .select("rule_scope,catalog_category_id,supplier_product_id,cost_category_id")
    .eq("tenant_id", tenantId)
    .eq("rule_scope", scope)
    .in(column, ids)
    .limit(ids.length);
  if (error) throw Errors.dbError("查询商品成本归类失败", error);
  return parseRows(
    ProductCostCategoryRuleSchema,
    data,
    "查询商品成本归类失败",
  );
}

async function fetchFinanceCostCategoryNames(
  client: Client,
  tenantId: string,
  costCategoryIds: string[],
): Promise<Map<string, FinanceCostCategorySummary>> {
  if (costCategoryIds.length === 0) return new Map();
  const { data, error } = await client.from("finance_cost_categories")
    .select("id,name")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .in("id", costCategoryIds)
    .limit(costCategoryIds.length);
  if (error) throw Errors.dbError("查询商品成本归类失败", error);
  return new Map(parseRows(
    FinanceCostCategorySummarySchema,
    data,
    "查询商品成本归类失败",
  ).map((item) => [item.id, item]));
}

function resolveProductCostCategory(
  product: SupplierProduct,
  categoryPath: string[],
  productRuleByProductId: Map<string, SupplierProductCostCategoryRule>,
  categoryRuleByCategoryId: Map<string, SupplierProductCostCategoryRule>,
  categoryNames: Map<string, FinanceCostCategorySummary>,
) {
  const productRule = productRuleByProductId.get(product.id);
  if (productRule) {
    const costCategory = categoryNames.get(productRule.cost_category_id);
    if (costCategory) {
      return {
        default_cost_category_id: costCategory.id,
        default_cost_category_name: costCategory.name,
        cost_category_source: "product" as const,
      };
    }
  }
  for (const [index, categoryId] of categoryPath.entries()) {
    const rule = categoryRuleByCategoryId.get(categoryId);
    const costCategory = rule
      ? categoryNames.get(rule.cost_category_id)
      : null;
    if (costCategory) {
      return {
        default_cost_category_id: costCategory.id,
        default_cost_category_name: costCategory.name,
        cost_category_source: index === 0 ? "category" as const : "ancestor" as const,
      };
    }
  }
  return {
    default_cost_category_id: null,
    default_cost_category_name: null,
    cost_category_source: null,
  };
}

function resolveCurrentSkuPrices(
  rows: SupplierSkuPriceListItemSummary[],
  nowIso: string,
) {
  const nowMs = Date.parse(nowIso);
  const currentRows = rows
    .filter(({ price_list }) =>
      Date.parse(price_list.effective_from) <= nowMs
      && (!price_list.effective_until
        || Date.parse(price_list.effective_until) > nowMs))
    .sort(compareSkuPriceRows);
  const result = new Map<string, SupplierSku["current_price"]>();
  for (const row of currentRows) {
    if (result.has(row.supplier_sku_id)) continue;
    result.set(row.supplier_sku_id, {
      supplier_price_list_id: row.supplier_price_list_id,
      supplier_price_list_version: row.price_list.version_number,
      supplier_price_list_row_version: row.price_list.row_version,
      supplier_price_list_item_id: row.id,
      unit_price: row.unit_price,
      tax_rate: row.tax_rate,
      tax_inclusive: row.tax_inclusive,
      effective_from: row.price_list.effective_from,
      effective_until: row.price_list.effective_until,
    });
  }
  return result;
}

function compareSkuPriceRows(
  left: SupplierSkuPriceListItemSummary,
  right: SupplierSkuPriceListItemSummary,
) {
  return Date.parse(right.price_list.effective_from)
    - Date.parse(left.price_list.effective_from)
    || right.price_list.version_number - left.price_list.version_number
    || Number(left.minimum_quantity) - Number(right.minimum_quantity)
    || left.id.localeCompare(right.id);
}
