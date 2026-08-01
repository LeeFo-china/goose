import {
  SUPPLIER_PAYMENT_SMOKE_IDS,
  type SupplierPaymentSmokeFixture,
  type SupplierPaymentSmokeSql,
} from "./supplier-payment-smoke-fixture";
import { seedSupplierPayableNoise } from
  "./supplier-payment-explain-payable-noise";

export class SupplierPaymentExplainFixtureError extends Error {
  override readonly name = "SupplierPaymentExplainFixtureError";
}

async function seedRequestsCommitmentsAndCash(
  sql: SupplierPaymentSmokeSql,
  fixture: SupplierPaymentSmokeFixture,
): Promise<void> {
  await sql`
    insert into public.supplier_purchase_requisitions (
      id, tenant_id, request_no, project_id, tenant_supplier_id, supplier_id,
      status, budget_status, reason, priced_at, created_by_employee_id,
      updated_by_employee_id
    )
    select
      md5('supplier-payment-explain-requisition-' || generated.no)::uuid,
      ${fixture.tenant_id}::uuid,
      'PR-20991231-' || lpad(generated.no::text, 8, '0'),
      ${fixture.project_id}::uuid, relationship.id,
      relationship.supplier_id, 'draft', 'unchecked',
      '回滚 EXPLAIN 基数', now(),
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    from generate_series(1, 5000) as generated(no)
    cross join public.tenant_suppliers as relationship
    where relationship.id = ${fixture.relationship_id}::uuid;
  `;
  await sql`
    insert into public.project_cost_commitments (
      tenant_id, project_id, cost_category_id, source_id, amount, status,
      budget_amount_snapshot, expense_amount_snapshot,
      other_commitment_amount_snapshot, available_amount_snapshot,
      created_by_employee_id, released_by_employee_id, released_at,
      release_reason
    )
    select
      ${fixture.tenant_id}::uuid, ${fixture.project_id}::uuid,
      ${fixture.cost_category_id}::uuid,
      md5('supplier-payment-explain-requisition-' || generated.no)::uuid,
      1, 'released', 10000, 0, 0, 10000,
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid,
      now(), '回滚 EXPLAIN 基数'
    from generate_series(1, 5000) as generated(no);
  `;
  await sql`select set_config('app.supplier_payment_command', 'on', true);`;
  await sql`
    insert into public.supplier_payment_requests (
      id, tenant_id, project_id, tenant_supplier_id, supplier_id,
      request_no, status, requested_amount, paid_amount, reason,
      created_by_employee_id, updated_by_employee_id,
      submitted_by_employee_id, submitted_at
    )
    select
      md5('supplier-payment-explain-request-' || generated.no)::uuid,
      ${fixture.tenant_id}::uuid, ${fixture.project_id}::uuid,
      relationship.id, relationship.supplier_id,
      'SPR-20991231-' || lpad(generated.no::text, 8, '0'),
      case when generated.no <= 100 then 'pending_approval' else 'draft' end,
      case when generated.no <= 100 then 1 else 0 end,
      0, '回滚 EXPLAIN 基数',
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid,
      case when generated.no <= 100
        then ${fixture.employee_id}::uuid else null end,
      case when generated.no <= 100 then now() else null end
    from generate_series(1, 5000) as generated(no)
    cross join public.tenant_suppliers as relationship
    where relationship.id = ${fixture.relationship_id}::uuid;
  `;
  await sql`
    insert into public.finance_ledger_entries (
      tenant_id, project_id, direction, entry_type, amount, currency,
      occurred_at, source_type, source_id, handled_by, summary
    )
    select
      ${fixture.tenant_id}::uuid, ${fixture.project_id}::uuid,
      'out',
      case when generated.no <= 100
        then 'supplier_payment' else 'adjustment' end,
      0.01, 'CNY',
      '2026-07-31T04:00:00.000Z'::timestamptz +
        generated.no * interval '1 second',
      case when generated.no <= 100
        then 'supplier_payment' else 'supplier_payment_explain' end,
      md5('supplier-payment-explain-ledger-' || generated.no)::uuid,
      ${fixture.employee_id}::uuid, '回滚 EXPLAIN 基数'
    from generate_series(1, 5000) as generated(no);
  `;
}

