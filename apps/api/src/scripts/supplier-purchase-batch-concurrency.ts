import { cleanupRuntimeBatchSmokeFixture } from
  "./supplier-purchase-batch-cleanup";
import {
  countRuntimeOrders,
  createRuntimeBatchSmokeFixture,
  prepareSubmittedBatch,
  requireSmokeRecord,
  reviewRuntimeBatch,
  seedRuntimeBatchSmokeFixture,
  type BatchSmokeFixture,
} from "./supplier-purchase-batch-smoke-fixture";

export const SUPPLIER_PURCHASE_BATCH_CONCURRENCY_MANIFEST = {
  concurrentReviewers: 2,
  acceptedOutcomes: ["winner", "idempotent_replay", "version_conflict"],
  exactWinnerCount: 1,
  exactSubmittedOrderCount: 2,
  duplicateSideEffects: 0,
  transactionScopedFixture: true,
} as const;

type ConcurrentReviewResult = {
  status: string;
  idempotent: boolean;
};

export function classifyConcurrentReviewResults(
  results: readonly ConcurrentReviewResult[],
) {
  const winnerCount = results.filter((result) =>
    result.status === "ordered" && result.idempotent === false
  ).length;
  const safeLoserCount = results.filter((result) =>
    (result.status === "ordered" && result.idempotent === true) ||
    result.status === "version_conflict"
  ).length;
  if (winnerCount !== 1 || safeLoserCount !== results.length - 1) {
    throw new Error("concurrent review requires exactly one winner");
  }
  return { winnerCount, safeLoserCount };
}

async function queryConcurrentEvidence(
  database: Bun.SQL,
  fixture: BatchSmokeFixture,
  batchId: string,
) {
  const rows = await database<{
    status: string;
    review_events: number;
  }[]>`
    select batch.status,
      (select count(*)::integer
       from public.supplier_purchase_batch_command_events as event
       where event.tenant_id = batch.tenant_id
         and event.purchase_batch_id = batch.id
         and event.command_type = 'review'
       limit 1) as review_events
    from public.supplier_purchase_batches as batch
    where batch.id = ${batchId}::uuid
      and batch.tenant_id = ${fixture.tenantId}::uuid
    limit 1;
  `;
  return rows[0];
}

export type SupplierPurchaseBatchConcurrencySummary = {
  winner_count: 1;
  safe_loser_count: 1;
  submitted_order_count: 2;
  review_event_count: 1;
  fixture_cleaned: true;
};

export async function runSupplierPurchaseBatchConcurrency(
  databaseUrl: string,
): Promise<SupplierPurchaseBatchConcurrencySummary> {
  const database = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  const reviewerA = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  const reviewerB = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  const runToken = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  let fixture: BatchSmokeFixture | undefined;
  try {
    fixture = await database.begin(async (sql) => {
      const created = await createRuntimeBatchSmokeFixture(sql, runToken);
      await seedRuntimeBatchSmokeFixture(sql, created);
      return created;
    });
    const prepared = await database.begin((sql) =>
      prepareSubmittedBatch(sql, fixture!, "concurrency")
    );
    const calls = [reviewerA, reviewerB].map(async (connection) => {
      const result = requireSmokeRecord(
        await reviewRuntimeBatch(
          connection,
          fixture!,
          prepared.batchId,
          "concurrency:review",
        ),
        "concurrent review",
      );
      return {
        status: String(result.status),
        idempotent: result.idempotent === true,
      };
    });
    const classified = classifyConcurrentReviewResults(await Promise.all(calls));
    const orderCount = await countRuntimeOrders(
      database,
      fixture,
      prepared.batchId,
    );
    const evidence = await queryConcurrentEvidence(
      database,
      fixture,
      prepared.batchId,
    );
    if (
      orderCount !== 2 || evidence?.status !== "ordered" ||
      evidence.review_events !== 1
    ) throw new Error("BATCH_CONCURRENCY_SIDE_EFFECTS_INVALID");
    return {
      winner_count: classified.winnerCount as 1,
      safe_loser_count: classified.safeLoserCount as 1,
      submitted_order_count: 2,
      review_event_count: 1,
      fixture_cleaned: true,
    };
  } finally {
    await Promise.all([reviewerA.close(), reviewerB.close()]);
    if (fixture) await cleanupRuntimeBatchSmokeFixture(database, fixture);
    await database.close();
  }
}

if (import.meta.main) {
  const databaseUrl = process.env.SUPABASE_DB_DIRECT_URL ??
    process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    console.error("SUPPLIER_PURCHASE_BATCH_CONCURRENCY_FAILED");
    process.exitCode = 1;
  } else {
    runSupplierPurchaseBatchConcurrency(databaseUrl)
      .then((summary) => console.log(JSON.stringify(summary)))
      .catch(() => {
        console.error("SUPPLIER_PURCHASE_BATCH_CONCURRENCY_FAILED");
        process.exitCode = 1;
      });
  }
}
