import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationDir = join(
  import.meta.dir,
  "../../../../supabase/migrations",
);

describe("tenant subscription billing migration", () => {
  test("creates subscription billing tables and charge recovery RPCs", () => {
    const migrationSource = readLatestTenantSubscriptionBillingMigration();

    expect(migrationSource).toContain(
      "CREATE TABLE IF NOT EXISTS public.tenant_billing_plans",
    );
    expect(migrationSource).toContain(
      "CREATE TABLE IF NOT EXISTS public.tenant_billing_subscriptions",
    );
    expect(migrationSource).toContain(
      "CREATE TABLE IF NOT EXISTS public.tenant_subscription_invoices",
    );
    expect(migrationSource).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_charge_subscription_invoice",
    );
    expect(migrationSource).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_recover_subscription_after_recharge",
    );
    expect(migrationSource).toContain(
      "tenant_subscription_invoices_tenant_period_unique_idx",
    );
    expect(migrationSource).toContain("'subscription_monthly_fee'");
    expect(migrationSource).toContain("'tenant_subscription_invoice'");
    expect(migrationSource).toContain(
      "REVOKE ALL ON FUNCTION public.billing_charge_subscription_invoice",
    );
    expect(migrationSource).toContain(
      "GRANT EXECUTE ON FUNCTION public.billing_charge_subscription_invoice",
    );
    expect(migrationSource).toContain(
      "TENANT_SUBSCRIPTION_INVOICE_TENANT_MISMATCH",
    );
    expect(migrationSource).toContain("FOREIGN KEY (subscription_id, tenant_id)");
    expect(migrationSource).toContain("FOREIGN KEY (last_invoice_id, tenant_id)");
    expect(migrationSource).toContain("TENANT_CREDIT_LEDGER_CONFLICT");
    expect(migrationSource).toContain("GET STACKED DIAGNOSTICS");
    expect(migrationSource).toContain("RAISE;");
  });
});

describe("billing subscription repository contract", () => {
  test("uses subscription tables, due invoice queries, pagination, and charge recovery RPCs", () => {
    const repositorySource = readFileSync(
      join(import.meta.dir, "../repositories/billing-subscriptions.ts"),
      "utf8",
    );

    expect(repositorySource).toContain("tenant_billing_subscriptions");
    expect(repositorySource).toContain("tenant_subscription_invoices");
    expect(repositorySource).toContain("listInvoicesDueForReminder");
    expect(repositorySource).toContain("listInvoicesDueForCharge");
    expect(repositorySource).toContain(".range(from, to)");
    expect(repositorySource).toContain("billing_charge_subscription_invoice");
    expect(repositorySource).toContain(
      "billing_recover_subscription_after_recharge",
    );
  });
});

function readLatestTenantSubscriptionBillingMigration() {
  const migrationFile = readdirSync(migrationDir)
    .filter((fileName) =>
      fileName.endsWith("_create_tenant_subscription_billing.sql")
    )
    .sort()
    .at(-1);

  if (!migrationFile) {
    throw new Error("No tenant subscription billing migration found");
  }

  return readFileSync(join(migrationDir, migrationFile), "utf8");
}
