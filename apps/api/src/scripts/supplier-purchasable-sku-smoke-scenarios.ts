import { isDeepStrictEqual } from "node:util";
import type { ReservedSQL, TransactionSQL } from "bun";

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
import { verifyNoopPeriodOverlapGuard } from
  "./supplier-purchasable-sku-smoke-overlap";
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
  snapshotSupplierPriceListItems,
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
  if (!parsed.success) {
    if (SupplierPurchasableSkuCommandResultSchema.safeParse(value).success) {
      throw new Error("SMOKE_FAILURE_UNEXPECTED_SAVED");
    }
    const diagnostic = failureEnvelopeDiagnostic(value);
    throw new Error(`SMOKE_FAILURE_SCHEMA_INVALID_${diagnostic}`);
  }
  if (parsed.data.error_code !== errorCode) {
    throw new Error(`SMOKE_FAILURE_CODE_${parsed.data.error_code}`);
  }
  if (status && parsed.data.status !== status) {
    throw new Error(`SMOKE_FAILURE_STATUS_${parsed.data.status}`);
  }
}

function failureEnvelopeDiagnostic(value: unknown): string {
  if (typeof value !== "object" || value === null) return "NON_OBJECT";
  const record = value as Record<string, unknown>;
  const status = typeof record.status === "string"
    ? record.status.toUpperCase()
    : "NO_STATUS";
  const code = typeof record.error_code === "string"
    ? record.error_code
    : "NO_CODE";
  return /^[A-Z0-9_]+$/.test(`${status}_${code}`)
    ? `${status}_${code}`
    : "UNSAFE_SHAPE";
}

async function commandWithTimeout(
  database: Bun.SQL | ReservedSQL,
  input: SupplierPurchasableSkuSaveInput,
  beforeCommand: () => Promise<void> = async () => undefined,
): Promise<unknown> {
  return database.begin(async (transaction) => {
    await transaction`set local lock_timeout = '10s'`.simple();
    await transaction`set local statement_timeout = '20s'`.simple();
    await beforeCommand();
    return commandSupplierPurchasableSku(
      transaction as unknown as TransactionSQL,
      input,
    );
  });
}

export async function runSupplierPurchasableSkuConcurrentCommands<
  TConnection extends { release(): void },
  TInput,
  TResult,
>(
  database: { reserve(): Promise<TConnection> },
  inputs: readonly [TInput, TInput],
  execute: (
    connection: TConnection,
    input: TInput,
    atBarrier: () => Promise<void>,
  ) => Promise<TResult>,
  {
    barrierTimeoutMs = 5_000,
    completionTimeoutMs = 25_000,
  }: {
    barrierTimeoutMs?: number;
    completionTimeoutMs?: number;
  } = {},
): Promise<[TResult, TResult]> {
  const connections: TConnection[] = [];
  try {
    connections.push(await database.reserve());
    connections.push(await database.reserve());
    const atBarrier = createConcurrencyBarrier(barrierTimeoutMs);
    return await withSmokeTimeout(
      Promise.all([
        execute(connections[0]!, inputs[0], atBarrier),
        execute(connections[1]!, inputs[1], atBarrier),
      ]),
      completionTimeoutMs,
      "SMOKE_CONCURRENCY_TIMEOUT",
    );
  } finally {
    for (const connection of connections) connection.release();
  }
}

function createConcurrencyBarrier(timeoutMs: number) {
  let arrivals = 0;
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });

  return async () => {
    arrivals += 1;
    if (arrivals === 2) open();
    await withSmokeTimeout(
      gate,
      timeoutMs,
      "SMOKE_CONCURRENCY_BARRIER_TIMEOUT",
    );
  };
}

function withSmokeTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  code: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(code)),
      Math.max(1, timeoutMs),
    );
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export function assertSupplierPriceListItemsCopied(
  sourceValue: unknown,
  copiedValue: unknown,
  targetSkuId: string,
  targetUnitPrice: string,
): void {
  const source = priceItemRecords(sourceValue);
  const copied = priceItemRecords(copiedValue);
  if (source.length === 0 || copied.length !== source.length) {
    throw new Error("SMOKE_COPIED_PRICE_ITEMS_MISMATCH");
  }
  const sourceByIdentity = new Map(
    source.map((item) => [priceItemIdentity(item), item]),
  );
  const copiedListIds = new Set(
    copied.map((item) => item.supplier_price_list_id),
  );

  for (const item of copied) {
    const original = sourceByIdentity.get(priceItemIdentity(item));
    if (!original || item.id === original.id ||
      item.supplier_price_list_id === original.supplier_price_list_id) {
      throw new Error("SMOKE_COPIED_PRICE_ITEMS_MISMATCH");
    }
    const expected = priceItemBusinessFields(original);
    if (item.supplier_sku_id === targetSkuId) {
      expected.unit_price = typeof expected.unit_price === "number"
        ? Number(targetUnitPrice)
        : targetUnitPrice;
    }
    if (!isDeepStrictEqual(priceItemBusinessFields(item), expected)) {
      throw new Error("SMOKE_COPIED_PRICE_ITEMS_MISMATCH");
    }
  }
  if (copiedListIds.size !== 1) {
    throw new Error("SMOKE_COPIED_PRICE_ITEMS_MISMATCH");
  }
}

function priceItemRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) &&
      value.every((item) => typeof item === "object" && item !== null)
    ? value as Record<string, unknown>[]
    : [];
}

function priceItemIdentity(item: Record<string, unknown>): string {
  return JSON.stringify([
    item.supplier_product_id,
    item.supplier_sku_id,
    item.minimum_quantity,
    item.maximum_quantity,
  ]);
}

function priceItemBusinessFields(item: Record<string, unknown>) {
  const {
    id: _id,
    supplier_price_list_id: _priceListId,
    created_at: _createdAt,
    updated_at: _updatedAt,
    ...business
  } = item;
  return business;
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
  const results = await runSupplierPurchasableSkuConcurrentCommands(
    database,
    [input("a", "120.00"), input("b", "121.00")],
    (connection, command, atBarrier) =>
      commandWithTimeout(connection, command, atBarrier),
  );
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
  const beforeMultiItem = await getSupplierPurchasableSkuSmokeContext(
    database,
    fixture,
  );
  if (!beforeMultiItem.current_price) {
    throw new Error("SMOKE_MULTI_ITEM_SOURCE_MISSING");
  }
  await database.begin(async (transaction) => {
    await addMultiItemSourceFixture(
      transaction as unknown as TransactionSQL,
      fixture,
      beforeMultiItem.current_price!.supplier_price_list_id,
    );
  });
  const multiItemContext = await getSupplierPurchasableSkuSmokeContext(
    database,
    fixture,
  );
  if (!multiItemContext.current_price ||
    multiItemContext.next_scheduled_effective_from !== null) {
    throw new Error("SMOKE_MULTI_ITEM_CURRENT_PRICE_MISSING");
  }
  const sourceItems = await snapshotSupplierPriceListItems(
    database,
    multiItemContext.current_price.supplier_price_list_id,
  );
  const multiItemEdit = createSupplierPurchasableSkuSmokeCommand(fixture, {
    action: "update",
    expectedSkuVersion: await getSupplierPurchasableSkuSmokeVersion(
      database,
      fixture.skuId,
    ),
    expectedPriceListId: multiItemContext.current_price.supplier_price_list_id,
    expectedPriceListVersion:
      multiItemContext.current_price.supplier_price_list_row_version,
    unitPrice: "130.00",
    idempotencyKey: `task8:${fixture.token}:multi-item-copy`,
  });
  const copied = saved(
    await commandWithTimeout(database, multiItemEdit),
    true,
  );
  assertSupplierPriceListItemsCopied(
    sourceItems,
    await snapshotSupplierPriceListItems(
      database,
      copied.current_price.supplier_price_list_id,
    ),
    fixture.skuId,
    "130.00",
  );

  await database.begin(async (transaction) => {
    await createFutureSupplierPriceVersion(
      transaction as unknown as TransactionSQL,
      fixture,
      copied.current_price.supplier_price_list_id,
    );
  });
  const futureSnapshot = await snapshotFutureSupplierPrice(database, fixture);
  const conflictContext = await getSupplierPurchasableSkuSmokeContext(
    database,
    fixture,
  );
  if (!conflictContext.current_price ||
    conflictContext.next_scheduled_effective_from === null) {
    throw new Error("SMOKE_FUTURE_CONTEXT_INVALID");
  }
  const currentListId = conflictContext.current_price.supplier_price_list_id;
  const nextFrom = conflictContext.next_scheduled_effective_from;
  await verifyNoopPeriodOverlapGuard(database, fixture, currentListId, nextFrom);
  const priceConflictContext = await getSupplierPurchasableSkuSmokeContext(
    database,
    fixture,
  );
  if (!priceConflictContext.current_price) {
    throw new Error("SMOKE_RESTORED_FUTURE_CONTEXT_INVALID");
  }
  const beforeConflict = await snapshotSupplierPriceSeries(database, fixture);
  const conflict = await commandWithTimeout(
    database,
    createSupplierPurchasableSkuSmokeCommand(fixture, {
      action: "update",
      expectedSkuVersion: copied.sku.version,
      expectedPriceListId:
        priceConflictContext.current_price.supplier_price_list_id,
      expectedPriceListVersion:
        priceConflictContext.current_price.supplier_price_list_row_version,
      unitPrice: "140.00",
      idempotencyKey: `task8:${fixture.token}:future-conflict`,
    }),
  );
  failure(conflict, "SUPPLIER_PRICE_PERIOD_CONFLICT", "state_conflict");
  if (!isDeepStrictEqual(
    beforeConflict,
    await snapshotSupplierPriceSeries(database, fixture),
  )) throw new Error("SMOKE_PERIOD_CONFLICT_CHANGED_STATE");
  if (!isDeepStrictEqual(
    futureSnapshot,
    await snapshotFutureSupplierPrice(database, fixture),
  )) throw new Error("SMOKE_FUTURE_VERSION_MUTATED");
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
