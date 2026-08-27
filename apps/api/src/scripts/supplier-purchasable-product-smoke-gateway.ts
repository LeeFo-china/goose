import type { SavepointSQL, TransactionSQL } from "bun";

import type { SupplierPurchasableProductCommandInput } from
  "@/repositories/supplier-purchasable-products";
import type { Database } from "@/types/database";

const CONFLICT_CODE = "SUPPLIER_IDEMPOTENCY_CONFLICT";
const PRICE_SERIES_ROW_LIMIT = 100;

type PriceListRow = Database["public"]["Tables"]["supplier_price_lists"]["Row"];
type PriceItemRow =
  Database["public"]["Tables"]["supplier_price_list_items"]["Row"];
export type SupplierPurchasableProductPriceSeriesListSnapshot = PriceListRow;
export type SupplierPurchasableProductPriceSeriesItemSnapshot = Omit<
  PriceItemRow,
  "minimum_quantity" | "maximum_quantity" | "base_unit_conversion" |
    "unit_price" | "tax_rate"
> & {
  minimum_quantity: string;
  maximum_quantity: string | null;
  base_unit_conversion: string;
  unit_price: string;
  tax_rate: string;
};
export type PriceListSnapshot = Pick<PriceListRow,
  "id" | "tenant_id" | "tenant_supplier_id" | "supplier_id" |
  "price_list_code" | "currency" | "lifecycle_status" | "row_version" |
  "effective_from" | "effective_until" | "acting_tenant_id" |
  "acting_employee_id" | "updated_by_employee_id" | "updated_at">;

export type SupplierPurchasableProductSmokeScope = {
  tenantId: string;
  tenantSupplierId: string;
  supplierId: string;
};

export type SupplierPurchasableProductCatalogQuery = {
  tenantId: string;
  tenantSupplierId: string;
  productId: string;
  skuId: string;
  keyword: string;
  page: 1;
  pageSize: 1;
};

export type SupplierPurchasableProductResidualScope =
  SupplierPurchasableProductSmokeScope & {
    actorUserId: string;
    productIds: readonly string[];
    skuIds: readonly string[];
    parentKeys: readonly string[];
    newPriceListId: string | null;
    newPriceItemId: string | null;
    limit: 1;
  };

export type SupplierPurchasableProductPriceSeriesSnapshot = {
  lists: readonly PriceListRow[];
  items: readonly SupplierPurchasableProductPriceSeriesItemSnapshot[];
};

export type SupplierPurchasableProductSmokeQuery = <Rows extends unknown[]>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => PromiseLike<Rows>;

export type SupplierPurchasableProductResidualEvidence = Record<
  "products" | "skus" | "priceLists" | "priceItems" | "events",
  boolean
>;

export type SupplierPurchasableProductSmokeTransaction = {
  command(input: SupplierPurchasableProductCommandInput): Promise<unknown>;
  resolveCatalog(
    query: SupplierPurchasableProductCatalogQuery,
  ): Promise<unknown>;
  expectIdempotencyConflict(
    input: SupplierPurchasableProductCommandInput,
  ): Promise<string>;
  snapshotPublishedPriceList(
    scope: SupplierPurchasableProductSmokeScope,
  ): Promise<PriceListSnapshot | null>;
  snapshotPriceSeries(
    scope: SupplierPurchasableProductSmokeScope,
  ): Promise<SupplierPurchasableProductPriceSeriesSnapshot>;
  inspectResiduals(
    scope: SupplierPurchasableProductResidualScope,
  ): Promise<SupplierPurchasableProductResidualEvidence>;
};

export type SupplierPurchasableProductSmokeGateway = {
  begin<Result>(
    callback: (
      transaction: SupplierPurchasableProductSmokeTransaction,
    ) => Promise<Result>,
  ): Promise<Result>;
  snapshotPublishedPriceList(
    scope: SupplierPurchasableProductSmokeScope,
  ): Promise<PriceListSnapshot | null>;
  inspectResiduals(
    scope: SupplierPurchasableProductResidualScope,
  ): Promise<SupplierPurchasableProductResidualEvidence>;
  close(): Promise<void>;
};

type CommandSql = Bun.SQL | TransactionSQL | SavepointSQL;
type EvidenceSql = Bun.SQL | TransactionSQL;

