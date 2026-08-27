import type { BatchSmokeFixture } from
  "./supplier-purchase-batch-smoke-fixture";
import { assertLocalSupplierPurchaseBatchDatabaseUrl } from
  "./supplier-purchase-batch-local-db";

export async function cleanupRuntimeBatchSmokeFixture(
  database: Bun.SQL,
  fixture: BatchSmokeFixture,
  databaseUrl: string | undefined,
): Promise<void> {
  assertLocalSupplierPurchaseBatchDatabaseUrl(databaseUrl);
  await database.begin(async (sql) => {
    // Local verification cleanup only. Submitted-order immutability correctly
    // blocks application deletes, so the superuser disables ordinary triggers
    // for this one exact, ID-scoped cleanup transaction and restores on commit.
    await sql`set local session_replication_role = replica`;
    await sql`
      delete from public.supplier_command_events
      where tenant_id = ${fixture.tenantId}::uuid
        and actor_user_id in (${fixture.actorUserId}::uuid,
          ${fixture.reviewerUserId}::uuid,
          ${fixture.secondReviewerUserId}::uuid);
    `;
    await sql`
      delete from public.project_cost_commitments as commitment
      using public.supplier_purchase_requisitions as requisition
      where commitment.tenant_id = ${fixture.tenantId}::uuid
        and commitment.source_id = requisition.id
        and requisition.purchase_batch_id in (
          select batch.id from public.supplier_purchase_batches as batch
          where batch.tenant_id = ${fixture.tenantId}::uuid
            and batch.project_id = ${fixture.projectId}::uuid
          limit 100
        );
    `;
    await sql`
      delete from public.supplier_purchase_order_items as item
      using public.supplier_purchase_orders as purchase_order
      where item.tenant_id = ${fixture.tenantId}::uuid
        and item.supplier_purchase_order_id = purchase_order.id
        and purchase_order.project_id = ${fixture.projectId}::uuid;
    `;
    await sql`
      delete from public.supplier_purchase_orders
      where tenant_id = ${fixture.tenantId}::uuid
        and project_id = ${fixture.projectId}::uuid;
    `;
    await sql`
      delete from public.supplier_purchase_requisition_items as item
      using public.supplier_purchase_requisitions as requisition
      where item.tenant_id = ${fixture.tenantId}::uuid
        and item.purchase_requisition_id = requisition.id
        and requisition.project_id = ${fixture.projectId}::uuid;
    `;
    await sql`
      delete from public.supplier_purchase_requisitions
      where tenant_id = ${fixture.tenantId}::uuid
        and project_id = ${fixture.projectId}::uuid;
    `;
    await sql`
      delete from public.supplier_purchase_batch_command_events
      where tenant_id = ${fixture.tenantId}::uuid
        and purchase_batch_id in (
          select id from public.supplier_purchase_batches
          where tenant_id = ${fixture.tenantId}::uuid
            and project_id = ${fixture.projectId}::uuid
          limit 100
        );
    `;
    await sql`
      delete from public.supplier_purchase_batch_items
      where tenant_id = ${fixture.tenantId}::uuid
        and purchase_batch_id in (
          select id from public.supplier_purchase_batches
          where tenant_id = ${fixture.tenantId}::uuid
            and project_id = ${fixture.projectId}::uuid
          limit 100
        );
    `;
    await sql`
      delete from public.supplier_purchase_batches
      where tenant_id = ${fixture.tenantId}::uuid
        and project_id = ${fixture.projectId}::uuid;
    `;
    await sql`
      delete from public.project_cost_budgets
      where tenant_id = ${fixture.tenantId}::uuid
        and project_id = ${fixture.projectId}::uuid;
    `;
    await sql`
      delete from public.supplier_price_list_items
      where tenant_id = ${fixture.tenantId}::uuid
        and supplier_id in (${fixture.supplierIds[0]}::uuid,
          ${fixture.supplierIds[1]}::uuid);
    `;
    await sql`
      delete from public.supplier_price_lists
      where tenant_id = ${fixture.tenantId}::uuid
        and supplier_id in (${fixture.supplierIds[0]}::uuid,
          ${fixture.supplierIds[1]}::uuid);
    `;
    await sql`
      delete from public.supplier_skus
      where id in (${fixture.skuIds[0]}::uuid, ${fixture.skuIds[1]}::uuid,
        ${fixture.skuIds[2]}::uuid);
    `;
    await sql`
      delete from public.supplier_products
      where id in (${fixture.productIds[0]}::uuid,
        ${fixture.productIds[1]}::uuid, ${fixture.productIds[2]}::uuid);
    `;
    await sql`
      delete from public.tenant_suppliers
      where tenant_id = ${fixture.tenantId}::uuid
        and id in (${fixture.relationshipIds[0]}::uuid,
          ${fixture.relationshipIds[1]}::uuid);
    `;
    await sql`
      delete from public.suppliers
      where id in (${fixture.supplierIds[0]}::uuid,
        ${fixture.supplierIds[1]}::uuid);
    `;
    await sql`delete from public.catalog_categories
      where id = ${fixture.catalogCategoryId}::uuid`;
    await sql`delete from public.tenant_supplier_settings
      where tenant_id = ${fixture.tenantId}::uuid
        and enabled_by_employee_id = ${fixture.actorEmployeeId}::uuid`;
    await sql`delete from public.projects
      where id = ${fixture.projectId}::uuid`;
    await sql`delete from public.employees
      where id in (${fixture.actorEmployeeId}::uuid,
        ${fixture.reviewerEmployeeId}::uuid,
        ${fixture.secondReviewerEmployeeId}::uuid)`;
    await sql`delete from auth.users
      where id in (${fixture.actorUserId}::uuid,
        ${fixture.reviewerUserId}::uuid,
        ${fixture.secondReviewerUserId}::uuid)`;
  });
}
