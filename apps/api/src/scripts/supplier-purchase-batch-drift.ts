import type { SavepointSQL, TransactionSQL } from "bun";

import {
  countRuntimeOrders,
  prepareSubmittedBatch,
  requireSmokeRecord,
  reviewRuntimeBatch,
  type BatchSmokeFixture,
  type BatchSmokeSql,
} from "./supplier-purchase-batch-smoke-fixture";

type FrozenPriceDetail = {
  supplier_sku_id: string;
  product_name_snapshot: string;
  sku_name_snapshot: string;
  unit_price: string;
  price_list_version_snapshot: number;
};

type ExpectedDrift = {
  errorCode: string;
  details: Array<Record<string, unknown>>;
};

class DriftScenarioRollback extends Error {}

async function runDriftScenario(
  sql: TransactionSQL,
  callback: (scenario: SavepointSQL) => Promise<void>,
): Promise<void> {
  const marker = new DriftScenarioRollback();
  let failure: unknown;
  try {
    await sql.savepoint(async (scenario) => {
      try {
        await callback(scenario);
      } catch (error) {
        failure = error;
      }
      throw marker;
    });
  } catch (error) {
    if (error !== marker) throw error;
  }
  if (failure !== undefined) throw failure;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(source).sort().map((key) => [key, canonicalize(source[key])]),
  );
}

export function assertExactDriftDetails(
  value: unknown,
  expected: ExpectedDrift,
): void {
  const revision = requireSmokeRecord(value, "drift revision");
  const batch = requireSmokeRecord(revision.batch, "drift batch");
  const actual = canonicalize(revision.details);
  const wanted = canonicalize(expected.details);
  if (
    revision.status !== "revision_required" ||
    revision.error_code !== expected.errorCode ||
    revision.version !== 3 || batch.status !== "draft" ||
    JSON.stringify(actual) !== JSON.stringify(wanted)
  ) {
    throw new Error(`BATCH_DRIFT_DETAILS_INVALID:${JSON.stringify({
      revision,
      expected,
    })}`);
  }
}

async function frozenPriceDetails(
  sql: BatchSmokeSql,
  fixture: BatchSmokeFixture,
  batchId: string,
): Promise<FrozenPriceDetail[]> {
  return sql<FrozenPriceDetail[]>`
    select item.supplier_sku_id, item.product_name_snapshot,
      item.sku_name_snapshot, item.unit_price::text,
      item.price_list_version_snapshot
    from public.supplier_purchase_batch_items as item
    where item.tenant_id = ${fixture.tenantId}::uuid
      and item.purchase_batch_id = ${batchId}::uuid
    order by item.line_no limit 100;
  `;
}

function expectedPriceDetails(
  frozen: FrozenPriceDetail[],
  indexes: readonly number[],
  current: (
    index: number,
    item: FrozenPriceDetail,
  ) => { unitPrice: string | null; version: number | null },
): Array<Record<string, unknown>> {
  return indexes.map((index) => {
    const item = frozen[index];
    if (!item) throw new Error("BATCH_DRIFT_FROZEN_ITEM_MISSING");
    const currentPrice = current(index, item);
    return {
      kind: "price",
      supplier_sku_id: item.supplier_sku_id,
      product_name: item.product_name_snapshot,
      sku_name: item.sku_name_snapshot,
      frozen_unit_price: item.unit_price,
      current_unit_price: currentPrice.unitPrice,
      frozen_price_version: item.price_list_version_snapshot,
      current_price_version: currentPrice.version,
    };
  });
}

async function assertRevision(
  sql: BatchSmokeSql,
  fixture: BatchSmokeFixture,
  batchId: string,
  label: string,
  expected: ExpectedDrift,
): Promise<void> {
  const revision = await reviewRuntimeBatch(
    sql,
    fixture,
    batchId,
    `${label}:review`,
  );
  assertExactDriftDetails(revision, expected);
  if (await countRuntimeOrders(sql, fixture, batchId) !== 0) {
    throw new Error(`BATCH_DRIFT_ORDER_CREATED:${label}`);
  }
}

async function publishedPriceList(
  sql: BatchSmokeSql,
  fixture: BatchSmokeFixture,
) {
  const rows = await sql<{ id: string; row_version: number }[]>`
    select id, row_version from public.supplier_price_lists
    where tenant_id = ${fixture.tenantId}::uuid
      and tenant_supplier_id = ${fixture.relationshipIds[0]}::uuid
      and lifecycle_status = 'published'
    order by id limit 2;
  `;
  if (rows.length !== 1 || !rows[0]) {
    throw new Error("BATCH_DRIFT_PUBLISHED_PRICE_AMBIGUOUS");
  }
  return rows[0];
}

