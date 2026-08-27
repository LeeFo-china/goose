import type { SavepointSQL, TransactionSQL } from "bun";

import {
  countRuntimeOrders,
  createRuntimeBatchSmokeFixture,
  prepareSubmittedBatch,
  requireSmokeRecord,
  reviewRuntimeBatch,
  saveRuntimeBatch,
  seedRuntimeBatchSmokeFixture,
  type BatchSmokeFixture,
  type BatchSmokeSql,
} from "./supplier-purchase-batch-smoke-fixture";

export const SUPPLIER_PURCHASE_BATCH_SMOKE_MANIFEST = {
  happyPath: {
    supplierCount: 2,
    skuCount: 3,
    costCategoryCount: 2,
    exactSubmittedOrderCount: 2,
    oneOrderPerSupplier: true,
    sameSupplierMultipleSkusStayTogether: true,
    wholeBatchBudgetAggregation: true,
  },
  replay: { sameResult: true, duplicateSideEffects: 0 },
  blockers: [
    "price_changed",
    "missing_price",
    "supplier_suspended",
    "product_inactive",
    "sku_inactive",
    "category_inactive",
  ],
  revision: {
    persistedAsDraft: true,
    versionIncremented: true,
    fullBlockerList: true,
    zeroOrders: true,
  },
  injectedFailure: {
    failAtOrder: 2,
    transactionRolledBack: true,
    exactOrderCount: 0,
  },
} as const;

export function createSupplierPurchaseBatchSmokeFixture(token: string) {
  return {
    tenantToken: `supplier-purchase-batch:${token}`,
    suppliers: [{ key: "supplier-a" }, { key: "supplier-b" }],
    skus: [
      { key: "sku-a1", supplierKey: "supplier-a" },
      { key: "sku-a2", supplierKey: "supplier-a" },
      { key: "sku-b1", supplierKey: "supplier-b" },
    ],
    costCategories: [{ key: "cost-a" }, { key: "cost-b" }],
    cleanup: { strategy: "rollback", scoped: true },
  } as const;
}

class ForcedRollback extends Error {}

async function runWithRollback<Result>(
  database: Bun.SQL,
  callback: (sql: TransactionSQL) => Promise<Result>,
): Promise<Result> {
  const marker = new ForcedRollback();
  let result: Result | undefined;
  let failure: unknown;
  try {
    await database.begin(async (transaction) => {
      try {
        result = await callback(transaction);
      } catch (error) {
        failure = error;
      }
      throw marker;
    });
  } catch (error) {
    if (error !== marker) throw error;
  }
  if (failure !== undefined) throw failure;
  if (result === undefined) throw new Error("BATCH_SMOKE_NO_RESULT");
  return result;
}

async function runRolledBackScenario<Result>(
  sql: TransactionSQL,
  callback: (savepoint: SavepointSQL) => Promise<Result>,
): Promise<Result> {
  const marker = new ForcedRollback();
  let result: Result | undefined;
  let failure: unknown;
  try {
    await sql.savepoint(async (savepoint) => {
      try {
        result = await callback(savepoint);
      } catch (error) {
        failure = error;
      }
      throw marker;
    });
  } catch (error) {
    if (error !== marker) throw error;
  }
  if (failure !== undefined) throw failure;
  if (result === undefined) throw new Error("BATCH_SMOKE_SCENARIO_NO_RESULT");
  return result;
}

function expectStatus(value: unknown, status: string, label: string) {
  const result = requireSmokeRecord(value, label);
  if (result.status !== status) {
    throw new Error(`${label}:${JSON.stringify(result)}`);
  }
  return result;
}

