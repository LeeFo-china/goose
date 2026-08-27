import { cleanupRuntimeBatchSmokeFixture } from
  "./supplier-purchase-batch-cleanup";
import { assertLocalSupplierPurchaseBatchDatabaseUrl } from
  "./supplier-purchase-batch-local-db";
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
  distinctReviewerIdentities: true,
  distinctIdempotencyKeys: true,
  acceptedOutcomes: ["winner", "version_conflict"],
  exactWinnerCount: 1,
  exactVersionConflictCount: 1,
  exactSubmittedOrderCount: 2,
  exactSuccessfulReviewEventCount: 1,
  exactConflictReviewEventCount: 1,
  exactTotalReviewEventCount: 2,
  committedFixtureWithScopedCleanup: true,
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
  const versionConflictCount = results.filter((result) =>
    result.status === "version_conflict" && result.idempotent === false
  ).length;
  if (winnerCount !== 1 || versionConflictCount !== 1 || results.length !== 2) {
    throw new Error(
      "concurrent review requires one winner and one version conflict",
    );
  }
  return { winnerCount, versionConflictCount };
}

async function queryConcurrentEvidence(
  database: Bun.SQL,
  fixture: BatchSmokeFixture,
  batchId: string,
) {
  const rows = await database<{
    status: string;
    successful_review_events: number;
    conflict_review_events: number;
    total_review_events: number;
  }[]>`
    select batch.status,
      (select count(*) filter (where event.result ->> 'status' = 'ordered')::integer
       from public.supplier_purchase_batch_command_events as event
       where event.tenant_id = batch.tenant_id
         and event.purchase_batch_id = batch.id
         and event.command_type = 'review'
       limit 1) as successful_review_events,
      (select count(*) filter (
        where event.result ->> 'status' = 'version_conflict'
      )::integer
       from public.supplier_purchase_batch_command_events as event
       where event.tenant_id = batch.tenant_id
         and event.purchase_batch_id = batch.id
         and event.command_type = 'review'
       limit 1) as conflict_review_events,
      (select count(*)::integer
       from public.supplier_purchase_batch_command_events as event
       where event.tenant_id = batch.tenant_id
         and event.purchase_batch_id = batch.id
         and event.command_type = 'review'
       limit 1) as total_review_events
    from public.supplier_purchase_batches as batch
    where batch.id = ${batchId}::uuid
      and batch.tenant_id = ${fixture.tenantId}::uuid
    limit 1;
  `;
  return rows[0];
}

export type SupplierPurchaseBatchConcurrencySummary = {
  winner_count: 1;
  version_conflict_count: 1;
  submitted_order_count: 2;
  successful_review_event_count: 1;
  conflict_review_event_count: 1;
  total_review_event_count: 2;
  fixture_cleaned: true;
};

type ConcurrencyCleanupOptions = {
  primaryFailure?: unknown;
  reviewerClosures: readonly (() => Promise<unknown>)[];
  fixtureCleanup: () => Promise<unknown>;
  mainClose: () => Promise<unknown>;
};

export async function settleSupplierPurchaseBatchConcurrencyCleanup(
  options: ConcurrencyCleanupOptions,
): Promise<void> {
  const reviewerResults = await Promise.allSettled(
    options.reviewerClosures.map((close) => close()),
  );
  let cleanupFailure = reviewerResults.find(
    (result) => result.status === "rejected",
  )?.reason;
  try {
    await options.fixtureCleanup();
  } catch (error) {
    cleanupFailure ??= error;
  } finally {
    try {
      await options.mainClose();
    } catch (error) {
      cleanupFailure ??= error;
    }
  }
  if (options.primaryFailure !== undefined) throw options.primaryFailure;
  if (cleanupFailure !== undefined) throw cleanupFailure;
}

export async function runSupplierPurchaseBatchConcurrency(
  databaseUrl: string | undefined,
): Promise<SupplierPurchaseBatchConcurrencySummary> {
  const localDatabaseUrl = assertLocalSupplierPurchaseBatchDatabaseUrl(
    databaseUrl,
  );
  const database = new Bun.SQL(localDatabaseUrl, { max: 1, prepare: false });
  const reviewerA = new Bun.SQL(localDatabaseUrl, { max: 1, prepare: false });
  const reviewerB = new Bun.SQL(localDatabaseUrl, { max: 1, prepare: false });
  const runToken = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  let fixture: BatchSmokeFixture | undefined;
  let primaryFailure: unknown;
  try {
    fixture = await database.begin(async (sql) => {
      const created = await createRuntimeBatchSmokeFixture(sql, runToken);
      await seedRuntimeBatchSmokeFixture(sql, created);
      return created;
    });
    const prepared = await database.begin((sql) =>
      prepareSubmittedBatch(sql, fixture!, "concurrency")
    );
    const calls = [
      { connection: reviewerA, reviewer: "first", key: "a" },
      { connection: reviewerB, reviewer: "second", key: "b" },
    ] as const;
    const results = calls.map(async ({ connection, reviewer, key }) => {
      const result = requireSmokeRecord(
        await reviewRuntimeBatch(
          connection,
          fixture!,
          prepared.batchId,
          `concurrency:review:${key}`,
          reviewer,
        ),
        "concurrent review",
      );
      return {
        status: String(result.status),
        idempotent: result.idempotent === true,
      };
    });
    const classified = classifyConcurrentReviewResults(
      await Promise.all(results),
    );
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
      evidence.successful_review_events !== 1 ||
      evidence.conflict_review_events !== 1 ||
      evidence.total_review_events !== 2
    ) throw new Error("BATCH_CONCURRENCY_SIDE_EFFECTS_INVALID");
    return {
      winner_count: classified.winnerCount as 1,
      version_conflict_count: classified.versionConflictCount as 1,
      submitted_order_count: 2,
      successful_review_event_count: 1,
      conflict_review_event_count: 1,
      total_review_event_count: 2,
      fixture_cleaned: true,
    };
  } catch (error) {
    primaryFailure = error;
  } finally {
    await settleSupplierPurchaseBatchConcurrencyCleanup({
      primaryFailure,
      reviewerClosures: [() => reviewerA.close(), () => reviewerB.close()],
      fixtureCleanup: () => fixture
        ? cleanupRuntimeBatchSmokeFixture(database, fixture, localDatabaseUrl)
        : Promise.resolve(),
      mainClose: () => database.close(),
    });
  }
  throw primaryFailure;
}

if (import.meta.main) {
  const databaseUrl = process.env.SUPABASE_DB_DIRECT_URL ??
    process.env.SUPABASE_DB_URL;
  runSupplierPurchaseBatchConcurrency(databaseUrl)
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch(() => {
      console.error("SUPPLIER_PURCHASE_BATCH_CONCURRENCY_FAILED");
      process.exitCode = 1;
    });
}