async function commandPriceList(
  sql: BatchSmokeSql,
  fixture: BatchSmokeFixture,
  input: {
    action: "new_version" | "retire" | "publish";
    id: string;
    newId?: string;
    version: number;
    key: string;
  },
): Promise<Record<string, unknown>> {
  const rows = await sql<{ result: unknown }[]>`
    select public.command_supplier_price_list_v2(
      ${input.action}, ${input.id}::uuid, ${input.newId ?? null}::uuid,
      ${fixture.tenantId}::uuid, ${fixture.relationshipIds[0]}::uuid,
      ${fixture.supplierIds[0]}::uuid, ${input.version}::integer,
      '{}'::jsonb, ${fixture.actorUserId}::uuid,
      ${fixture.actorEmployeeId}::uuid, ${input.key}
    ) as result;
  `;
  return requireSmokeRecord(rows[0]?.result, `${input.action} price list`);
}

async function publishChangedPrice(
  sql: BatchSmokeSql,
  fixture: BatchSmokeFixture,
): Promise<void> {
  const published = await publishedPriceList(sql, fixture);
  const draftId = crypto.randomUUID();
  const created = await commandPriceList(sql, fixture, {
    action: "new_version",
    id: published.id,
    newId: draftId,
    version: published.row_version,
    key: "price-changed:new-version",
  });
  if (created.status !== "created" || created.version !== 1) {
    throw new Error(`BATCH_DRIFT_NEW_VERSION_FAILED:${JSON.stringify(created)}`);
  }
  const items = await sql<{ id: string }[]>`
    select id from public.supplier_price_list_items
    where supplier_price_list_id = ${draftId}::uuid
      and tenant_id = ${fixture.tenantId}::uuid
      and supplier_sku_id = ${fixture.skuIds[0]}::uuid
    order by id limit 2;
  `;
  if (items.length !== 1 || !items[0]) {
    throw new Error("BATCH_DRIFT_DRAFT_ITEM_MISSING");
  }
  const changedRows = await sql<{ result: unknown }[]>`
    select public.command_supplier_price_item_v2(
      'upsert', ${items[0].id}::uuid, ${draftId}::uuid,
      ${fixture.tenantId}::uuid, ${fixture.relationshipIds[0]}::uuid,
      ${fixture.supplierIds[0]}::uuid, 1,
      ${{
        sku_id: fixture.skuIds[0], unit_price: "11.00",
        tax_rate: "0.130000", tax_inclusive: true,
      }}::jsonb, ${fixture.actorUserId}::uuid,
      ${fixture.actorEmployeeId}::uuid, 'price-changed:item'
    ) as result;
  `;
  const changed = requireSmokeRecord(changedRows[0]?.result, "changed price");
  if (changed.status !== "updated" || changed.version !== 2) {
    throw new Error(`BATCH_DRIFT_PRICE_UPDATE_FAILED:${JSON.stringify(changed)}`);
  }
  const retired = await commandPriceList(sql, fixture, {
    action: "retire", id: published.id, version: published.row_version,
    key: "price-changed:retire",
  });
  const replacement = await commandPriceList(sql, fixture, {
    action: "publish", id: draftId, version: 2,
    key: "price-changed:publish",
  });
  if (retired.status !== "retired" || replacement.status !== "published") {
    throw new Error("BATCH_DRIFT_PRICE_SWITCH_FAILED");
  }
}

async function priceScenario(
  sql: TransactionSQL,
  fixture: BatchSmokeFixture,
  input: {
    label: string;
    indexes: readonly number[];
    mutate: (scenario: SavepointSQL) => Promise<void>;
    current: (
      index: number,
      item: FrozenPriceDetail,
    ) => { unitPrice: string | null; version: number | null };
  },
): Promise<void> {
  await runDriftScenario(sql, async (scenario) => {
    const { batchId } = await prepareSubmittedBatch(scenario, fixture, input.label);
    const frozen = await frozenPriceDetails(scenario, fixture, batchId);
    await input.mutate(scenario);
    await assertRevision(scenario, fixture, batchId, input.label, {
      errorCode: "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED",
      details: expectedPriceDetails(frozen, input.indexes, input.current),
    });
  });
}

