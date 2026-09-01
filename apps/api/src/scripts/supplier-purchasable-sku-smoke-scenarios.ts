import { isDeepStrictEqual } from "node:util";
import type { TransactionSQL } from "bun";

import {
  SupplierPurchasableSkuCommandFailureSchema,
  SupplierPurchasableSkuCommandResultSchema,
  type SupplierPurchasableSkuCommandResult,
} from "@/repositories/supplier-purchasable-sku-records";
import type { SupplierPurchasableSkuSaveInput } from
  "@/repositories/supplier-purchasable-skus";
import type { SupplierPurchasableSkuSmokeEvidence } from
  "./supplier-purchasable-sku-smoke";
import type { SupplierPurchasableSkuSmokeFixture } from
  "./supplier-purchasable-sku-smoke-fixture";
import {
  addMultiItemSourceFixture,
  commandSupplierPurchasableSku,
  countSupplierPriceVersions,
  createFutureSupplierPriceVersion,
  createSupplierPurchasableSkuSmokeCommand,
  getSupplierPurchasableSkuSmokeContext,
  getSupplierPurchasableSkuSmokeVersion,
  resolveSupplierPurchasableSkuCatalog,
  snapshotFutureSupplierPrice,
  snapshotSupplierPriceItem,
  snapshotSupplierPriceSeries,
} from "./supplier-purchasable-sku-smoke-queries";

const IDEMPOTENCY_CONFLICT = "SUPPLIER_IDEMPOTENCY_CONFLICT";

function saved(
  value: unknown,
  priceVersionCreated: boolean,
  idempotent = false,
): SupplierPurchasableSkuCommandResult {
  const parsed = SupplierPurchasableSkuCommandResultSchema.safeParse(value);
  if (!parsed.success || parsed.data.price_version_created !== priceVersionCreated ||
    parsed.data.idempotent !== idempotent) {
    throw new Error("SMOKE_SAVED_RESULT_INVALID");
  }
  return parsed.data;
}

function failure(value: unknown, errorCode: string, status?: string): void {
  const parsed = SupplierPurchasableSkuCommandFailureSchema.safeParse(value);
  if (!parsed.success || parsed.data.error_code !== errorCode ||
    (status && parsed.data.status !== status)) {
    throw new Error("SMOKE_FAILURE_RESULT_INVALID");
  }
}

async function commandWithTimeout(
  database: Bun.SQL,
  input: SupplierPurchasableSkuSaveInput,
): Promise<unknown> {
  return database.begin(async (transaction) => {
    await transaction`set local lock_timeout = '10s'`.simple();
    await transaction`set local statement_timeout = '20s'`.simple();
    return commandSupplierPurchasableSku(
      transaction as unknown as TransactionSQL,
      input,
    );
  });
}

async function assertIdempotencyConflict(
  database: Bun.SQL,
  input: SupplierPurchasableSkuSaveInput,
): Promise<void> {
  try {
    await commandWithTimeout(database, input);
  } catch (error) {
    if (error instanceof Bun.SQL.PostgresError && error.errno === "P0001" &&
      error.message === IDEMPOTENCY_CONFLICT) return;
    throw error;
  }
  throw new Error("SMOKE_IDEMPOTENCY_CONFLICT_NOT_RAISED");
}

