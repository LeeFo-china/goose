import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const migrationsDirectory = new URL("../../../../supabase/migrations/", import.meta.url);
const migrationName = "20260819100000_harden_supplier_price_tenant_contracts.sql";
const migrationUrl = new URL(migrationName, migrationsDirectory);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
const migrationChain = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(new URL(name, migrationsDirectory), "utf8"))
  .join("\n");
const commandErrorMapper = readFileSync(
  new URL("../repositories/supplier-command-errors.ts", import.meta.url),
  "utf8",
);

const historicalHashes = new Map([
  [
    "20260729160000_create_supplier_products_and_base_prices.sql",
    "5fe5a4a98c47ff34ba34b8090a0f511baa66b040cbde779f39965934ba970165",
  ],
  [
    "20260813180000_scope_supplier_products_and_prices.sql",
    "77fe7e3403c670b09a72a77929c518fffac1f3c7bbb373b12092011544a133d1",
  ],
  [
    "20260818120000_preserve_pre_v2_supplier_catalog_boundaries.sql",
    "f74eb4525519cd4965b65243bbab0d05468b58ec0927d6fd1ed84f860cd03374",
  ],
  [
    "20260819090000_harden_supplier_product_sku_contracts.sql",
    "01f9fb3e248b82e646f4cbc815d22b33acc299865dee2652d47ec3077ecf1233",
  ],
]);

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractLastFunction(name: string): string {
  const matches = [...migrationChain.matchAll(new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    "g",
  ))];
  return matches.at(-1)?.[0] ?? "";
}

function statementContaining(fragment: string): string {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .find((statement) => statement.includes(fragment)) ?? "";
}