async function assertHappyPath(
  sql: TransactionSQL,
  fixture: BatchSmokeFixture,
) {
  const batchId = crypto.randomUUID();
  fixture.batchIds.push(batchId);
  const first = expectStatus(
    await saveRuntimeBatch(sql, fixture, batchId, "happy:save"),
    "saved",
    "happy save",
  );
  const replay = expectStatus(
    await saveRuntimeBatch(sql, fixture, batchId, "happy:save"),
    "saved",
    "happy replay",
  );
  if (first.idempotent !== false || replay.idempotent !== true) {
    throw new Error("BATCH_SMOKE_SAVE_REPLAY_INVALID");
  }
  const submittedRows = await sql<{ result: unknown }[]>`
    select public.submit_supplier_purchase_batch(
      ${batchId}::uuid, ${fixture.tenantId}::uuid, 1,
      ${fixture.actorUserId}::uuid, ${fixture.actorEmployeeId}::uuid,
      'happy:submit'
    ) as result;
  `;
  const submitted = expectStatus(
    submittedRows[0]?.result,
    "submitted",
    "happy submit",
  );
  const submittedBatch = requireSmokeRecord(submitted.batch, "submitted batch");
  const snapshot = requireSmokeRecord(
    submittedBatch.budget_snapshot,
    "budget snapshot",
  );
  const categoryA = requireSmokeRecord(
    snapshot[fixture.costCategoryIds[0]],
    "category A budget",
  );
  const categoryB = requireSmokeRecord(
    snapshot[fixture.costCategoryIds[1]],
    "category B budget",
  );
  if (
    categoryA.requested_amount !== "140.00" ||
    categoryB.requested_amount !== "60.00"
  ) throw new Error("BATCH_SMOKE_BUDGET_AGGREGATION_INVALID");

  const ordered = expectStatus(
    await reviewRuntimeBatch(sql, fixture, batchId, "happy:review"),
    "ordered",
    "happy review",
  );
  if (!Array.isArray(ordered.orders) || ordered.orders.length !== 2) {
    throw new Error("BATCH_SMOKE_EXACT_TWO_ORDERS_REQUIRED");
  }
  const groupRows = await sql<{
    tenant_supplier_id: string;
    item_count: number;
  }[]>`
    select purchase_order.tenant_supplier_id,
      count(order_item.id)::integer as item_count
    from public.supplier_purchase_orders as purchase_order
    join public.supplier_purchase_order_items as order_item
      on order_item.supplier_purchase_order_id = purchase_order.id
      and order_item.tenant_id = purchase_order.tenant_id
    where purchase_order.tenant_id = ${fixture.tenantId}::uuid
      and purchase_order.purchase_batch_id = ${batchId}::uuid
      and purchase_order.status = 'submitted'
    group by purchase_order.tenant_supplier_id
    order by purchase_order.tenant_supplier_id
    limit 3;
  `;
  const counts = new Map(groupRows.map((row) => [
    row.tenant_supplier_id,
    row.item_count,
  ]));
  if (
    groupRows.length !== 2 || counts.get(fixture.relationshipIds[0]) !== 2 ||
    counts.get(fixture.relationshipIds[1]) !== 1
  ) throw new Error("BATCH_SMOKE_SUPPLIER_SPLIT_INVALID");
  const reviewReplay = expectStatus(
    await reviewRuntimeBatch(sql, fixture, batchId, "happy:review"),
    "ordered",
    "happy review replay",
  );
  if (
    reviewReplay.idempotent !== true ||
    await countRuntimeOrders(sql, fixture, batchId) !== 2
  ) throw new Error("BATCH_SMOKE_REVIEW_REPLAY_INVALID");
}

