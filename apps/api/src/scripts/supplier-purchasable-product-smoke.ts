import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { z } from "zod";

import {
  sameLimitedDecimal,
  SupplierPurchasableCatalogItemRecordSchema,
  SupplierPurchasableProductCommandEnvelopeSchema,
  type SupplierPurchasableProductCreatedResult,
} from "@/repositories/supplier-purchasable-product-records";
import type { SupplierPurchasableProductCommandInput } from
  "@/repositories/supplier-purchasable-products";
import { runRollbackOnly } from "./supplier-purchase-fulfillment-smoke";
import {
  DirectSupplierPurchasableProductSmokeGateway,
  type PriceListSnapshot,
  type SupplierPurchasableProductCatalogQuery,
  type SupplierPurchasableProductResidualEvidence,
  type SupplierPurchasableProductResidualScope,
  type SupplierPurchasableProductSmokeGateway,
  type SupplierPurchasableProductSmokeTransaction,
} from "./supplier-purchasable-product-smoke-gateway";

export type { SupplierPurchasableProductCommandInput } from
  "@/repositories/supplier-purchasable-products";
export type {
  PriceListSnapshot,
  SupplierPurchasableProductResidualScope,
  SupplierPurchasableProductSmokeGateway,
  SupplierPurchasableProductSmokeTransaction,
} from "./supplier-purchasable-product-smoke-gateway";

const FAILURE_CODE = "SUPPLIER_PURCHASABLE_PRODUCT_SMOKE_FAILED";
const CONFLICT_CODE = "SUPPLIER_IDEMPOTENCY_CONFLICT";
const CREATE_FAILED_CODE = "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED";
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

function assertCreated(
  value: unknown,
  input: SupplierPurchasableProductCommandInput,
  expectedIdempotent: boolean,
): SupplierPurchasableProductCreatedResult {
  const parsed = SupplierPurchasableProductCommandEnvelopeSchema.safeParse(value);
  if (!parsed.success || parsed.data.status !== "created" ||
    parsed.data.idempotent !== expectedIdempotent) {
    throw new Error("SMOKE_CREATED_ENVELOPE_INVALID");
  }
  const result = parsed.data;
  const sameIdentity = [
    result.product.id === input.product_id,
    result.product.product_code === input.product.product_code,
    result.product.name === input.product.name,
    result.product.category_id === input.product.category_id,
    result.product.brand_id === input.product.brand_id,
    result.product.supplier_id === input.supplier_id,
    result.product.owner_tenant_id === input.tenant_id,
    result.product.acting_tenant_id === input.tenant_id,
    result.product.acting_employee_id === input.actor_employee_id,
    result.sku.id === input.sku_id,
    result.sku.sku_code === input.sku.sku_code,
    result.sku.name === input.sku.name,
    result.sku.purchase_unit_id === input.sku.purchase_unit_id,
    isDeepStrictEqual(result.sku.spec_values, input.sku.spec_values),
    result.sku.owner_tenant_id === input.tenant_id,
    result.sku.acting_tenant_id === input.tenant_id,
    result.sku.acting_employee_id === input.actor_employee_id,
    result.price.tenant_id === input.tenant_id,
    result.price.supplier_id === input.supplier_id,
    result.price.acting_tenant_id === input.tenant_id,
    result.price.acting_employee_id === input.actor_employee_id,
    sameLimitedDecimal(result.price.unit_price, input.price.unit_price),
    sameLimitedDecimal(result.price.tax_rate, input.price.tax_rate),
    result.price.tax_inclusive === input.price.tax_inclusive,
  ].every(Boolean);
  if (!sameIdentity) throw new Error("SMOKE_CREATED_IDENTITY_INVALID");
  return result;
}

function assertCatalog(
  value: unknown,
  query: SupplierPurchasableProductCatalogQuery,
  expected: SupplierPurchasableProductCreatedResult["catalog_item"],
) {
  const parsed = z.object({
    page: z.literal(1),
    page_size: z.literal(1),
    total: z.literal(1),
    items: z.tuple([SupplierPurchasableCatalogItemRecordSchema]),
  }).strict().safeParse(value);
  if (!parsed.success ||
    parsed.data.items[0].supplier_product_id !== query.productId ||
    parsed.data.items[0].supplier_sku_id !== query.skuId ||
    !isDeepStrictEqual(parsed.data.items[0], expected)) {
    throw new Error("SMOKE_CATALOG_INVALID");
  }
}

function assertPublishedIdentity(
  snapshot: PriceListSnapshot | null,
  result: SupplierPurchasableProductCreatedResult,
  config: SupplierPurchasableProductSmokeConfig,
) {
  if (!snapshot || snapshot.id !== result.price.supplier_price_list_id ||
    snapshot.tenant_id !== config.tenantId ||
    snapshot.tenant_supplier_id !== config.tenantSupplierId ||
    snapshot.supplier_id !== config.supplierId ||
    snapshot.price_list_code.trim().toUpperCase() !== "DEFAULT" ||
    snapshot.currency !== "CNY" || snapshot.lifecycle_status !== "published" ||
    snapshot.acting_tenant_id !== config.tenantId ||
    snapshot.acting_employee_id !== config.actorEmployeeId ||
    snapshot.updated_by_employee_id !== config.actorEmployeeId) {
    throw new Error("SMOKE_PUBLISHED_PRICE_LIST_INVALID");
  }
}

function assertNoResiduals(evidence: SupplierPurchasableProductResidualEvidence) {
  if (Object.values(evidence).some(Boolean)) {
    throw new Error("SMOKE_RESIDUAL_ROWS_FOUND");
  }
}

