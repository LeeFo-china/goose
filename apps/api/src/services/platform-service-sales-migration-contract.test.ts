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
const atomicHardeningMigrationPath = new URL(
  "../../../../supabase/migrations/20260804110000_harden_platform_service_sales_atomicity.sql",
  import.meta.url,
);
const readAtomicHardeningMigration = () =>
  Bun.file(atomicHardeningMigrationPath).text();
const devSmokeProductMigrationPath = new URL(
  "../../../../supabase/migrations/20260804120000_seed_dev_platform_service_smoke_product.sql",
  import.meta.url,
);
const devSmokeProductMigrationFile = Bun.file(devSmokeProductMigrationPath);
const readDevSmokeProductMigration = () => devSmokeProductMigrationFile.text();
const devSmokeProductPointerMigrationPath = new URL(
  "../../../../supabase/migrations/20260804121000_fix_dev_platform_service_smoke_product_pointer.sql",
  import.meta.url,
);
const devSmokeProductPointerMigrationFile = Bun.file(
  devSmokeProductPointerMigrationPath,
);
const readDevSmokeProductPointerMigration = () =>
  devSmokeProductPointerMigrationFile.text();

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

  test("hardens publish and refund transitions with atomic RPCs", async () => {
    const sql = await readAtomicHardeningMigration();
    expect(sql).toContain("platform_service_publish_product_version");
    expect(sql).toContain("platform_service_request_refund_review");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("SERVICE_PRODUCT_VERSION_CONFLICT");
    expect(sql).toContain("SERVICE_ORDER_VERSION_CONFLICT");
  });

  test("prevents product code changes after service orders exist", async () => {
    const sql = await readAtomicHardeningMigration();
    expect(sql).toContain("platform_service_prevent_ordered_product_code_change");
    expect(sql).toContain("SERVICE_PRODUCT_CODE_LOCKED");
    expect(sql).toMatch(/CREATE\s+TRIGGER\s+tr_platform_service_products_code_lock/i);
  });

  test("seeds the small payment smoke product only for development", async () => {
    expect(await devSmokeProductMigrationFile.exists()).toBe(true);
    const sql = await readDevSmokeProductMigration();
    expect(sql).toContain("platform_service_smoke_1fen");
    expect(sql).toContain("WECHAT_MINIPROGRAM_ENV_VERSION");
    expect(sql).toContain("develop");
    expect(sql).toContain("amount_fen <= 100");
    expect(sql).toContain("dev-only payment smoke product");
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.tenant_service_orders/i);
  });

  test("repairs the dev smoke product published-version pointer separately", async () => {
    expect(await devSmokeProductPointerMigrationFile.exists()).toBe(true);
    const sql = await readDevSmokeProductPointerMigration();
    expect(sql).toContain("platform_service_smoke_1fen");
    expect(sql).toContain("WECHAT_MINIPROGRAM_ENV_VERSION");
    expect(sql).toMatch(/UPDATE\s+public\.platform_service_products\s+AS\s+product/i);
    expect(sql).toContain("published_version_id = version.id");
  });
});
