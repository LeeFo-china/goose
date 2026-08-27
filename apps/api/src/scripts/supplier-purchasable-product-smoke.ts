import { isDeepStrictEqual } from "node:util";
import type { SavepointSQL, TransactionSQL } from "bun";
import { z } from "zod";
import type { SupplierPurchasableProductCommandInput } from "@/repositories/supplier-purchasable-products";
export type { SupplierPurchasableProductCommandInput } from "@/repositories/supplier-purchasable-products";

const FAILURE_CODE = "SUPPLIER_PURCHASABLE_PRODUCT_SMOKE_FAILED";
const CONFLICT_CODE = "SUPPLIER_IDEMPOTENCY_CONFLICT";
const uuid = z.uuid().transform((value) => value.toLowerCase());
const SmokeEnvSchema = z.object({
  SUPABASE_DB_DIRECT_URL: z.string().min(1).refine((value) => {
    try {
      return ["postgres:", "postgresql:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }),
  SUPPLIER_PURCHASABLE_SMOKE_TENANT_ID: uuid,
  SUPPLIER_PURCHASABLE_SMOKE_TENANT_SUPPLIER_ID: uuid,
  SUPPLIER_PURCHASABLE_SMOKE_SUPPLIER_ID: uuid,
  SUPPLIER_PURCHASABLE_SMOKE_ACTOR_USER_ID: uuid,
  SUPPLIER_PURCHASABLE_SMOKE_ACTOR_EMPLOYEE_ID: uuid,
  SUPPLIER_PURCHASABLE_SMOKE_CATEGORY_ID: uuid,
  SUPPLIER_PURCHASABLE_SMOKE_BRAND_ID: uuid,
  SUPPLIER_PURCHASABLE_SMOKE_PURCHASE_UNIT_ID: uuid,
});
export type SupplierPurchasableProductSmokeConfig = {
  databaseUrl: string;
  tenantId: string;
  tenantSupplierId: string;
  supplierId: string;
  actorUserId: string;
  actorEmployeeId: string;
  categoryId: string;
  brandId: string;
  purchaseUnitId: string;
};
type CatalogQuery = {
  tenantId: string;
  tenantSupplierId: string;
  productId: string;
  skuId: string;
  keyword: string;
  page: 1;
  pageSize: 1;
};
type ResidualScope = {
  tenantId: string;
  actorUserId: string;
  productIds: readonly string[];
  skuIds: readonly string[];
  idempotencyKeys: readonly string[];
  priceListIds: readonly string[];
  priceItemIds: readonly string[];
  limit: 1;
};
type ResidualCounts = Record<
  "products" | "skus" | "prices" | "events",
  number
>;
export type SupplierPurchasableProductSmokeTransaction = {
  command(input: SupplierPurchasableProductCommandInput): Promise<unknown>;
  resolveCatalog(query: CatalogQuery): Promise<unknown>;
  expectIdempotencyConflict(
    input: SupplierPurchasableProductCommandInput,
  ): Promise<string>;
  countResiduals(scope: ResidualScope): Promise<ResidualCounts>;
};
export type SupplierPurchasableProductSmokeGateway = {
  withRollback<Result>(
    callback: (
      transaction: SupplierPurchasableProductSmokeTransaction,
    ) => Promise<Result>,
  ): Promise<Result>;
  countResiduals(scope: ResidualScope): Promise<ResidualCounts>;
  close(): Promise<void>;
};
export type SupplierPurchasableProductSmokeSummary = Record<
  "created" | "replay_idempotent" | "conflict_rejected" | "rollback_clean",
  true
>;
export function parseSupplierPurchasableProductSmokeEnv(
  env: Record<string, string | undefined>,
): SupplierPurchasableProductSmokeConfig {
  const parsed = SmokeEnvSchema.safeParse(env);
  if (!parsed.success) throw new Error("SMOKE_ENV_INVALID");
  return {
    databaseUrl: parsed.data.SUPABASE_DB_DIRECT_URL,
    tenantId: parsed.data.SUPPLIER_PURCHASABLE_SMOKE_TENANT_ID,
    tenantSupplierId:
      parsed.data.SUPPLIER_PURCHASABLE_SMOKE_TENANT_SUPPLIER_ID,
    supplierId: parsed.data.SUPPLIER_PURCHASABLE_SMOKE_SUPPLIER_ID,
    actorUserId: parsed.data.SUPPLIER_PURCHASABLE_SMOKE_ACTOR_USER_ID,
    actorEmployeeId:
      parsed.data.SUPPLIER_PURCHASABLE_SMOKE_ACTOR_EMPLOYEE_ID,
    categoryId: parsed.data.SUPPLIER_PURCHASABLE_SMOKE_CATEGORY_ID,
    brandId: parsed.data.SUPPLIER_PURCHASABLE_SMOKE_BRAND_ID,
    purchaseUnitId:
      parsed.data.SUPPLIER_PURCHASABLE_SMOKE_PURCHASE_UNIT_ID,
  };
}
function createCommand(
  config: SupplierPurchasableProductSmokeConfig,
  productId: string,
  skuId: string,
  idempotencyKey: string,
  unitPrice: string,
): SupplierPurchasableProductCommandInput {
  const productToken = productId.replaceAll("-", "").slice(0, 16);
  const skuToken = skuId.replaceAll("-", "").slice(0, 16);
  return {
    product_id: productId,
    sku_id: skuId,
    tenant_id: config.tenantId,
    tenant_supplier_id: config.tenantSupplierId,
    supplier_id: config.supplierId,
    product: {
      product_code: `TP-${productToken}`,
      name: `Purchasable smoke ${productToken}`,
      category_id: config.categoryId,
      brand_id: config.brandId,
    },
    sku: {
      sku_code: `TS-${skuToken}`,
      name: `Purchasable smoke SKU ${skuToken}`,
      purchase_unit_id: config.purchaseUnitId,
      spec_values: { smoke_token: skuToken },
    },
    price: { unit_price: unitPrice, tax_rate: "0.130000", tax_inclusive: true },
    actor_user_id: config.actorUserId,
    actor_employee_id: config.actorEmployeeId,
    idempotency_key: idempotencyKey,
  };
}
export function createSupplierPurchasableProductSmokeFixture(
  config: SupplierPurchasableProductSmokeConfig,
) {
  const runId = crypto.randomUUID();
  const priceCents = (Number.parseInt(runId.slice(0, 4), 16) % 90) + 10;
  const created = createCommand(
    config,
    crypto.randomUUID(),
    crypto.randomUUID(),
    `supplier-purchasable-smoke:${runId}`,
    `100.${priceCents}`,
  );
  const invalid = createCommand(
    config,
    crypto.randomUUID(),
    crypto.randomUUID(),
    `supplier-purchasable-smoke-invalid:${crypto.randomUUID()}`,
    "0",
  );
  return { created, invalid };
}
const CreatedSchema = z.object({
  status: z.literal("created"),
  idempotent: z.boolean(),
  product: z.object({ id: uuid }).passthrough(),
  sku: z.object({ id: uuid, supplier_product_id: uuid }).passthrough(),
  price: z.object({
    id: uuid,
    supplier_price_list_id: uuid,
    supplier_product_id: uuid,
    supplier_sku_id: uuid,
  }).passthrough(),
  catalog_item: z.object({
    supplier_product_id: uuid,
    supplier_sku_id: uuid,
    supplier_price_list_id: uuid,
    supplier_price_list_item_id: uuid,
  }).passthrough(),
}).passthrough();
const InvalidPriceSchema = z.object({
  status: z.literal("validation_error"),
  idempotent: z.literal(false),
  error_code: z.literal("SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED"),
  reason: z.literal("invalid_price"),
}).passthrough();
function assertCreated(
  value: unknown,
  input: SupplierPurchasableProductCommandInput,
  expectedIdempotent: boolean,
) {
  const parsed = CreatedSchema.safeParse(value);
  if (!parsed.success || parsed.data.idempotent !== expectedIdempotent) {
    throw new Error("SMOKE_CREATED_ENVELOPE_INVALID");
  }
  const result = parsed.data;
  if (
    result.product.id !== input.product_id || result.sku.id !== input.sku_id ||
    result.sku.supplier_product_id !== input.product_id ||
    result.price.supplier_product_id !== input.product_id ||
    result.price.supplier_sku_id !== input.sku_id ||
    result.catalog_item.supplier_product_id !== input.product_id ||
    result.catalog_item.supplier_sku_id !== input.sku_id ||
    result.catalog_item.supplier_price_list_id !==
      result.price.supplier_price_list_id ||
    result.catalog_item.supplier_price_list_item_id !== result.price.id
  ) throw new Error("SMOKE_CREATED_IDENTITY_INVALID");
  return result;
}
function assertCatalog(value: unknown, query: CatalogQuery) {
  const parsed = z.object({
    page: z.literal(1),
    page_size: z.literal(1),
    total: z.literal(1),
    items: z.tuple([z.object({
      supplier_product_id: uuid,
      supplier_sku_id: uuid,
    }).passthrough()]),
  }).safeParse(value);
  if (
    !parsed.success ||
    parsed.data.items[0].supplier_product_id !== query.productId ||
    parsed.data.items[0].supplier_sku_id !== query.skuId
  ) throw new Error("SMOKE_CATALOG_INVALID");
}
function assertZeroResiduals(counts: ResidualCounts) {
  if (Object.values(counts).some((count) => count !== 0)) {
    throw new Error("SMOKE_RESIDUAL_ROWS_FOUND");
  }
}
export async function runSupplierPurchasableProductSmoke(
  config: SupplierPurchasableProductSmokeConfig,
  gateway: SupplierPurchasableProductSmokeGateway,
): Promise<SupplierPurchasableProductSmokeSummary> {
  const fixture = createSupplierPurchasableProductSmokeFixture(config);
  const invalidScope: ResidualScope = {
    tenantId: config.tenantId,
    actorUserId: config.actorUserId,
    productIds: [fixture.invalid.product_id],
    skuIds: [fixture.invalid.sku_id],
    idempotencyKeys: [fixture.invalid.idempotency_key],
    priceListIds: [],
    priceItemIds: [],
    limit: 1,
  };
  const rollbackScope: ResidualScope = {
    tenantId: config.tenantId,
    actorUserId: config.actorUserId,
    productIds: [fixture.created.product_id, fixture.invalid.product_id],
    skuIds: [fixture.created.sku_id, fixture.invalid.sku_id],
    idempotencyKeys: [
      fixture.created.idempotency_key,
      fixture.invalid.idempotency_key,
    ],
    priceListIds: [],
    priceItemIds: [],
    limit: 1,
  };
  try {
    await gateway.withRollback(async (transaction) => {
      const first = assertCreated(
        await transaction.command(fixture.created),
        fixture.created,
        false,
      );
      rollbackScope.priceListIds = [first.price.supplier_price_list_id];
      rollbackScope.priceItemIds = [first.price.id];
      const catalogQuery: CatalogQuery = {
        tenantId: config.tenantId,
        tenantSupplierId: config.tenantSupplierId,
        productId: fixture.created.product_id,
        skuId: fixture.created.sku_id,
        keyword: fixture.created.sku.sku_code,
        page: 1,
        pageSize: 1,
      };
      assertCatalog(await transaction.resolveCatalog(catalogQuery), catalogQuery);
      const replay = assertCreated(
        await transaction.command(fixture.created),
        fixture.created,
        true,
      );
      if (!isDeepStrictEqual({ ...first, idempotent: true }, replay)) {
        throw new Error("SMOKE_REPLAY_RESPONSE_MISMATCH");
      }
      const conflict = {
        ...fixture.created,
        price: { ...fixture.created.price, unit_price: "999.99" },
      };
      if (await transaction.expectIdempotencyConflict(conflict) !== CONFLICT_CODE) {
        throw new Error("SMOKE_CONFLICT_NOT_REJECTED");
      }
      const invalid = await transaction.command(fixture.invalid);
      if (!InvalidPriceSchema.safeParse(invalid).success) {
        throw new Error("SMOKE_INVALID_PRICE_NOT_REJECTED");
      }
      assertZeroResiduals(await transaction.countResiduals(invalidScope));
    });
    assertZeroResiduals(await gateway.countResiduals(rollbackScope));
    return {
      created: true,
      replay_idempotent: true,
      conflict_rejected: true,
      rollback_clean: true,
    };
  } finally {
    await gateway.close();
  }
}
type CommandSql = Bun.SQL | TransactionSQL | SavepointSQL;
class RollbackSentinel extends Error {}
type TransactionExecutor<Transaction> = {
  begin<Result>(
    callback: (transaction: Transaction) => Promise<Result>,
  ): Promise<Result>;
};
export async function runSupplierPurchasableProductSmokeRollbackOnly<
  Transaction,
  Result,
>(
  executor: TransactionExecutor<Transaction>,
  callback: (transaction: Transaction) => Promise<Result>,
): Promise<Result> {
  const sentinel = new RollbackSentinel();
  let result: Result | undefined;
  let callbackCompleted = false;
  let callbackFailed = false;
  let callbackFailure: unknown;
  try {
    await executor.begin(async (transaction) => {
      try {
        result = await callback(transaction);
        callbackCompleted = true;
      } catch (error) {
        callbackFailed = true;
        callbackFailure = error;
      }
      throw sentinel;
    });
  } catch (error) {
    if (error !== sentinel) throw error;
  }
  if (callbackFailed) throw callbackFailure;
  if (!callbackCompleted) throw new Error("SMOKE_ROLLBACK_NOT_OBSERVED");
  return result as Result;
}
class DirectPostgresGateway implements SupplierPurchasableProductSmokeGateway {
  private readonly database: Bun.SQL;
  constructor(databaseUrl: string) {
    this.database = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  }
  async withRollback<Result>(
    callback: (
      transaction: SupplierPurchasableProductSmokeTransaction,
    ) => Promise<Result>,
  ): Promise<Result> {
    return runSupplierPurchasableProductSmokeRollbackOnly(
      this.database,
      (rawTransaction) => callback(this.createTransaction(
        rawTransaction as unknown as TransactionSQL,
      )),
    );
  }
  private createTransaction(sql: TransactionSQL):
    SupplierPurchasableProductSmokeTransaction {
    return {
      command: (input) => this.command(sql, input),
      resolveCatalog: (query) => this.resolveCatalog(sql, query),
      expectIdempotencyConflict: (input) =>
        this.expectIdempotencyConflict(sql, input),
      countResiduals: (scope) => this.queryResiduals(sql, scope),
    };
  }
  private async command(sql: CommandSql,
    input: SupplierPurchasableProductCommandInput,
  ) {
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
  private async resolveCatalog(sql: TransactionSQL, query: CatalogQuery) {
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
  private async queryResiduals(sql: Bun.SQL | TransactionSQL, scope: ResidualScope) {
    const productA = scope.productIds[0];
    const productB = scope.productIds[1] ?? productA;
    const skuA = scope.skuIds[0];
    const skuB = scope.skuIds[1] ?? skuA;
    const keyA = scope.idempotencyKeys[0];
    const keyB = scope.idempotencyKeys[1] ?? keyA;
    const priceListId = scope.priceListIds[0] ?? productA;
    const priceItemId = scope.priceItemIds[0] ?? productA;
    if (!productA || !skuA || !keyA || scope.limit !== 1) {
      throw new Error("SMOKE_RESIDUAL_SCOPE_INVALID");
    }
    const rows = await sql<ResidualCounts[]>`
      with product_hits as (
        select 1 from public.supplier_products
        where owner_tenant_id = ${scope.tenantId}::uuid
          and id in (${productA}::uuid, ${productB}::uuid) limit ${scope.limit}
      ), sku_hits as (
        select 1 from public.supplier_skus
        where owner_tenant_id = ${scope.tenantId}::uuid
          and id in (${skuA}::uuid, ${skuB}::uuid) limit ${scope.limit}
      ), price_hits as (
        select 1 from public.supplier_price_list_items
        where tenant_id = ${scope.tenantId}::uuid
          and (id = ${priceItemId}::uuid
            or supplier_product_id in (${productA}::uuid, ${productB}::uuid)
            or supplier_sku_id in (${skuA}::uuid, ${skuB}::uuid))
        limit ${scope.limit}
      ), price_list_hits as (
        select 1 from public.supplier_price_lists
        where tenant_id = ${scope.tenantId}::uuid
          and id = ${priceListId}::uuid limit ${scope.limit}
      ), event_hits as (
        select 1 from public.supplier_command_events
        where tenant_id = ${scope.tenantId}::uuid
          and actor_user_id = ${scope.actorUserId}::uuid
          and (resource_id in (${productA}::uuid, ${productB}::uuid)
            or idempotency_key in (
              'supplier-purchasable-product:' || md5(btrim(${keyA}::text)),
              'supplier-purchasable-product:' || md5(btrim(${keyB}::text))
            )) limit ${scope.limit}
      )
      select (select count(*)::integer from product_hits) as products,
        (select count(*)::integer from sku_hits) as skus,
        ((select count(*) from price_hits) +
          (select count(*) from price_list_hits))::integer as prices,
        (select count(*)::integer from event_hits) as events;
    `;
    return rows[0] ?? { products: -1, skus: -1, prices: -1, events: -1 };
  }
  countResiduals(scope: ResidualScope) {
    return this.queryResiduals(this.database, scope);
  }
  close() {
    return this.database.close();
  }
}
export const sanitizeSupplierPurchasableProductSmokeError = (
  _error?: unknown,
) => FAILURE_CODE;
type CliOptions = {
  env: Record<string, string | undefined>;
  createGateway(config: SupplierPurchasableProductSmokeConfig):
    SupplierPurchasableProductSmokeGateway;
  writeOutput(message: string): void;
  writeError(message: string): void;
};
export async function runSupplierPurchasableProductSmokeCli(
  options: CliOptions,
): Promise<0 | 1> {
  try {
    const config = parseSupplierPurchasableProductSmokeEnv(options.env);
    const result = await runSupplierPurchasableProductSmoke(
      config,
      options.createGateway(config),
    );
    options.writeOutput(JSON.stringify(result));
    return 0;
  } catch (error) {
    options.writeError(sanitizeSupplierPurchasableProductSmokeError(error));
    return 1;
  }
}
if (import.meta.main) {
  void runSupplierPurchasableProductSmokeCli({
    env: process.env,
    createGateway: (config) => new DirectPostgresGateway(config.databaseUrl),
    writeOutput: console.log,
    writeError: console.error,
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
