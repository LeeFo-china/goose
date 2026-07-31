import type {
  SupplierPaymentSmokeFixture,
  SupplierPaymentSmokeSql,
} from "./supplier-payment-smoke-fixture";
import { paymentSmokeAssert as assert } from
  "./supplier-payment-smoke-state";

export type RequestStateSnapshot = {
  request: Record<string, unknown>;
  allocations: Array<{
    id: string;
    paid_amount: string;
  }>;
};

export type InvoiceGateSnapshot = RequestStateSnapshot & {
  payment_count: number;
  payment_allocation_count: number;
  ledger_count: number;
};

export type ProjectCostSnapshot = {
  count: number;
  amount: string;
  supplier_payment_source_count: number;
};

function stableSnapshot(value: unknown): string {
  return JSON.stringify(value);
}

export function assertRequestStateSnapshotUnchanged(
  before: RequestStateSnapshot,
  after: RequestStateSnapshot,
  label: string,
): true {
  assert(
    stableSnapshot(after) === stableSnapshot(before),
    `${label} request state must remain unchanged`,
  );
  return true;
}

export function assertInvoiceGateSnapshotUnchanged(
  before: InvoiceGateSnapshot,
  after: InvoiceGateSnapshot,
): true {
  assert(
    stableSnapshot(after) === stableSnapshot(before),
    "invoice gate must leave request, allocations and cash facts unchanged",
  );
  return true;
}

export function assertProjectCostSnapshotUnchanged(
  before: ProjectCostSnapshot,
  after: ProjectCostSnapshot,
): true {
  assert(
    before.count === after.count && before.amount === after.amount,
    "project cost count and amount must remain unchanged after cash",
  );
  assert(
    before.supplier_payment_source_count === 0 &&
      after.supplier_payment_source_count === 0,
    "project cost must not contain supplier_payment source",
  );
  return true;
}

export async function readRequestStateSnapshot(
  sql: SupplierPaymentSmokeSql,
  fixture: SupplierPaymentSmokeFixture,
  requestId: string,
): Promise<RequestStateSnapshot> {
  const requests = await sql<{ request: Record<string, unknown> }[]>`
    select to_jsonb(request.*) as request
    from public.supplier_payment_requests as request
    where request.tenant_id = ${fixture.tenant_id}::uuid
      and request.id = ${requestId}::uuid;
  `;
  assert(requests.length === 1 && requests[0], "request snapshot is required");
  const allocations = await sql<RequestStateSnapshot["allocations"]>`
    select allocation.id, allocation.paid_amount::text
    from public.supplier_payment_request_allocations as allocation
    where allocation.tenant_id = ${fixture.tenant_id}::uuid
      and allocation.payment_request_id = ${requestId}::uuid
    order by allocation.id;
  `;
  return { request: requests[0]!.request, allocations };
}

export async function readInvoiceGateSnapshot(
  sql: SupplierPaymentSmokeSql,
  fixture: SupplierPaymentSmokeFixture,
  requestId: string,
  paymentId: string,
): Promise<InvoiceGateSnapshot> {
  const state = await readRequestStateSnapshot(sql, fixture, requestId);
  const rows = await sql<Array<{
    payment_count: number;
    payment_allocation_count: number;
    ledger_count: number;
  }>>`
    select
      (select count(*)::integer from public.supplier_payments
        where id = ${paymentId}::uuid) as payment_count,
      (select count(*)::integer from public.supplier_payment_allocations
        where supplier_payment_id = ${paymentId}::uuid)
        as payment_allocation_count,
      (select count(*)::integer from public.finance_ledger_entries
        where source_type = 'supplier_payment'
          and source_id = ${paymentId}::uuid) as ledger_count;
  `;
  assert(rows.length === 1 && rows[0], "invoice cash snapshot is required");
  return { ...state, ...rows[0]! };
}

export async function readProjectCostSnapshot(
  sql: SupplierPaymentSmokeSql,
  fixture: SupplierPaymentSmokeFixture,
): Promise<ProjectCostSnapshot> {
  const rows = await sql<ProjectCostSnapshot[]>`
    select count(*)::integer as count,
      coalesce(sum(cost.amount), 0)::text as amount,
      count(*) filter (
        where cost.source_type = 'supplier_payment'
      )::integer as supplier_payment_source_count
    from public.project_cost_events as cost
    where cost.tenant_id = ${fixture.tenant_id}::uuid
      and cost.project_id = ${fixture.project_id}::uuid;
  `;
  assert(rows.length === 1 && rows[0], "project cost snapshot is required");
  return rows[0]!;
}