function parentKey(idempotencyKey: string) {
  const digest = createHash("md5").update(idempotencyKey.trim()).digest("hex");
  return `supplier-purchasable-product:${digest}`;
}

function createResidualScope(
  config: SupplierPurchasableProductSmokeConfig,
  fixture: ReturnType<typeof createSupplierPurchasableProductSmokeFixture>,
  result: SupplierPurchasableProductCreatedResult,
  baseline: PriceListSnapshot | null,
): SupplierPurchasableProductResidualScope {
  return {
    tenantId: config.tenantId,
    tenantSupplierId: config.tenantSupplierId,
    supplierId: config.supplierId,
    actorUserId: config.actorUserId,
    productIds: [fixture.created.product_id, fixture.invalid.product_id],
    skuIds: [fixture.created.sku_id, fixture.invalid.sku_id],
    parentKeys: [
      parentKey(fixture.created.idempotency_key),
      parentKey(fixture.invalid.idempotency_key),
    ],
    newPriceListId: result.price.supplier_price_list_id,
    newPriceItemId: result.price.id,
    previousPriceListId: baseline?.id ?? result.price.supplier_price_list_id,
    limit: 1,
  };
}

function invalidScope(
  scope: SupplierPurchasableProductResidualScope,
): SupplierPurchasableProductResidualScope {
  const invalidProductId = scope.productIds[1] as string;
  return {
    ...scope,
    productIds: [invalidProductId],
    skuIds: [scope.skuIds[1] as string],
    parentKeys: [scope.parentKeys[1] as string],
    newPriceListId: invalidProductId,
    newPriceItemId: invalidProductId,
    previousPriceListId: invalidProductId,
  };
}

export async function runSupplierPurchasableProductSmokeRollbackOnly<
  Transaction,
  Result,
>(
  executor: { begin<R>(callback: (transaction: Transaction) => Promise<R>): Promise<R> },
  callback: (transaction: Transaction) => Promise<Result>,
): Promise<Result> {
  try {
    return await runRollbackOnly(executor, callback);
  } catch (error) {
    if (error instanceof Error &&
      error.message === "transaction executor did not propagate the rollback sentinel") {
      throw new Error("SMOKE_ROLLBACK_NOT_OBSERVED");
    }
    throw error;
  }
}

export async function runSupplierPurchasableProductSmoke(
  config: SupplierPurchasableProductSmokeConfig,
  gateway: SupplierPurchasableProductSmokeGateway,
): Promise<SupplierPurchasableProductSmokeSummary> {
  const scope = {
    tenantId: config.tenantId,
    tenantSupplierId: config.tenantSupplierId,
    supplierId: config.supplierId,
  };
  const fixture = createSupplierPurchasableProductSmokeFixture(config);
  let rollbackScope: SupplierPurchasableProductResidualScope | null = null;
  try {
    const baseline = await gateway.snapshotPublishedPriceList(scope);
    await runSupplierPurchasableProductSmokeRollbackOnly(
      gateway,
      async (transaction) => {
        const first = assertCreated(
          await transaction.command(fixture.created), fixture.created, false,
        );
        assertPublishedIdentity(
          await transaction.snapshotPublishedPriceList(scope), first, config,
        );
        rollbackScope = createResidualScope(config, fixture, first, baseline);
        const catalogQuery: SupplierPurchasableProductCatalogQuery = {
          ...scope,
          productId: fixture.created.product_id,
          skuId: fixture.created.sku_id,
          keyword: fixture.created.sku.sku_code,
          page: 1,
          pageSize: 1,
        };
        assertCatalog(
          await transaction.resolveCatalog(catalogQuery),
          catalogQuery,
          first.catalog_item,
        );
        const replay = assertCreated(
          await transaction.command(fixture.created), fixture.created, true,
        );
        if (!isDeepStrictEqual({ ...first, idempotent: true }, replay)) {
          throw new Error("SMOKE_REPLAY_RESPONSE_MISMATCH");
        }
        const conflict = {
          ...fixture.created,
          price: { ...fixture.created.price, unit_price: "999.99" },
        };
        if (await transaction.expectIdempotencyConflict(conflict) !==
          CONFLICT_CODE) throw new Error("SMOKE_CONFLICT_NOT_REJECTED");
        const invalid = SupplierPurchasableProductCommandEnvelopeSchema.safeParse(
          await transaction.command(fixture.invalid),
        );
        if (!invalid.success || !isDeepStrictEqual(invalid.data, {
          status: "validation_error",
          idempotent: false,
          error_code: CREATE_FAILED_CODE,
          reason: "invalid_price",
        })) throw new Error("SMOKE_INVALID_PRICE_NOT_REJECTED");
        assertNoResiduals(
          await transaction.inspectResiduals(invalidScope(rollbackScope)),
        );
      },
    );
    if (!rollbackScope) throw new Error("SMOKE_ROLLBACK_SCOPE_MISSING");
    const after = await gateway.snapshotPublishedPriceList(scope);
    if (!isDeepStrictEqual(after, baseline)) {
      throw new Error("SMOKE_PUBLISHED_BASELINE_CHANGED");
    }
    assertNoResiduals(await gateway.inspectResiduals(rollbackScope));
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

export const sanitizeSupplierPurchasableProductSmokeError = (_error?: unknown) =>
  FAILURE_CODE;

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
    createGateway: (config) =>
      new DirectSupplierPurchasableProductSmokeGateway(config.databaseUrl),
    writeOutput: console.log,
    writeError: console.error,
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