async function assertMissingPriceRevision(
  sql: TransactionSQL,
  fixture: BatchSmokeFixture,
) {
  return runRolledBackScenario(sql, async (scenario) => {
    const { batchId } = await prepareSubmittedBatch(
      scenario,
      fixture,
      "missing-price",
    );
    const priceRows = await scenario<{ id: string; row_version: number }[]>`
      select id, row_version from public.supplier_price_lists
      where tenant_id = ${fixture.tenantId}::uuid
        and tenant_supplier_id = ${fixture.relationshipIds[0]}::uuid
        and lifecycle_status = 'published'
      order by id limit 2;
    `;
    if (priceRows.length !== 1 || !priceRows[0]) {
      throw new Error("BATCH_SMOKE_PUBLISHED_PRICE_AMBIGUOUS");
    }
    const retiredRows = await scenario<{ result: unknown }[]>`
      select public.command_supplier_price_list_v2(
        'retire', ${priceRows[0].id}::uuid, null::uuid,
        ${fixture.tenantId}::uuid, ${fixture.relationshipIds[0]}::uuid,
        ${fixture.supplierIds[0]}::uuid, ${priceRows[0].row_version}::integer,
        '{}'::jsonb, ${fixture.actorUserId}::uuid,
        ${fixture.actorEmployeeId}::uuid, 'missing-price:retire'
      ) as result;
    `;
    expectStatus(retiredRows[0]?.result, "retired", "missing price retire");
    const revision = expectStatus(
      await reviewRuntimeBatch(
        scenario,
        fixture,
        batchId,
        "missing-price:review",
      ),
      "revision_required",
      "missing price review",
    );
    if (await countRuntimeOrders(scenario, fixture, batchId) !== 0) {
      throw new Error("BATCH_SMOKE_MISSING_PRICE_ORDER_CREATED");
    }
    return revision;
  });
}

async function assertFullRevision(
  sql: TransactionSQL,
  fixture: BatchSmokeFixture,
) {
  return runRolledBackScenario(sql, async (scenario) => {
    const { batchId } = await prepareSubmittedBatch(
      scenario,
      fixture,
      "full-revision",
    );
    await scenario`
      update public.suppliers set operational_status = 'suspended',
        version = version + 1
      where id = ${fixture.supplierIds[0]}::uuid;
    `;
    await scenario`
      update public.supplier_products set status = 'inactive', version = version + 1
      where id in (${fixture.productIds[0]}::uuid,
        ${fixture.productIds[1]}::uuid, ${fixture.productIds[2]}::uuid);
    `;
    await scenario`
      update public.supplier_skus set status = 'inactive', version = version + 1
      where id = ${fixture.skuIds[2]}::uuid;
    `;
    await scenario`
      update public.catalog_categories set status = 'inactive'
      where id = ${fixture.catalogCategoryId}::uuid;
    `;
    await scenario`
      update public.project_cost_budgets set budget_amount = budget_amount - 1,
        updated_at = statement_timestamp()
      where tenant_id = ${fixture.tenantId}::uuid
        and project_id = ${fixture.projectId}::uuid
        and cost_category_id = ${fixture.costCategoryIds[0]}::uuid;
    `;
    const revision = expectStatus(
      await reviewRuntimeBatch(
        scenario,
        fixture,
        batchId,
        "full-revision:review",
      ),
      "revision_required",
      "full revision review",
    );
    const batch = requireSmokeRecord(revision.batch, "revision batch");
    const details = Array.isArray(revision.details) ? revision.details : [];
    const kinds = new Set(details.map((detail) =>
      requireSmokeRecord(detail, "revision detail").kind
    ));
    if (
      batch.status !== "draft" || revision.version !== 3 ||
      !kinds.has("supplier") || !kinds.has("price") || !kinds.has("budget") ||
      details.length < 5 ||
      await countRuntimeOrders(scenario, fixture, batchId) !== 0
    ) throw new Error(`BATCH_SMOKE_FULL_REVISION_INVALID:${JSON.stringify({
      batch,
      revision,
      kinds: [...kinds],
    })}`);
    return revision;
  });
}

