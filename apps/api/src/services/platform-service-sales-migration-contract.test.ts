import { describe, expect, test } from "bun:test";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260803110000_create_platform_service_sales_foundation.sql",
  import.meta.url,
);
const readMigration = () => Bun.file(migrationPath).text();
const seedPointerFixMigrationPath = new URL(
  "../../../../supabase/migrations/20260803114000_fix_platform_service_seed_publish_pointers.sql",
  import.meta.url,
);
const readSeedPointerFixMigration = () =>
  Bun.file(seedPointerFixMigrationPath).text();

describe("platform service sales migration", () => {
  test("creates isolated service sales tables", async () => {
    const sql = await readMigration();
    for (const table of [
      "platform_service_products",
      "platform_service_product_versions",
      "tenant_service_orders",
      "tenant_service_work_orders",
      "tenant_service_wechat_notifications",
      "tenant_service_refund_requests",
    ]) {
      expect(sql).toContain(`CREATE TABLE public.${table}`);
    }
  });

  test("does not mutate credit or virtual product data", async () => {
    const sql = await readMigration();
    expect(sql).not.toMatch(/UPDATE\s+public\.tenant_credit_/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.tenant_credit_/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.platform_virtual_products/i);
  });

  test("creates guarded order and atomic payment confirmation RPCs", async () => {
    const sql = await readMigration();
    expect(sql).toContain("platform_service_create_pending_order");
    expect(sql).toContain("platform_service_confirm_payment");
    expect(sql).toContain("FOR UPDATE");
  });

  test("repairs default product published-version pointers through migration", async () => {
    const sql = await readSeedPointerFixMigration();
    expect(sql).toContain("platform_service_1y");
    expect(sql).toContain("platform_service_2y");
    expect(sql).toContain("platform_service_3y");
    expect(sql).toMatch(/UPDATE\s+public\.platform_service_products/i);
    expect(sql).toContain("PLATFORM_SERVICE_SEED_PUBLISHED_VERSION_MISSING");
  });
});