describe("supplier price tenant ownership migration contract", () => {
  test("preserves the applied price migrations byte-for-byte", () => {
    for (const [name, expectedHash] of historicalHashes) {
      const contents = readFileSync(new URL(name, migrationsDirectory), "utf8");
      expect(createHash("sha256").update(contents).digest("hex")).toBe(
        expectedHash,
      );
    }
  });

  test("is a bounded forward transaction with an exact rollback procedure", () => {
    const rollbackHeader = compact(
      sql.slice(0, sql.indexOf("\n\nBEGIN;")).replace(/^-- ?/gm, ""),
    );
    expect(rollbackHeader).toMatch(
      /^Rollback: forward-only and maintenance-window only\./,
    );
    expect(rollbackHeader).toMatch(
      /^Rollback:[\s\S]*revoke EXECUTE[\s\S]*preserve every published\/retired list[\s\S]*restore create_supplier_price_list from 20260813180000[\s\S]*five compatibility wrappers[\s\S]*published-data lock[\s\S]*drop the v2 triggers\/helpers[\s\S]*recreate the legacy global version and draft keys only after proving one tenant owns every normalized series/i,
    );
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).not.toMatch(
      /\b(?:CREATE|ALTER|ADD|DROP)\s+(?:TABLE|INDEX|CONSTRAINT|COLUMN|FUNCTION|TRIGGER)?[^;]*\bIF NOT EXISTS\b/i,
    );
  });

  test("materializes only provable relationship and product identities", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.supplier_price_lists\s+ADD COLUMN tenant_supplier_id uuid NULL/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.supplier_price_list_items\s+ADD COLUMN supplier_product_id uuid NULL/,
    );
    expect(compact(statementContaining(
      "UPDATE public.supplier_price_lists AS price_list",
    ))).toContain(
      "FROM public.tenant_suppliers AS relationship WHERE relationship.tenant_id = price_list.tenant_id AND relationship.supplier_id = price_list.supplier_id",
    );
    expect(compact(statementContaining(
      "UPDATE public.supplier_price_list_items AS item",
    ))).toContain(
      "FROM public.supplier_skus AS sku WHERE sku.id = item.supplier_sku_id AND sku.supplier_id = item.supplier_id",
    );
    expect(sql).not.toMatch(
      /ALTER COLUMN (?:tenant_supplier_id|supplier_product_id) SET NOT NULL/,
    );
    const listsDisabledAt = sql.indexOf(
      "ALTER TABLE public.supplier_price_lists DISABLE TRIGGER USER;",
    );
    const listsUpdatedAt = sql.indexOf(
      "UPDATE public.supplier_price_lists AS price_list",
    );
    const listsEnabledAt = sql.indexOf(
      "ALTER TABLE public.supplier_price_lists ENABLE TRIGGER USER;",
    );
    expect(listsDisabledAt).toBeGreaterThanOrEqual(0);
    expect(listsUpdatedAt).toBeGreaterThan(listsDisabledAt);
    expect(listsEnabledAt).toBeGreaterThan(listsUpdatedAt);
    const itemsDisabledAt = sql.indexOf(
      "ALTER TABLE public.supplier_price_list_items DISABLE TRIGGER USER;",
    );
    const itemsUpdatedAt = sql.indexOf(
      "UPDATE public.supplier_price_list_items AS item",
    );
    const itemsEnabledAt = sql.indexOf(
      "ALTER TABLE public.supplier_price_list_items ENABLE TRIGGER USER;",
    );
    expect(itemsDisabledAt).toBeGreaterThanOrEqual(0);
    expect(itemsUpdatedAt).toBeGreaterThan(itemsDisabledAt);
    expect(itemsEnabledAt).toBeGreaterThan(itemsUpdatedAt);
  });

  test("adds composite identities and staged tenant-safe foreign keys", () => {
    const normalizedSql = compact(sql);
    expect(normalizedSql).toContain(
      "supplier_price_lists_id_tenant_supplier_key UNIQUE (id, tenant_id, supplier_id)",
    );
    expect(normalizedSql).toContain(
      "supplier_price_lists_relationship_fkey FOREIGN KEY (tenant_supplier_id, tenant_id, supplier_id)",
    );
    expect(normalizedSql).toContain(
      "REFERENCES public.tenant_suppliers(id, tenant_id, supplier_id)",
    );
    expect(normalizedSql).toContain(
      "supplier_price_items_list_tenant_supplier_fkey FOREIGN KEY (supplier_price_list_id, tenant_id, supplier_id)",
    );
    expect(normalizedSql).toContain(
      "supplier_price_items_product_supplier_fkey FOREIGN KEY (supplier_product_id, supplier_id)",
    );
    expect(sql).toMatch(
      /ADD CONSTRAINT supplier_price_lists_relationship_fkey[\s\S]*?NOT VALID/,
    );
    expect(sql).toMatch(
      /ADD CONSTRAINT supplier_price_items_list_tenant_supplier_fkey[\s\S]*?NOT VALID/,
    );
    expect(sql).not.toContain(
      "VALIDATE CONSTRAINT supplier_price_lists_supersedes_tenant_fkey",
    );
  });

  test("replaces global series conflicts with normalized tenant-scoped keys", () => {
    expect(sql).toContain(
      "DROP CONSTRAINT supplier_price_lists_supplier_version_key",
    );
    expect(sql).toContain("DROP INDEX supplier_price_lists_one_draft_idx");
    expect(compact(statementContaining(
      "CREATE UNIQUE INDEX supplier_price_lists_tenant_series_version_uidx",
    ))).toContain(
      "ON public.supplier_price_lists( tenant_id, supplier_id, upper(btrim(price_list_code)), version_number )",
    );
    expect(compact(statementContaining(
      "CREATE UNIQUE INDEX supplier_price_lists_tenant_one_draft_uidx",
    ))).toContain(
      "tenant_id, supplier_id, upper(btrim(price_list_code))",
    );
    expect(sql).toContain("WHERE lifecycle_status = 'draft'");
    expect(compact(statementContaining(
      "CREATE INDEX supplier_price_lists_tenant_supplier_status_idx",
    ))).toContain("tenant_id, supplier_id, lifecycle_status");
    expect(compact(statementContaining(
      "CREATE INDEX supplier_price_items_tenant_supplier_list_idx",
    ))).toContain("tenant_id, supplier_id, supplier_price_list_id");
  });

  test("fails closed unless list, relationship, item, SKU and product agree", () => {
    const guard = compact(extractLastFunction("guard_supplier_price_tenant"));
    expect(guard).toContain("NEW.tenant_id IS NULL");
    expect(guard).toContain("NEW.tenant_supplier_id IS NULL");
    expect(guard).toContain("relationship.relationship_status = 'active'");
    expect(guard).toContain("relationship.id = NEW.tenant_supplier_id");
    expect(guard).toContain("relationship.tenant_id = NEW.tenant_id");
    expect(guard).toContain("relationship.supplier_id = NEW.supplier_id");
    expect(guard).toContain("price_list.tenant_id = NEW.tenant_id");
    expect(guard).toContain("price_list.supplier_id = NEW.supplier_id");
    expect(guard).toContain("NEW.supplier_product_id IS NULL");
    expect(guard).toContain("sku.supplier_product_id = NEW.supplier_product_id");
    expect(guard).toContain("product.id = NEW.supplier_product_id");
    expect(guard).toContain("product.supplier_id = NEW.supplier_id");
    expect(guard).toContain("sku.ownership_scope = 'platform'");
    expect(guard).toContain("product.ownership_scope = 'platform'");
    expect(guard).toContain("sku.ownership_scope = 'tenant'");
    expect(guard).toContain("sku.owner_tenant_id = NEW.tenant_id");
    expect(guard).toContain("product.ownership_scope = 'tenant'");
    expect(guard).toContain("product.owner_tenant_id = NEW.tenant_id");
    expect(guard).not.toContain("sku.ownership_scope IS NULL");
    expect(guard).toContain("SUPPLIER_PRICE_LIST_INVALID_ACTION");
  });

  test("keeps every public price command tenant-aware and self-contained", () => {
    const signatures = new Map([
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
    const normalizedSql = compact(sql);
    for (const [name, signature] of signatures) {
      const command = compact(extractLastFunction(name));
      expect(command).toContain("SECURITY DEFINER");
      expect(command).toContain("SET search_path = pg_catalog, public");
      expect(command).toContain("supplier_command_events");
      expect(command).toContain("p_tenant_id");
      expect(command).not.toContain(`${name}_pre_v2_unsafe`);
      expect(sql).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role;`,
      ));
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?TO service_role;`,
      ));
      expect(normalizedSql).toContain(
        `REVOKE ALL ON FUNCTION public.${name}( ${signature} ) FROM PUBLIC, anon, authenticated, service_role;`,
      );
      expect(normalizedSql).toContain(
        `GRANT EXECUTE ON FUNCTION public.${name}( ${signature} ) TO service_role;`,
      );
    }
  });

  test("scopes locks, source chains and publication overlap to one tenant", () => {
    for (const name of [
      "create_supplier_price_list",
      "publish_supplier_price_list",
      "create_supplier_price_list_version",
      "retire_supplier_price_list",
    ]) {
      const command = compact(extractLastFunction(name));
      expect(command).toMatch(
        /supplier-price-(?:series|publish):' \|\| p_tenant_id::text/,
      );
    }

    const publish = compact(extractLastFunction("publish_supplier_price_list"));
    expect(publish).toContain("published.tenant_id = v_draft.tenant_id");
    expect(publish).toContain("published.supplier_id = v_draft.supplier_id");
    expect(publish).toContain("draft_item.tenant_id = v_draft.tenant_id");
    expect(publish).toContain("FOR SHARE OF sku, product");
    expect(publish).toContain("SUPPLIER_PRICE_PERIOD_CONFLICT");

    const createVersion = compact(
      extractLastFunction("create_supplier_price_list_version"),
    );
    expect(createVersion).toContain("source.tenant_id = p_tenant_id");
    expect(createVersion).toContain("supersedes_price_list_id");
    expect(createVersion).toContain("source_item.tenant_id = v_source.tenant_id");
  });

  test("returns not-found before version metadata for cross-tenant resources", () => {
    for (const name of [
      "publish_supplier_price_list",
      "create_supplier_price_list_version",
      "retire_supplier_price_list",
      "upsert_supplier_price_list_item",
      "delete_supplier_price_list_item",
    ]) {
      const command = extractLastFunction(name);
      const tenantFilterAt = command.indexOf("tenant_id = p_tenant_id");
      const notFoundAt = command.indexOf("SUPPLIER_PRICE_LIST_NOT_FOUND");
      const versionAt = command.indexOf("SUPPLIER_PRICE_LIST_VERSION_CONFLICT");
      expect(tenantFilterAt).toBeGreaterThanOrEqual(0);
      expect(notFoundAt).toBeGreaterThan(tenantFilterAt);
      if (versionAt >= 0) {
        expect(versionAt).toBeGreaterThan(notFoundAt);
      }
    }
  });

  test("locks every published fact except the audited retirement transition", () => {
    const immutable = compact(
      extractLastFunction("lock_published_supplier_price_data"),
    );
    for (const field of [
      "tenant_id",
      "tenant_supplier_id",
      "supplier_id",
      "price_list_code",
      "version_number",
      "effective_from",
      "effective_until",
      "created_by_employee_id",
      "created_at",
    ]) {
      expect(immutable).toContain(`NEW.${field} IS NOT DISTINCT FROM OLD.${field}`);
    }
    expect(immutable).toContain("OLD.lifecycle_status = 'published'");
    expect(immutable).toContain("NEW.lifecycle_status = 'retired'");
    expect(immutable).toContain("NEW.row_version = OLD.row_version + 1");
    expect(immutable).toContain("price_list_status IS DISTINCT FROM 'draft'");
  });

  test("retains FORCE RLS, browser denial and narrow command execution", () => {
    const normalizedSql = compact(sql);
    for (const table of [
      "supplier_price_lists",
      "supplier_price_list_items",
    ]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`);
      expect(sql).toMatch(new RegExp(
        `REVOKE ALL ON TABLE public\\.${table}[\\s\\S]*?FROM PUBLIC, anon, authenticated;`,
      ));
    }
    expect(normalizedSql).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_price_lists TO service_role;",
    );
    expect(normalizedSql).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_price_list_items TO service_role;",
    );
  });

  test("uses only stable price command codes already handled by the API", () => {
    const codes = new Set(
      [...sql.matchAll(/MESSAGE\s*=\s*'(SUPPLIER_[A-Z0-9_]+)'/g)]
        .map((match) => match[1]),
    );
    for (const code of codes) {
      expect(commandErrorMapper).toContain(`${code}:`);
    }
  });
});
