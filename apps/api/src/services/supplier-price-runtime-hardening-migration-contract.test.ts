import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const migrationsDirectory = new URL("../../../../supabase/migrations/", import.meta.url);
const migrationName = "20260819112000_close_supplier_price_runtime_boundaries.sql";
const migrationUrl = new URL(migrationName, migrationsDirectory);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

const commandSignatures = new Map([
  [
    "create_supplier_price_list",
    "uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, uuid, uuid, text, text",
  ],
  [
    "publish_supplier_price_list",
    "uuid, uuid, uuid, integer, uuid, uuid, text, text",
  ],
  [
    "create_supplier_price_list_version",
    "uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text",
  ],
  [
    "retire_supplier_price_list",
    "uuid, uuid, uuid, integer, uuid, uuid, text, text",
  ],
  [
    "upsert_supplier_price_list_item",
    "uuid, uuid, uuid, uuid, uuid, numeric, numeric, boolean, integer, uuid, uuid, text, text",
  ],
  [
    "delete_supplier_price_list_item",
    "uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text",
  ],
]);

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractFunction(name: string): string {
  return sql.match(new RegExp(
    `CREATE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ))?.[0] ?? "";
}

function extractStatement(fragment: string): string {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .find((statement) => statement.includes(fragment)) ?? "";
}

describe("supplier price runtime hardening migration contract", () => {
  test("preserves the applied 5A and 5B migrations byte-for-byte", () => {
    const historicalHashes = new Map([
      [
        "20260819090000_harden_supplier_product_sku_contracts.sql",
        "01f9fb3e248b82e646f4cbc815d22b33acc299865dee2652d47ec3077ecf1233",
      ],
      [
        "20260819100000_harden_supplier_price_tenant_contracts.sql",
        "77f5c5d7d7a063734575c002cae23156f6bafd960190dd090fb25806c2350583",
      ],
    ]);

    for (const [name, expectedHash] of historicalHashes) {
      const contents = readFileSync(new URL(name, migrationsDirectory), "utf8");
      expect(createHash("sha256").update(contents).digest("hex")).toBe(
        expectedHash,
      );
    }
  });

  test("is a bounded forward-only transaction with an exact rollback", () => {
    expect(sql).toStartWith("-- Rollback: forward-only");
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toMatch(/COMMIT;\s*$/);
    expect(sql).not.toMatch(/\bIF NOT EXISTS\b/i);
    expect(compact(sql.slice(0, sql.indexOf("BEGIN;")))).toMatch(
      /revoke EXECUTE.*drop the six public wrappers.*rename the six private functions back.*restore service_role table writes only after/i,
    );
  });

  test("leaves service_role with read-only price table access", () => {
    for (const table of [
      "supplier_price_lists",
      "supplier_price_list_items",
    ]) {
      const revoke = compact(extractStatement(
        `REVOKE ALL ON TABLE public.${table}`,
      ));
      const grant = compact(extractStatement(
        `GRANT SELECT ON TABLE public.${table}`,
      ));
      expect(revoke).toContain("FROM PUBLIC, anon, authenticated, service_role");
      expect(grant).toBe(`GRANT SELECT ON TABLE public.${table} TO service_role`);
    }
    expect(sql).not.toMatch(
      /GRANT\s+(?:[^;]*\b)?(?:INSERT|UPDATE|DELETE)(?:\b[^;]*)?\s+ON TABLE public\.supplier_price_list/i,
    );
  });

  test("validates the bound active employee and relationship in a private helper", () => {
    const helper = compact(extractFunction("assert_supplier_price_runtime_actor"));
    expect(helper).toContain(
      "p_tenant_id uuid, p_supplier_id uuid, p_actor_user_id uuid, p_actor_employee_id uuid",
    );
    expect(helper).toContain("SECURITY DEFINER");
    expect(helper).toContain("SET search_path = pg_catalog, public");
    expect(helper).toContain("employee.id = p_actor_employee_id");
    expect(helper).toContain("employee.user_id = p_actor_user_id");
    expect(helper).toContain("employee.tenant_id = p_tenant_id");
    expect(helper).toContain("employee.status = 'active'");
    expect(helper).toContain("relationship.tenant_id = p_tenant_id");
    expect(helper).toContain("relationship.supplier_id = p_supplier_id");
    expect(helper).toContain("relationship.relationship_status = 'active'");
    expect(helper).toContain("SUPPLIER_PROXY_ACTOR_INVALID");
    expect(helper).toContain("SUPPLIER_ORDER_NOT_ELIGIBLE");
    expect(compact(extractStatement(
      "REVOKE ALL ON FUNCTION public.assert_supplier_price_runtime_actor",
    ))).toContain("FROM PUBLIC, anon, authenticated, service_role");
  });

  test("renames and fully revokes every pre-binding implementation", () => {
    for (const [name, signature] of commandSignatures) {
      expect(compact(sql)).toContain(
        `ALTER FUNCTION public.${name}( ${signature} ) RENAME TO ${name}_pre_actor_binding_unsafe`,
      );
      expect(compact(sql)).toContain(
        `REVOKE ALL ON FUNCTION public.${name}_pre_actor_binding_unsafe( ${signature} ) FROM PUBLIC, anon, authenticated, service_role`,
      );
    }
  });

  test("rechecks authorization before every idempotent delegate", () => {
    for (const [name] of commandSignatures) {
      const wrapper = compact(extractFunction(name));
      const authorizationAt = wrapper.indexOf(
        "public.assert_supplier_price_runtime_actor(",
      );
      const delegateAt = wrapper.indexOf(
        `public.${name}_pre_actor_binding_unsafe(`,
      );
      expect(wrapper).toContain("SECURITY DEFINER");
      expect(wrapper).toContain("SET search_path = pg_catalog, public");
      expect(authorizationAt).toBeGreaterThan(0);
      expect(delegateAt).toBeGreaterThan(authorizationAt);
      expect(wrapper).not.toContain("supplier_command_events");
    }
  });

  test("rejects non-finite and out-of-range price numbers before delegation", () => {
    const wrapper = compact(extractFunction("upsert_supplier_price_list_item"));
    const validationAt = wrapper.indexOf("p_unit_price::text IN");
    const authorizationAt = wrapper.indexOf(
      "public.assert_supplier_price_runtime_actor(",
    );
    const delegateAt = wrapper.indexOf(
      "public.upsert_supplier_price_list_item_pre_actor_binding_unsafe(",
    );
    expect(wrapper).toContain(
      "p_unit_price::text IN ('NaN', 'Infinity', '-Infinity')",
    );
    expect(wrapper).toContain("p_unit_price < 0");
    expect(wrapper).toContain("p_unit_price > 999999999999.99::numeric");
    expect(wrapper).toContain(
      "p_tax_rate::text IN ('NaN', 'Infinity', '-Infinity')",
    );
    expect(wrapper).toContain("p_tax_rate < 0");
    expect(wrapper).toContain("p_tax_rate > 1");
    expect(wrapper).toContain("SUPPLIER_PRICE_LIST_INVALID_ACTION");
    expect(validationAt).toBeGreaterThan(0);
    expect(authorizationAt).toBeGreaterThan(validationAt);
    expect(delegateAt).toBeGreaterThan(authorizationAt);
  });

  test("exposes only the fixed-search-path wrappers to service_role", () => {
    for (const [name, signature] of commandSignatures) {
      expect(compact(sql)).toContain(
        `REVOKE ALL ON FUNCTION public.${name}( ${signature} ) FROM PUBLIC, anon, authenticated, service_role`,
      );
      expect(compact(sql)).toContain(
        `GRANT EXECUTE ON FUNCTION public.${name}( ${signature} ) TO service_role`,
      );
    }
  });
});