async function verifyCreateEditReplay(
  database: Bun.SQL,
  fixture: SupplierPurchasableSkuSmokeFixture,
) {
  const createInput = createSupplierPurchasableSkuSmokeCommand(fixture, {
    action: "create",
    unitPrice: "100.00",
    idempotencyKey: `task8:${fixture.token}:create`,
  });
  const created = saved(await commandWithTimeout(database, createInput), true);
  if (created.product.status !== "active" || created.sku.status !== "active" ||
    created.current_price.tax_inclusive !== false ||
    created.current_price.unit_price !== "100.00") {
    throw new Error("SMOKE_CREATE_STATE_INVALID");
  }
  const catalog = await resolveSupplierPurchasableSkuCatalog(
    database,
    fixture,
    created.sku.sku_code,
  ) as { total?: unknown; items?: unknown[] };
  if (catalog?.total !== 1 || catalog.items?.length !== 1) {
    throw new Error("SMOKE_RESOLVER_TOTAL_INVALID");
  }

  const priorItem = await snapshotSupplierPriceItem(
    database,
    created.current_price.supplier_price_list_item_id,
  );
  const editInput = createSupplierPurchasableSkuSmokeCommand(fixture, {
    action: "update",
    expectedSkuVersion: created.sku.version,
    expectedPriceListId: created.current_price.supplier_price_list_id,
    expectedPriceListVersion:
      created.current_price.supplier_price_list_row_version,
    unitPrice: "110.00",
    idempotencyKey: `task8:${fixture.token}:edit`,
  });
  const edited = saved(await commandWithTimeout(database, editInput), true);
  if (edited.current_price.supplier_price_list_id ===
      created.current_price.supplier_price_list_id ||
    !isDeepStrictEqual(priorItem, await snapshotSupplierPriceItem(
      database,
      created.current_price.supplier_price_list_item_id,
    ))) {
    throw new Error("SMOKE_PRIOR_PRICE_ITEM_MUTATED");
  }

  const versionsBeforeNoop = await countSupplierPriceVersions(database, fixture);
  const noopInput = createSupplierPurchasableSkuSmokeCommand(fixture, {
    action: "update",
    expectedSkuVersion: edited.sku.version,
    expectedPriceListId: edited.current_price.supplier_price_list_id,
    expectedPriceListVersion:
      edited.current_price.supplier_price_list_row_version,
    sku: { name: `task8-${fixture.token}-metadata` },
    unitPrice: "110.00",
    idempotencyKey: `task8:${fixture.token}:metadata`,
  });
  const noop = saved(await commandWithTimeout(database, noopInput), false);
  if (await countSupplierPriceVersions(database, fixture) !== versionsBeforeNoop) {
    throw new Error("SMOKE_METADATA_CREATED_PRICE_VERSION");
  }
  const beforeReplay = await snapshotSupplierPriceSeries(database, fixture);
  const replay = saved(await commandWithTimeout(database, noopInput), false, true);
  if (replay.sku.version !== noop.sku.version || !isDeepStrictEqual(
    beforeReplay,
    await snapshotSupplierPriceSeries(database, fixture),
  )) throw new Error("SMOKE_REPLAY_DUPLICATED_ROWS");
  await assertIdempotencyConflict(database, {
    ...noopInput,
    sku: { name: `task8-${fixture.token}-different` },
  });
  return { created, edited, noop };
}

async function verifyConcurrency(
  database: Bun.SQL,
  fixture: SupplierPurchasableSkuSmokeFixture,
) {
  const context = await getSupplierPurchasableSkuSmokeContext(database, fixture);
  const current = context.current_price;
  if (!current) throw new Error("SMOKE_CONCURRENCY_PRICE_MISSING");
  const skuVersion = await getSupplierPurchasableSkuSmokeVersion(
    database,
    fixture.skuId,
  );
  const input = (suffix: "a" | "b", price: string) =>
    createSupplierPurchasableSkuSmokeCommand(fixture, {
      action: "update",
      expectedSkuVersion: skuVersion,
      expectedPriceListId: current.supplier_price_list_id,
      expectedPriceListVersion: current.supplier_price_list_row_version,
      sku: { name: `task8-${fixture.token}-concurrent-${suffix}` },
      unitPrice: price,
      idempotencyKey: `task8:${fixture.token}:concurrent:${suffix}`,
    });
  const results = await Promise.all([
    commandWithTimeout(database, input("a", "120.00")),
    commandWithTimeout(database, input("b", "121.00")),
  ]);
  const successes = results.filter((value) =>
    SupplierPurchasableSkuCommandResultSchema.safeParse(value).success
  );
  const conflicts = results.filter((value) => {
    const parsed = SupplierPurchasableSkuCommandFailureSchema.safeParse(value);
    return parsed.success && parsed.data.status === "version_conflict" &&
      ["SUPPLIER_SKU_VERSION_CONFLICT", "SUPPLIER_PRICE_LIST_VERSION_CONFLICT"]
        .includes(parsed.data.error_code);
  });
  if (successes.length !== 1 || conflicts.length !== 1) {
    throw new Error("SMOKE_CONCURRENCY_RESULT_INVALID");
  }
  return { successes: 1, conflicts: 1 } as const;
}