export async function seedSupplierPaymentExplainCardinality(
  sql: SupplierPaymentSmokeSql,
  fixture: SupplierPaymentSmokeFixture,
): Promise<void> {
  const fulfillmentRows = await sql<{ id: string }[]>`
    select fulfillment.id
    from public.supplier_purchase_order_fulfillments as fulfillment
    where fulfillment.tenant_id = ${fixture.tenant_id}::uuid
      and fulfillment.supplier_purchase_order_id =
        ${SUPPLIER_PAYMENT_SMOKE_IDS.order}::uuid;
  `;
  const fulfillmentId = fulfillmentRows[0]?.id;
  if (!fulfillmentId) {
    throw new SupplierPaymentExplainFixtureError(
      "supplier payment EXPLAIN fulfillment fixture is missing",
    );
  }
  await sql`
    select set_config(
      'private.supplier_purchase_fulfillment_command',
      'receipt',
      true
    );
  `;
  await sql`
    insert into public.supplier_purchase_order_receipts (
      id, tenant_id, supplier_purchase_order_id,
      supplier_purchase_order_fulfillment_id, receipt_no, received_at,
      remark, created_by_user_id, received_by_employee_id
    )
    select
      md5('supplier-payment-explain-receipt-' || generated.no)::uuid,
      ${fixture.tenant_id}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.order}::uuid,
      ${fulfillmentId}::uuid,
      'SMOKE-EXPLAIN-' || lpad(generated.no::text, 8, '0'),
      '2026-07-31T03:00:00.000Z'::timestamptz +
        generated.no * interval '1 second',
      '回滚 EXPLAIN 基数',
      ${fixture.user_id}::uuid,
      ${fixture.employee_id}::uuid
    from generate_series(1, 5000) as generated(no);
  `;
  await sql`
    insert into public.supplier_purchase_order_receipt_items (
      id, tenant_id, supplier_purchase_order_id,
      supplier_purchase_order_fulfillment_id, receipt_id,
      supplier_purchase_order_item_id, accepted_quantity,
      rejected_quantity, variance_reason
    )
    select
      md5('supplier-payment-explain-receipt-item-' || generated.no)::uuid,
      ${fixture.tenant_id}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.order}::uuid,
      ${fulfillmentId}::uuid,
      md5('supplier-payment-explain-receipt-' || generated.no)::uuid,
      ${fixture.order_item_id}::uuid,
      0.0001, 0, null
    from generate_series(1, 5000) as generated(no);
  `;
  await sql`
    insert into public.project_cost_events (
      tenant_id, project_id, cost_category_id, tenant_supplier_id,
      supplier_id, supplier_purchase_order_id,
      supplier_purchase_order_item_id, supplier_purchase_order_receipt_id,
      supplier_purchase_order_receipt_item_id, purchase_requisition_id,
      source_type, source_id, accepted_quantity, amount, occurred_at,
      created_by_employee_id
    )
    select
      ${fixture.tenant_id}::uuid, ${fixture.project_id}::uuid,
      ${fixture.cost_category_id}::uuid, ${fixture.relationship_id}::uuid,
      relationship.supplier_id,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.order}::uuid,
      ${fixture.order_item_id}::uuid,
      md5('supplier-payment-explain-receipt-' || generated.no)::uuid,
      md5('supplier-payment-explain-receipt-item-' || generated.no)::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.requisition}::uuid,
      'supplier_purchase_receipt_item',
      md5('supplier-payment-explain-receipt-item-' || generated.no)::uuid,
      0.0001, 0.01,
      '2026-07-31T03:00:00.000Z'::timestamptz +
        generated.no * interval '1 second',
      ${fixture.employee_id}::uuid
    from generate_series(1, 5000) as generated(no)
    cross join public.tenant_suppliers as relationship
    where relationship.id = ${fixture.relationship_id}::uuid;
  `;
  await sql`
    insert into public.supplier_payable_events (
      tenant_id, project_id, cost_category_id, tenant_supplier_id,
      supplier_id, supplier_purchase_order_id,
      supplier_purchase_order_item_id, supplier_purchase_order_receipt_id,
      supplier_purchase_order_receipt_item_id, purchase_requisition_id,
      source_type, source_id, accepted_quantity, amount, occurred_at, due_at,
      invoice_required_before_payment, created_by_employee_id
    )
    select
      cost.tenant_id, cost.project_id, cost.cost_category_id,
      cost.tenant_supplier_id, cost.supplier_id,
      cost.supplier_purchase_order_id, cost.supplier_purchase_order_item_id,
      cost.supplier_purchase_order_receipt_id,
      cost.supplier_purchase_order_receipt_item_id,
      cost.purchase_requisition_id, cost.source_type, cost.source_id,
      cost.accepted_quantity, cost.amount, cost.occurred_at,
      cost.occurred_at + interval '30 days', false,
      cost.created_by_employee_id
    from public.project_cost_events as cost
    where cost.tenant_id = ${fixture.tenant_id}::uuid
      and cost.supplier_purchase_order_id =
        ${SUPPLIER_PAYMENT_SMOKE_IDS.order}::uuid
      and cost.source_id in (
        select md5(
          'supplier-payment-explain-receipt-item-' || generated.no
        )::uuid
        from generate_series(1, 100) as generated(no)
      );
  `;
  await seedSupplierPayableNoise(sql, fixture);
  await seedRequestsCommitmentsAndCash(sql, fixture);
  await sql`
    analyze public.project_cost_events;
    analyze public.supplier_payable_events;
    analyze public.supplier_purchase_requisitions;
    analyze public.project_cost_commitments;
    analyze public.supplier_payment_requests;
    analyze public.finance_ledger_entries;
  `.simple();
}
