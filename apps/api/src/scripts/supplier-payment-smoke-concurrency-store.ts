import { SupplierPaymentSmokeAssertionError } from
  "./supplier-payment-smoke-commands";
import type { ConcurrencyRunIdentity } from
  "./supplier-payment-smoke-concurrency-helpers";

function prerequisite(message: string): never {
  throw new SupplierPaymentSmokeAssertionError(
    `SUPPLIER_PAYMENT_SMOKE_PREREQUISITE_CONCURRENCY_${message}`,
  );
}

export async function countConcurrentResiduals(
  database: Bun.SQL,
  identity: ConcurrencyRunIdentity,
): Promise<number> {
  const rows = await database<{ count: number }[]>`
    select sum(fact.count)::integer as count
    from (
      select count(*) from public.supplier_payment_request_allocations
      where payment_request_id in (
        ${identity.requestA}::uuid, ${identity.requestB}::uuid
      )
      union all
      select count(*) from public.supplier_payment_requests
      where id in (${identity.requestA}::uuid, ${identity.requestB}::uuid)
      union all
      select count(*) from public.supplier_command_events
      where resource_type = 'supplier_payment_request'
        and resource_id in (
          ${identity.requestA}::uuid, ${identity.requestB}::uuid
        )
    ) as fact;
  `;
  return rows[0]?.count ?? -1;
}

export async function countConcurrentConflicts(
  database: Bun.SQL,
  identity: ConcurrencyRunIdentity,
): Promise<number> {
  const residual = await countConcurrentResiduals(database, identity);
  const events = await database<{ count: number }[]>`
    select count(*)::integer as count
    from public.supplier_command_events as event
    where event.idempotency_key in (
      ${identity.saveA}, ${identity.saveB},
      ${identity.submitA}, ${identity.submitB}
    );
  `;
  return residual + (events[0]?.count ?? -1);
}

export async function cleanupConcurrentRequests(
  database: Bun.SQL,
  identity: ConcurrencyRunIdentity,
): Promise<void> {
  const marker = `supplier-payment-concurrency:${identity.marker}`;
  const ownership = await database<Array<{
    request_count: number;
    request_mismatches: number;
    event_mismatches: number;
  }>>`
    select
      (select count(*)::integer
        from public.supplier_payment_requests as request
        where request.id in (
          ${identity.requestA}::uuid, ${identity.requestB}::uuid
        )) as request_count,
      (select count(*)::integer
        from public.supplier_payment_requests as request
        where request.id in (
          ${identity.requestA}::uuid, ${identity.requestB}::uuid
        ) and request.reason is distinct from ${marker})
        as request_mismatches,
      (select count(*)::integer
        from public.supplier_command_events as event
        where event.resource_type = 'supplier_payment_request'
          and event.resource_id in (
            ${identity.requestA}::uuid, ${identity.requestB}::uuid
          )
          and event.idempotency_key not in (
            ${identity.saveA}, ${identity.saveB},
            ${identity.submitA}, ${identity.submitB}
          )) as event_mismatches;
  `;
  const residual = await countConcurrentResiduals(database, identity);
  if (residual === 0) return;
  const proof = ownership[0];
  if (
    !proof || proof.request_count === 0 ||
    proof.request_mismatches !== 0 || proof.event_mismatches !== 0
  ) {
    prerequisite("RUN_OWNERSHIP_UNPROVEN");
  }
  await database.begin(async (transaction) => {
    await transaction`select set_config(
      'app.supplier_payment_command', 'on', true
    );`;
    await transaction`
      delete from public.supplier_payment_request_allocations
      where payment_request_id in (
        ${identity.requestA}::uuid, ${identity.requestB}::uuid
      );
    `;
    await transaction`
      delete from public.supplier_payment_requests
      where id in (${identity.requestA}::uuid, ${identity.requestB}::uuid);
    `;
    await transaction`
      delete from public.supplier_command_events
      where resource_type = 'supplier_payment_request'
        and resource_id in (
          ${identity.requestA}::uuid, ${identity.requestB}::uuid
        );
    `;
  });
}
