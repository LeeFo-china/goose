import type { SmokeSql } from "./supplier-purchase-order-smoke-fixture";
import type {
  RequisitionSmokeFixture,
} from "./supplier-purchase-requisition-smoke-sql";

type PlanRow = { "QUERY PLAN": string };

export async function explainActiveCommitments(
  sql: SmokeSql,
  fixture: RequisitionSmokeFixture,
  assertPlan: (rows: PlanRow[]) => boolean,
) {
  await sql`
    with sources as (
      insert into public.supplier_purchase_requisitions (
        id, request_no, tenant_id, project_id, tenant_supplier_id, supplier_id,
        reason, priced_at, created_by_employee_id, updated_by_employee_id
      )
      select gen_random_uuid(),
        'PR-20990101-' || lpad(generated.sequence_no::text, 8, '0'),
        ${fixture.tenant_id}::uuid,
        ${fixture.project_id}::uuid, relationship.id,
        relationship.supplier_id, '采购申请 EXPLAIN 基数',
        now(), ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
      from generate_series(1, 256) as generated(sequence_no)
      cross join public.tenant_suppliers as relationship
      where relationship.id = ${fixture.relationship_id}::uuid
      returning id
    )
    insert into public.project_cost_commitments (
      tenant_id, project_id, cost_category_id, source_id, amount, status,
      budget_amount_snapshot, expense_amount_snapshot,
      other_commitment_amount_snapshot, available_amount_snapshot,
      created_by_employee_id, released_by_employee_id, released_at,
      release_reason
    )
    select ${fixture.tenant_id}::uuid, ${fixture.project_id}::uuid,
      ${fixture.cost_category_id}::uuid, sources.id, 1, 'released',
      1, 0, 0, 1, ${fixture.employee_id}::uuid,
      ${fixture.employee_id}::uuid, now(), '采购申请 EXPLAIN 已释放基数'
    from sources;
  `;
  const rows = await sql<PlanRow[]>`
    explain (analyze, buffers, format text)
    select sum(commitment.amount)
    from public.project_cost_commitments as commitment
    where commitment.tenant_id = ${fixture.tenant_id}::uuid
      and commitment.project_id = ${fixture.project_id}::uuid
      and commitment.cost_category_id = ${fixture.cost_category_id}::uuid
      and commitment.status in ('reserved', 'converted');
  `;
  return assertPlan(rows);
}
