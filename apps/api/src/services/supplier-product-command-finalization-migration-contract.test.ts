import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL(
  "../../../../supabase/migrations/20260819113000_finalize_supplier_product_commands.sql",
  import.meta.url,
), "utf8");

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractFunction(name: string): string {
  return sql.match(new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ))?.[0] ?? "";
}

describe("supplier product command finalization migration", () => {
  test("is forward-only and transactional", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
  });

  test("closes the two legacy state mutators until safe v2 commands replace them", () => {
    for (const name of [
      "mutate_supplier_product",
      "mutate_supplier_sku_for_product",
    ]) {
      expect(compact(sql)).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?` +
          "FROM PUBLIC, anon, authenticated, service_role;",
      ));
      expect(sql).not.toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\(`,
      ));
    }
  });

  test("takes the final SKU row lock before entering the conversion delegate", () => {
    const command = compact(
      extractFunction("replace_supplier_sku_unit_conversions"),
    );
    const lockAt = command.indexOf("FOR UPDATE");
    const delegateAt = command.indexOf(
      "replace_supplier_sku_unit_conversions_pre_visibility_unsafe",
    );

    expect(command).toContain("employee.user_id = p_actor_user_id");
    expect(command).toContain("supplier_sku.id = p_supplier_sku_id");
    expect(command).toContain(
      "supplier_sku.owner_tenant_id IS NOT DISTINCT FROM p_acting_tenant_id ) ) FOR UPDATE",
    );
    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(delegateAt).toBeGreaterThan(lockAt);
  });

  test("preserves the narrow conversion command ACL", () => {
    expect(compact(sql)).toMatch(
      /REVOKE ALL ON FUNCTION public\.replace_supplier_sku_unit_conversions\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(compact(sql)).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.replace_supplier_sku_unit_conversions\([\s\S]*?TO service_role;/,
    );
  });
});
