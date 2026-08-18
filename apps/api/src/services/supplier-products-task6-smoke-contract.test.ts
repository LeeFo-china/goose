import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const smokeUrl = new URL(
  "../../../../scripts/smoke-supplier-products-task6.sql",
  import.meta.url,
);
const sql = existsSync(smokeUrl) ? readFileSync(smokeUrl, "utf8") : "";

describe("Task 6 supplier product database smoke", () => {
  test("is local-only, fixture-owned and always rolled back", () => {
    expect(sql).toContain("127.0.0.1:54322");
    expect(sql).toContain("current_setting('task6.local_endpoint', true)");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bROLLBACK;\s*$/);
    expect(sql).not.toMatch(/\bCOMMIT;/);
    expect(sql).toContain("a6000000-0000-4000-8000-000000000001");
    expect(sql).not.toContain("ORDER BY id LIMIT 1");
  });

  test("covers scope, historical read, replay revalidation and category guard", () => {
    for (const marker of [
      "task6 platform shared visibility",
      "task6 tenant A private visibility",
      "task6 tenant B private absence",
      "task6 inactive relationship historical read",
      "task6 actor unlink replay rejection",
      "task6 relationship suspension replay rejection",
      "task6 platform permission revoke replay rejection",
      "task6 platform deny override replay rejection",
      "task6 idempotent replay",
      "PRODUCT_CATEGORY_CHANGE_REQUIRES_SKU_MIGRATION",
      "sku_code ILIKE",
    ]) {
      expect(sql, marker).toContain(marker);
    }
  });

  test("avoids the unstable service-role negative invocation path", () => {
    expect(sql).not.toMatch(/SET LOCAL ROLE service_role/);
    expect(sql).not.toMatch(/SET ROLE service_role/);
    expect(sql).toContain("has_function_privilege('service_role'");
  });
});