async function verifyFutureBoundaries(
  database: Bun.SQL,
  fixture: SupplierPurchasableSkuSmokeFixture,
): Promise<void> {
  const beforeFuture = await getSupplierPurchasableSkuSmokeContext(
    database,
    fixture,
  );
  if (!beforeFuture.current_price) throw new Error("SMOKE_FUTURE_SOURCE_MISSING");
  await database.begin(async (transaction) => {
    await createFutureSupplierPriceVersion(
      transaction as unknown as TransactionSQL,
      fixture,
      beforeFuture.current_price!.supplier_price_list_id,
    );
  });
  const futureSnapshot = await snapshotFutureSupplierPrice(database, fixture);
  const context = await getSupplierPurchasableSkuSmokeContext(database, fixture);
  if (!context.current_price || context.next_scheduled_effective_from === null) {
    throw new Error("SMOKE_FUTURE_CONTEXT_INVALID");
  }
  const futureEdit = createSupplierPurchasableSkuSmokeCommand(fixture, {
    action: "update",
    expectedSkuVersion: await getSupplierPurchasableSkuSmokeVersion(
      database,
      fixture.skuId,
    ),
    expectedPriceListId: context.current_price.supplier_price_list_id,
    expectedPriceListVersion: context.current_price.supplier_price_list_row_version,
    unitPrice: "130.00",
    idempotencyKey: `task8:${fixture.token}:future-preserve`,
  });
  const futureSaved = saved(await commandWithTimeout(database, futureEdit), true);
  if (!isDeepStrictEqual(
    futureSnapshot,
    await snapshotFutureSupplierPrice(database, fixture),
  )) throw new Error("SMOKE_FUTURE_VERSION_MUTATED");

  await addMultiItemSourceFixture(
    database,
    fixture,
    futureSaved.current_price.supplier_price_list_id,
  );
  const beforeConflict = await snapshotSupplierPriceSeries(database, fixture);
  const conflict = await commandWithTimeout(
    database,
    createSupplierPurchasableSkuSmokeCommand(fixture, {
      action: "update",
      expectedSkuVersion: futureSaved.sku.version,
      expectedPriceListId: futureSaved.current_price.supplier_price_list_id,
      expectedPriceListVersion:
        futureSaved.current_price.supplier_price_list_row_version,
      unitPrice: "140.00",
      idempotencyKey: `task8:${fixture.token}:future-conflict`,
    }),
  );
  failure(conflict, "SUPPLIER_PRICE_PERIOD_CONFLICT", "state_conflict");
  if (!isDeepStrictEqual(
    beforeConflict,
    await snapshotSupplierPriceSeries(database, fixture),
  )) throw new Error("SMOKE_PERIOD_CONFLICT_CHANGED_STATE");
}

export async function runSupplierPurchasableSkuCoreScenarios(
  database: Bun.SQL,
  fixture: SupplierPurchasableSkuSmokeFixture,
): Promise<SupplierPurchasableSkuSmokeEvidence> {
  await verifyCreateEditReplay(database, fixture);
  const concurrency = await verifyConcurrency(database, fixture);
  await verifyFutureBoundaries(database, fixture);
  return {
    created: true,
    edited: true,
    replayed: true,
    concurrent_conflict: true,
    future_preserved: true,
    resolver_verified: true,
    concurrency,
  };
}