async function assertPriceDrifts(
  sql: TransactionSQL,
  fixture: BatchSmokeFixture,
): Promise<void> {
  await priceScenario(sql, fixture, {
    label: "price-changed", indexes: [0, 1],
    mutate: (scenario) => publishChangedPrice(scenario, fixture),
    current: (index, item) => ({
      unitPrice: index === 0 ? "11.00" : "20.00",
      version: item.price_list_version_snapshot + 1,
    }),
  });
  await priceScenario(sql, fixture, {
    label: "missing-price", indexes: [0, 1],
    mutate: async (scenario) => {
      const published = await publishedPriceList(scenario, fixture);
      const result = await commandPriceList(scenario, fixture, {
        action: "retire", id: published.id, version: published.row_version,
        key: "missing-price:retire",
      });
      if (result.status !== "retired") throw new Error("BATCH_DRIFT_RETIRE_FAILED");
    },
    current: () => ({ unitPrice: null, version: null }),
  });
  await priceScenario(sql, fixture, {
    label: "product-inactive", indexes: [0],
    mutate: async (scenario) => {
      await scenario`update public.supplier_products set status = 'inactive',
        version = version + 1 where id = ${fixture.productIds[0]}::uuid`;
    },
    current: () => ({ unitPrice: null, version: null }),
  });
  await priceScenario(sql, fixture, {
    label: "sku-inactive", indexes: [2],
    mutate: async (scenario) => {
      await scenario`update public.supplier_skus set status = 'inactive',
        version = version + 1 where id = ${fixture.skuIds[2]}::uuid`;
    },
    current: () => ({ unitPrice: null, version: null }),
  });
  await priceScenario(sql, fixture, {
    label: "category-inactive", indexes: [0, 1, 2],
    mutate: async (scenario) => {
      // Local verification injects otherwise-unrepresentable catalog drift.
      // Production guards correctly prevent inactivating a referenced category.
      await scenario`set local session_replication_role = replica`;
      await scenario`update public.catalog_categories set status = 'inactive'
        where id = ${fixture.catalogCategoryId}::uuid`;
      await scenario`set local session_replication_role = origin`;
    },
    current: () => ({ unitPrice: null, version: null }),
  });
}

async function assertSupplierDrift(
  sql: TransactionSQL,
  fixture: BatchSmokeFixture,
): Promise<void> {
  await runDriftScenario(sql, async (scenario) => {
    const { batchId } = await prepareSubmittedBatch(
      scenario, fixture, "supplier-suspended",
    );
    await scenario`update public.suppliers set operational_status = 'suspended',
      version = version + 1 where id = ${fixture.supplierIds[0]}::uuid`;
    await assertRevision(scenario, fixture, batchId, "supplier-suspended", {
      errorCode: "SUPPLIER_PURCHASE_BATCH_SUPPLIER_INELIGIBLE",
      details: [{
        kind: "supplier",
        tenant_supplier_id: fixture.relationshipIds[0],
        supplier_id: fixture.supplierIds[0],
        reason: "SUPPLIER_NOT_ELIGIBLE",
      }],
    });
  });
}

function subtractOneFromMoney(value: string): string {
  const match = value.match(/^(-?)(\d+)\.(\d{2})$/);
  if (!match?.[2] || !match[3]) throw new Error("BATCH_DRIFT_INVALID_MONEY");
  const hundred = BigInt(100);
  const sign = match[1] === "-" ? -BigInt(1) : BigInt(1);
  const cents = sign * (
    BigInt(match[2]) * hundred + BigInt(match[3])
  ) - hundred;
  const absolute = cents < BigInt(0) ? -cents : cents;
  return `${cents < BigInt(0) ? "-" : ""}${absolute / hundred}.${
    (absolute % hundred).toString().padStart(2, "0")
  }`;
}

async function assertBudgetDrift(
  sql: TransactionSQL,
  fixture: BatchSmokeFixture,
): Promise<void> {
  await runDriftScenario(sql, async (scenario) => {
    const { batchId, submitted } = await prepareSubmittedBatch(
      scenario, fixture, "budget-changed",
    );
    const submittedBatch = requireSmokeRecord(submitted.batch, "budget batch");
    const snapshot = requireSmokeRecord(
      submittedBatch.budget_snapshot,
      "budget snapshot",
    );
    await scenario`update public.project_cost_budgets
      set budget_amount = budget_amount - 1, updated_at = statement_timestamp()
      where tenant_id = ${fixture.tenantId}::uuid
        and project_id = ${fixture.projectId}::uuid
        and cost_category_id = ${fixture.costCategoryIds[0]}::uuid`;
    await assertRevision(scenario, fixture, batchId, "budget-changed", {
      errorCode: "SUPPLIER_PURCHASE_BATCH_BUDGET_CHANGED",
      details: fixture.costCategoryIds.map((costCategoryId, index) => ({
        ...(() => {
          const category = requireSmokeRecord(
            snapshot[costCategoryId],
            "budget category",
          );
          const available = String(category.available_amount);
          const currentAvailable = index === 0
            ? subtractOneFromMoney(available)
            : available;
          return {
            submitted_requested_amount: String(category.requested_amount),
            current_requested_amount: String(category.requested_amount),
            submitted_available_amount: available,
            current_available_amount: currentAvailable,
          };
        })(),
        kind: "budget", cost_category_id: costCategoryId,
      })),
    });
  });
}

export async function assertSupplierPurchaseBatchDriftMatrix(
  sql: TransactionSQL,
  fixture: BatchSmokeFixture,
): Promise<void> {
  await assertPriceDrifts(sql, fixture);
  await assertSupplierDrift(sql, fixture);
  await assertBudgetDrift(sql, fixture);
}