export async function querySupplierPurchasableProductPriceSeriesSnapshot(
  sql: SupplierPurchasableProductSmokeQuery,
  scope: SupplierPurchasableProductSmokeScope,
): Promise<SupplierPurchasableProductPriceSeriesSnapshot> {
  const lists = await sql<PriceListRow[]>`
    select id, tenant_id, tenant_supplier_id, supplier_id, price_list_code,
      name, currency, scope_type, version_number, lifecycle_status,
      effective_from::text as effective_from,
      effective_until::text as effective_until,
      supersedes_price_list_id, row_version, acting_tenant_id,
      acting_employee_id, operation_source, proxy_reason,
      created_by_employee_id, updated_by_employee_id,
      created_at::text as created_at, updated_at::text as updated_at,
      published_at::text as published_at
    from public.supplier_price_lists
    where tenant_id = ${scope.tenantId}::uuid
      and tenant_supplier_id = ${scope.tenantSupplierId}::uuid
      and supplier_id = ${scope.supplierId}::uuid
      and upper(btrim(price_list_code)) = 'DEFAULT'
      and scope_type = 'default' and currency = 'CNY'
    order by version_number, id limit ${PRICE_SERIES_ROW_LIMIT + 1};
  `;
  if (lists.length > PRICE_SERIES_ROW_LIMIT) {
    throw new Error("SMOKE_PRICE_SERIES_TOO_LARGE");
  }
  const items = await sql<SupplierPurchasableProductPriceSeriesItemSnapshot[]>`
    select item.id, item.tenant_id, item.supplier_id,
      item.supplier_price_list_id, item.supplier_product_id,
      item.supplier_sku_id, item.minimum_quantity::text as minimum_quantity,
      item.maximum_quantity::text as maximum_quantity,
      item.purchase_unit_id, item.base_unit_id,
      item.base_unit_conversion::text as base_unit_conversion,
      item.unit_price::text as unit_price, item.tax_rate::text as tax_rate,
      item.tax_inclusive,
      item.acting_tenant_id, item.acting_employee_id, item.operation_source,
      item.proxy_reason, item.created_by_employee_id,
      item.updated_by_employee_id, item.created_at::text as created_at,
      item.updated_at::text as updated_at
    from public.supplier_price_list_items as item
    join public.supplier_price_lists as series
      on series.id = item.supplier_price_list_id
    where series.tenant_id = ${scope.tenantId}::uuid
      and series.tenant_supplier_id = ${scope.tenantSupplierId}::uuid
      and series.supplier_id = ${scope.supplierId}::uuid
      and upper(btrim(series.price_list_code)) = 'DEFAULT'
      and series.scope_type = 'default' and series.currency = 'CNY'
    order by item.id limit ${PRICE_SERIES_ROW_LIMIT + 1};
  `;
  if (items.length > PRICE_SERIES_ROW_LIMIT) {
    throw new Error("SMOKE_PRICE_SERIES_TOO_LARGE");
  }
  return { lists, items };
}

