import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL(
  "../../../../supabase/migrations/20260819111500_finalize_supplier_product_runtime_acl.sql",
  import.meta.url,
), "utf8");

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

describe("supplier product runtime ACL finalization migration", () => {
  test("is forward-only and transactional", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
  });

  test("keeps the legacy generic SKU mutator private", () => {
    expect(compact(sql)).toMatch(
      /REVOKE ALL ON FUNCTION public\.mutate_supplier_sku\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.mutate_supplier_sku\(/,
    );
  });

  test("exposes only the two scoped safe mutators to service_role", () => {
    for (const name of [
      "mutate_supplier_product",
      "mutate_supplier_sku_for_product",
    ]) {
      expect(compact(sql)).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?` +
          "FROM PUBLIC, anon, authenticated, service_role;",
      ));
      expect(compact(sql)).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?` +
          "TO service_role;",
      ));
    }
  });
});
