import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const concurrencyFixtureSource = readFileSync(
  new URL(
    "./supplier-purchase-requisition-smoke-concurrency-fixture.ts",
    import.meta.url,
  ),
  "utf8",
);

test("seeds concurrent supplier fixtures with current catalog contracts", () => {
  expect(concurrencyFixtureSource).toContain("internal_supplier_code");
  expect(concurrencyFixtureSource).toContain("spec_values");
  expect(concurrencyFixtureSource).toContain("command_supplier_price_list_v2");
  expect(concurrencyFixtureSource).toContain("tenant_supplier_id");
  expect(concurrencyFixtureSource).toContain("supplier_product_id");
  expect(concurrencyFixtureSource).not.toContain(
    "set lifecycle_status = 'published'",
  );
});