async function installSecondOrderFailure(
  sql: BatchSmokeSql,
  batchId: string,
) {
  await sql`create temporary table supplier_batch_order_fail_counter(
    batch_id uuid primary key, insert_count integer not null default 0
  ) on commit drop`;
  await sql`insert into supplier_batch_order_fail_counter(batch_id)
    values (${batchId}::uuid)`;
  await sql`
    create function pg_temp.fail_supplier_batch_second_order()
    returns trigger language plpgsql as $$
    declare v_count integer;
    begin
      update supplier_batch_order_fail_counter
      set insert_count = insert_count + 1
      where batch_id = new.purchase_batch_id
      returning insert_count into v_count;
      if v_count = 2 then
        raise exception using errcode = 'P0001',
          message = 'SUPPLIER_BATCH_INJECTED_SECOND_ORDER_FAILURE';
      end if;
      return new;
    end;
    $$
  `;
  await sql`
    create trigger supplier_batch_injected_order_failure
    before insert on public.supplier_purchase_orders
    for each row execute function pg_temp.fail_supplier_batch_second_order()
  `;
}

async function assertSecondOrderRollback(
  sql: TransactionSQL,
  fixture: BatchSmokeFixture,
) {
  const { batchId } = await prepareSubmittedBatch(
    sql,
    fixture,
    "second-order-failure",
  );
  await installSecondOrderFailure(sql, batchId);
  try {
    await sql.savepoint((attempt) => reviewRuntimeBatch(
      attempt,
      fixture,
      batchId,
      "second-order-failure:review",
    ));
  } catch (error) {
    if (
      !(error instanceof Bun.SQL.PostgresError) ||
      error.message !== "SUPPLIER_BATCH_INJECTED_SECOND_ORDER_FAILURE"
    ) throw error;
  }
  const batchRows = await sql<{ status: string }[]>`
    select status from public.supplier_purchase_batches
    where id = ${batchId}::uuid and tenant_id = ${fixture.tenantId}::uuid
    limit 1;
  `;
  const orderCount = await countRuntimeOrders(sql, fixture, batchId);
  if (batchRows[0]?.status !== "pending_approval" || orderCount !== 0) {
    throw new Error(`BATCH_SMOKE_SECOND_ORDER_NOT_ATOMIC:${JSON.stringify({
      status: batchRows[0]?.status,
      orderCount,
    })}`);
  }
  return true;
}

export type SupplierPurchaseBatchSmokeSummary = {
  split_orders: 2;
  replay_safe: true;
  missing_price_revision: true;
  full_revision_blockers: true;
  second_order_failure_rolled_back: true;
  fixture_rolled_back: true;
};

export async function runSupplierPurchaseBatchSmoke(
  databaseUrl: string,
): Promise<SupplierPurchaseBatchSmokeSummary> {
  const database = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  const runToken = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  let fixture: BatchSmokeFixture | undefined;
  try {
    const result = await runWithRollback(database, async (sql) => {
      fixture = await createRuntimeBatchSmokeFixture(sql, runToken);
      await seedRuntimeBatchSmokeFixture(sql, fixture);
      await assertHappyPath(sql, fixture);
      await assertMissingPriceRevision(sql, fixture);
      await assertFullRevision(sql, fixture);
      await assertSecondOrderRollback(sql, fixture);
      return true;
    });
    const residualRows = await database<{ count: number }[]>`
      select count(*)::integer as count from public.employees
      where id = ${fixture?.actorEmployeeId ?? null}::uuid limit 1;
    `;
    if (!result || residualRows[0]?.count !== 0) {
      throw new Error("BATCH_SMOKE_FIXTURE_NOT_ROLLED_BACK");
    }
    return {
      split_orders: 2,
      replay_safe: true,
      missing_price_revision: true,
      full_revision_blockers: true,
      second_order_failure_rolled_back: true,
      fixture_rolled_back: true,
    };
  } finally {
    await database.close();
  }
}

if (import.meta.main) {
  const databaseUrl = process.env.SUPABASE_DB_DIRECT_URL ??
    process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    console.error("SUPPLIER_PURCHASE_BATCH_SMOKE_FAILED");
    process.exitCode = 1;
  } else {
    runSupplierPurchaseBatchSmoke(databaseUrl)
      .then((summary) => console.log(JSON.stringify(summary)))
      .catch(() => {
        console.error("SUPPLIER_PURCHASE_BATCH_SMOKE_FAILED");
        process.exitCode = 1;
      });
  }
}
