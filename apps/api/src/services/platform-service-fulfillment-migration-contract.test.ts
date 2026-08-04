import { describe, expect, test } from "bun:test";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260804160000_create_platform_service_fulfillment_admin.sql",
  import.meta.url,
);
const migrationFile = Bun.file(migrationPath);
const readMigration = () => migrationFile.text();
const customerAcceptanceMigrationPath = new URL(
  "../../../../supabase/migrations/20260804170000_create_platform_service_customer_acceptance.sql",
  import.meta.url,
);
const customerAcceptanceMigrationFile = Bun.file(customerAcceptanceMigrationPath);
const readCustomerAcceptanceMigration = () =>
  customerAcceptanceMigrationFile.text();

describe("platform service fulfillment admin migration", () => {
  test("creates fulfillment tables with tenant-scoped ownership", async () => {
    expect(await migrationFile.exists()).toBe(true);
    const sql = await readMigration();

    for (const table of [
      "tenant_service_work_order_events",
      "tenant_service_fulfillment_records",
      "tenant_service_fulfillment_attachments",
      "tenant_service_acceptance_preparations",
    ]) {
      expect(sql).toContain(`CREATE TABLE public.${table}`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`${table}_tenant_id_fkey`);
    }

    expect(sql).toContain("tenant_service_work_order_events_order_identity_fkey");
    expect(sql).toContain("tenant_service_fulfillment_records_work_order_identity_fkey");
    expect(sql).toContain("tenant_service_fulfillment_attachments_record_identity_fkey");
    expect(sql).toContain("tenant_service_acceptance_preparations_work_order_identity_fkey");
  });

  test("adds bounded indexes for platform lists and detail timelines", async () => {
    const sql = await readMigration();

    for (const indexName of [
      "tenant_service_work_order_events_work_order_created_idx",
      "tenant_service_fulfillment_records_work_order_created_idx",
      "tenant_service_fulfillment_records_type_occurred_idx",
      "tenant_service_fulfillment_attachments_work_order_created_idx",
      "tenant_service_acceptance_preparations_status_updated_idx",
      "tenant_service_refund_requests_status_created_idx",
    ]) {
      expect(sql).toContain(indexName);
    }
  });

  test("creates atomic work-order assignment, transition, and refund-review RPCs", async () => {
    const sql = await readMigration();

    for (const functionName of [
      "platform_service_assign_work_order",
      "platform_service_transition_work_order",
      "platform_service_review_refund_request",
    ]) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${functionName}`);
      expect(sql).toContain("FOR UPDATE");
      expect(sql).toContain("p_expected_version");
    }

    expect(sql).toContain("SERVICE_WORK_ORDER_VERSION_CONFLICT");
    expect(sql).toContain("SERVICE_WORK_ORDER_INVALID_STATE");
    expect(sql).toContain("SERVICE_REFUND_REVIEW_INVALID_STATE");
  });

  test("keeps order and work-order service states synchronized", async () => {
    const sql = await readMigration();

    expect(sql).toContain("UPDATE public.tenant_service_work_orders");
    expect(sql).toContain("UPDATE public.tenant_service_orders");
    expect(sql).toContain("service_status = p_to_status");
    expect(sql).toContain("RETURN jsonb_build_object");
  });

  test("records immutable audit events for assignment and transitions", async () => {
    const sql = await readMigration();

    expect(sql).toContain("INSERT INTO public.tenant_service_work_order_events");
    expect(sql).toContain("'assign'");
    expect(sql).toContain("'transition'");
    expect(sql).toContain("operator_employee_id");
    expect(sql).toContain("metadata");
  });

  test("does not mutate unrelated credit, virtual product, or project acceptance tables", async () => {
    const sql = await readMigration();

    expect(sql).not.toMatch(/UPDATE\s+public\.tenant_credit_/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.tenant_credit_/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.platform_virtual_products/i);
    expect(sql).not.toMatch(/CREATE\s+TABLE\s+public\.project_accept/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+public\.project_accept/i);
  });

  test("adds an atomic tenant customer acceptance decision RPC", async () => {
    expect(await customerAcceptanceMigrationFile.exists()).toBe(true);
    const sql = await readCustomerAcceptanceMigration();

    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.tenant_service_decide_acceptance",
    );
    expect(sql).toContain("p_decision text");
    expect(sql).toContain("p_expected_work_order_version integer");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("SERVICE_WORK_ORDER_VERSION_CONFLICT");
    expect(sql).toContain("SERVICE_ACCEPTANCE_INVALID_STATE");
    expect(sql).toContain("customer_accept");
    expect(sql).toContain("customer_reject");
    expect(sql).toContain(
      "UPDATE public.tenant_service_acceptance_preparations",
    );
    expect(sql).not.toContain("DROP TABLE public.tenant_service_orders");
    expect(sql).not.toMatch(/UPDATE\s+public\.tenant_credit_/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.platform_virtual_products/i);
  });
});