export class DirectSupplierPurchasableProductSmokeGateway
  implements SupplierPurchasableProductSmokeGateway {
  private readonly database: Bun.SQL;

  constructor(databaseUrl: string) {
    this.database = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  }

  begin<Result>(
    callback: (
      transaction: SupplierPurchasableProductSmokeTransaction,
    ) => Promise<Result>,
  ): Promise<Result> {
    return this.database.begin((transaction) =>
      callback(this.createTransaction(transaction as TransactionSQL))
    );
  }

  private createTransaction(
    sql: TransactionSQL,
  ): SupplierPurchasableProductSmokeTransaction {
    return {
      command: (input) => this.command(sql, input),
      resolveCatalog: (query) => this.resolveCatalog(sql, query),
      expectIdempotencyConflict: (input) =>
        this.expectIdempotencyConflict(sql, input),
      snapshotPublishedPriceList: (scope) =>
        this.queryPublishedPriceList(sql, scope),
      snapshotPriceSeries: (scope) =>
        querySupplierPurchasableProductPriceSeriesSnapshot(sql, scope),
      inspectResiduals: (scope) => this.queryResiduals(sql, scope),
    };
  }

  private async command(
    sql: CommandSql,
    input: SupplierPurchasableProductCommandInput,
  ): Promise<unknown> {
    const rows = await sql<{ result: unknown }[]>`
      select public.command_supplier_purchasable_product_v1(
        ${input.product_id}::uuid, ${input.sku_id}::uuid,
        ${input.tenant_id}::uuid, ${input.tenant_supplier_id}::uuid,
        ${input.supplier_id}::uuid, ${JSON.stringify(input.product)}::jsonb,
        ${JSON.stringify(input.sku)}::jsonb, ${JSON.stringify(input.price)}::jsonb,
        ${input.actor_user_id}::uuid, ${input.actor_employee_id}::uuid,
        ${input.idempotency_key}::text
      ) as result;
    `;
    return rows[0]?.result;
  }

  private async resolveCatalog(
    sql: TransactionSQL,
    query: SupplierPurchasableProductCatalogQuery,
  ): Promise<unknown> {
    const rows = await sql<{ result: unknown }[]>`
      select public.resolve_supplier_purchase_order_catalog(
        ${query.tenantId}::uuid, ${query.tenantSupplierId}::uuid,
        transaction_timestamp(), ${query.keyword}::text,
        ${query.page}::integer, ${query.pageSize}::integer
      ) as result;
    `;
    return rows[0]?.result;
  }

  private async expectIdempotencyConflict(
    sql: TransactionSQL,
    input: SupplierPurchasableProductCommandInput,
  ): Promise<string> {
    try {
      await sql.savepoint((savepoint) => this.command(savepoint, input));
    } catch (error) {
      if (
        error instanceof Bun.SQL.PostgresError && error.errno === "P0001" &&
        error.message === CONFLICT_CODE
      ) return CONFLICT_CODE;
      throw error;
    }
    throw new Error("SMOKE_CONFLICT_NOT_REJECTED");
  }

  private async queryPublishedPriceList(
    sql: EvidenceSql,
    scope: SupplierPurchasableProductSmokeScope,
  ): Promise<PriceListSnapshot | null> {
    const rows = await sql<PriceListSnapshot[]>`
      select id, tenant_id, tenant_supplier_id, supplier_id,
        price_list_code, currency, lifecycle_status, row_version,
        effective_from::text, effective_until::text, acting_tenant_id,
        acting_employee_id, updated_by_employee_id, updated_at::text
      from public.supplier_price_lists
      where tenant_id = ${scope.tenantId}::uuid
        and tenant_supplier_id = ${scope.tenantSupplierId}::uuid
        and supplier_id = ${scope.supplierId}::uuid
        and upper(btrim(price_list_code)) = 'DEFAULT'
        and scope_type = 'default' and currency = 'CNY'
        and lifecycle_status = 'published'
      order by id limit 2;
    `;
    if (rows.length > 1) {
      throw new Error("SMOKE_PUBLISHED_BASELINE_AMBIGUOUS");
    }
    return rows[0] ?? null;
  }

  private async queryResiduals(
    sql: EvidenceSql,
    scope: SupplierPurchasableProductResidualScope,
  ): Promise<SupplierPurchasableProductResidualEvidence> {
    const productA = scope.productIds[0];
    const productB = scope.productIds[1] ?? productA;
    const skuA = scope.skuIds[0];
    const skuB = scope.skuIds[1] ?? skuA;
    const parentA = scope.parentKeys[0];
    const parentB = scope.parentKeys[1] ?? parentA;
    if (!productA || !skuA || !parentA || scope.limit !== 1) {
      throw new Error("SMOKE_RESIDUAL_SCOPE_INVALID");
    }
    const rows = await sql<SupplierPurchasableProductResidualEvidence[]>`
      select exists(select 1 from public.supplier_products
          where owner_tenant_id = ${scope.tenantId}::uuid
            and id in (${productA}::uuid, ${productB}::uuid) limit 1) products,
        exists(select 1 from public.supplier_skus
          where owner_tenant_id = ${scope.tenantId}::uuid
            and id in (${skuA}::uuid, ${skuB}::uuid) limit 1) skus,
        exists(select 1 from public.supplier_price_lists
          where tenant_id = ${scope.tenantId}::uuid
            and tenant_supplier_id = ${scope.tenantSupplierId}::uuid
            and supplier_id = ${scope.supplierId}::uuid
            and ${scope.newPriceListId}::uuid is not null
            and id = ${scope.newPriceListId}::uuid limit 1) "priceLists",
        exists(select 1 from public.supplier_price_list_items
          where tenant_id = ${scope.tenantId}::uuid
            and supplier_id = ${scope.supplierId}::uuid
            and ((${scope.newPriceListId}::uuid is not null
                and supplier_price_list_id = ${scope.newPriceListId}::uuid)
              or (${scope.newPriceItemId}::uuid is not null
                and id = ${scope.newPriceItemId}::uuid)
              or supplier_product_id in (${productA}::uuid, ${productB}::uuid)
              or supplier_sku_id in (${skuA}::uuid, ${skuB}::uuid)) limit 1
        ) "priceItems",
        exists(select 1 from public.supplier_command_events
          where tenant_id = ${scope.tenantId}::uuid
            and actor_user_id = ${scope.actorUserId}::uuid
            and (resource_id in (${productA}::uuid, ${productB}::uuid,
              ${skuA}::uuid, ${skuB}::uuid)
              or (${scope.newPriceListId}::uuid is not null
                and resource_id = ${scope.newPriceListId}::uuid)
              or (${scope.newPriceItemId}::uuid is not null
                and resource_id = ${scope.newPriceItemId}::uuid)
              or idempotency_key = ${parentA}
              or idempotency_key like ${`${parentA}:%`}
              or idempotency_key = ${parentB}
              or idempotency_key like ${`${parentB}:%`}) limit 1) events;
    `;
    return rows[0] ?? {
      products: true,
      skus: true,
      priceLists: true,
      priceItems: true,
      events: true,
    };
  }

  snapshotPublishedPriceList(scope: SupplierPurchasableProductSmokeScope) {
    return this.queryPublishedPriceList(this.database, scope);
  }

  inspectResiduals(scope: SupplierPurchasableProductResidualScope) {
    return this.queryResiduals(this.database, scope);
  }

  close(): Promise<void> {
    return this.database.close();
  }
}
