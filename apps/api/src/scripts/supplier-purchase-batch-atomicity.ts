import type { TransactionSQL } from "bun";

import {
  countRuntimeOrders,
  prepareSubmittedBatch,
  reviewRuntimeBatch,
  type BatchSmokeFixture,
  type BatchSmokeSql,
} from "./supplier-purchase-batch-smoke-fixture";

type BatchState = {
  status: string;
  version: number;
  split_generation: number;
};

type RequisitionState = {
  id: string;
  status: string;
  purchase_order_id: string | null;
};

type CommitmentState = {
  source_id: string;
  status: string;
  recognized_amount: string;
};

type AtomicityEvidence = {
  batch: BatchState;
  requisitions: RequisitionState[];
  commitments: CommitmentState[];
  order_count: number;
  review_event_count: number;
};

async function installSecondOrderFailure(
  sql: BatchSmokeSql,
  batchId: string,
): Promise<void> {
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

async function queryAtomicityEvidence(
  sql: BatchSmokeSql,
  fixture: BatchSmokeFixture,
  batchId: string,
  generation: number,
): Promise<AtomicityEvidence> {
  const batchRows = await sql<BatchState[]>`
    select status, version, split_generation
    from public.supplier_purchase_batches
    where id = ${batchId}::uuid and tenant_id = ${fixture.tenantId}::uuid
    limit 1;
  `;
  const requisitions = await sql<RequisitionState[]>`
    select id, status, purchase_order_id
    from public.supplier_purchase_requisitions
    where tenant_id = ${fixture.tenantId}::uuid
      and purchase_batch_id = ${batchId}::uuid
      and split_generation = ${generation}::integer
    order by tenant_supplier_id, id limit 20;
  `;
  const commitments = await sql<CommitmentState[]>`
    select commitment.source_id, commitment.status,
      commitment.recognized_amount::text
    from public.project_cost_commitments as commitment
    join public.supplier_purchase_requisitions as requisition
      on requisition.id = commitment.source_id
      and requisition.tenant_id = commitment.tenant_id
    where requisition.tenant_id = ${fixture.tenantId}::uuid
      and requisition.purchase_batch_id = ${batchId}::uuid
      and requisition.split_generation = ${generation}::integer
    order by commitment.source_id, commitment.cost_category_id,
      commitment.id limit 100;
  `;
  const eventRows = await sql<{ review_event_count: number }[]>`
    select count(*)::integer as review_event_count
    from public.supplier_purchase_batch_command_events
    where tenant_id = ${fixture.tenantId}::uuid
      and purchase_batch_id = ${batchId}::uuid
      and command_type = 'review' limit 1;
  `;
  const batch = batchRows[0];
  if (!batch) throw new Error("BATCH_ATOMICITY_BATCH_MISSING");
  return {
    batch,
    requisitions,
    commitments,
    order_count: await countRuntimeOrders(sql, fixture, batchId),
    review_event_count: eventRows[0]?.review_event_count ?? -1,
  };
}

function sameBatch(before: BatchState, after: BatchState): boolean {
  return before.status === "pending_approval" && before.version === 2 &&
    before.split_generation === 1 &&
    after.status === before.status && after.version === before.version &&
    after.split_generation === before.split_generation;
}

function assertAtomicityEvidence(
  before: AtomicityEvidence,
  after: AtomicityEvidence,
): void {
  if (!sameBatch(before.batch, after.batch)) {
    throw new Error("BATCH_ATOMICITY_BATCH_CHANGED");
  }
  if (
    after.order_count !== 0 || after.review_event_count !== 0 ||
    after.requisitions.length !== 2 ||
    after.requisitions.some((requisition) =>
      requisition.status !== "pending_approval" ||
      requisition.purchase_order_id !== null
    )
  ) throw new Error("BATCH_ATOMICITY_REQUISITIONS_CHANGED");
  const requisitionIds = new Set(after.requisitions.map(({ id }) => id));
  if (
    after.commitments.length !== 3 ||
    after.commitments.some((commitment) =>
      !requisitionIds.has(commitment.source_id) ||
      commitment.status !== "reserved" ||
      commitment.recognized_amount !== "0.00"
    )
  ) throw new Error("BATCH_ATOMICITY_COMMITMENTS_CHANGED");
}

export async function assertSecondOrderAtomicRollback(
  sql: TransactionSQL,
  fixture: BatchSmokeFixture,
): Promise<void> {
  const { batchId } = await prepareSubmittedBatch(
    sql,
    fixture,
    "second-order-failure",
  );
  const before = await queryAtomicityEvidence(sql, fixture, batchId, 1);
  await installSecondOrderFailure(sql, batchId);
  let injectedFailureObserved = false;
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
    injectedFailureObserved = true;
  }
  if (!injectedFailureObserved) {
    throw new Error("BATCH_ATOMICITY_INJECTION_NOT_OBSERVED");
  }
  const after = await queryAtomicityEvidence(
    sql,
    fixture,
    batchId,
    before.batch.split_generation,
  );
  assertAtomicityEvidence(before, after);
}
