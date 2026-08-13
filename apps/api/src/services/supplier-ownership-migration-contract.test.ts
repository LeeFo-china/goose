import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260813100000_add_supplier_ownership_foundation.sql",
  import.meta.url,
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

const OWNERSHIP_TABLES = [
  "suppliers",
  "supplier_products",
  "supplier_skus",
  "catalog_categories",
  "catalog_brands",
] as const;

const STRICT_OWNERSHIP_TABLES = [
  "suppliers",
  "catalog_categories",
  "catalog_brands",
] as const;

const COMPATIBLE_OWNERSHIP_TABLES = [
  "supplier_products",
  "supplier_skus",
] as const;

const PRIVATE_TABLES = [
  ...OWNERSHIP_TABLES,
  "tenant_supplier_settings",
] as const;

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function tableStatements(table: string) {
  return [...sql.matchAll(new RegExp(`ALTER TABLE public\\.${table}[\\s\\S]*?;`, "g"))]
    .map((match) => match[0]);
}

function constraint(name: string) {
  return sql.match(
    new RegExp(`ADD CONSTRAINT ${name}[\\s\\S]*?;`),
  )?.[0] ?? "";
}

describe("supplier ownership foundation migration contract", () => {
  test("is transactional and documents the irreversible forward rollback", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toMatch(
      /^-- Rollback:[\s\S]*disable the four rollout flags[\s\S]*forward migration[\s\S]*never delete[\s\S]*ownership and tenant data/i,
    );
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(sql).not.toContain("IF NOT EXISTS");
  });

  test("adds named tenant ownership columns and foreign keys to all five tables", () => {
    for (const table of OWNERSHIP_TABLES) {
      const statements = tableStatements(table).join("\n");

      expect(statements).toMatch(/ADD COLUMN ownership_scope text/);
      expect(statements).toMatch(/ADD COLUMN owner_tenant_id uuid/);
      expect(compact(constraint(`${table}_owner_tenant_fkey`))).toMatch(
        new RegExp(
          `FOREIGN KEY \\(owner_tenant_id\\) REFERENCES public\\.tenants\\(id\\) ON DELETE RESTRICT`,
        ),
      );
    }
  });

  test("backfills completed tables deterministically before making scope required", () => {
    for (const table of STRICT_OWNERSHIP_TABLES) {
      const backfill = compact(
        sql.match(new RegExp(`UPDATE public\\.${table}[\\s\\S]*?;`))?.[0] ?? "",
      );
      const addScopeAt = sql.indexOf(
        `ALTER TABLE public.${table}\nADD COLUMN ownership_scope text`,
      );
      const backfillAt = sql.indexOf(`UPDATE public.${table}`);
      const notNullAt = sql.indexOf(
        `ALTER TABLE public.${table}\nALTER COLUMN ownership_scope SET NOT NULL`,
      );

      expect(backfill).toBe(
        `UPDATE public.${table} SET ownership_scope = 'platform', owner_tenant_id = NULL;`,
      );
      expect(addScopeAt).toBeGreaterThanOrEqual(0);
      expect(backfillAt).toBeGreaterThan(addScopeAt);
      expect(notNullAt).toBeGreaterThan(backfillAt);
      expect(compact(constraint(`${table}_ownership_check`))).toContain(
        "CHECK ( (ownership_scope = 'platform' AND owner_tenant_id IS NULL) OR (ownership_scope = 'tenant' AND owner_tenant_id IS NOT NULL) )",
      );
    }
  });

  test("keeps product and SKU ownership nullable without inferring from acting tenant", () => {
    for (const table of COMPATIBLE_OWNERSHIP_TABLES) {
      const statements = compact(tableStatements(table).join("\n"));
      const ownershipCheck = compact(constraint(`${table}_ownership_check`));

      expect(statements).not.toContain(
        "ALTER COLUMN ownership_scope SET NOT NULL",
      );
      expect(statements).not.toContain(
        "ALTER COLUMN owner_tenant_id SET NOT NULL",
      );
      expect(ownershipCheck).toContain(
        "CHECK ( (ownership_scope IS NULL AND owner_tenant_id IS NULL) OR ( ownership_scope IS NOT NULL AND ( (ownership_scope = 'platform' AND owner_tenant_id IS NULL) OR (ownership_scope = 'tenant' AND owner_tenant_id IS NOT NULL) ) ) )",
      );
    }

    expect(sql).not.toMatch(/UPDATE public\.(supplier_products|supplier_skus)/);
    expect(sql).not.toMatch(
      /(?:supplier_products|supplier_skus)[\s\S]*acting_tenant_id[\s\S]*ownership_scope/,
    );
  });

  test("guards completed ownership only with one private trigger function", () => {
    expect(sql).toMatch(
      /CREATE FUNCTION public\.guard_supplier_ownership_immutable\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SET search_path = pg_catalog, public\s+AS \$\$[\s\S]*NEW\.ownership_scope IS DISTINCT FROM OLD\.ownership_scope[\s\S]*NEW\.owner_tenant_id IS DISTINCT FROM OLD\.owner_tenant_id[\s\S]*ERRCODE = 'P0001'[\s\S]*MESSAGE = 'SUPPLIER_OWNERSHIP_IMMUTABLE'[\s\S]*RETURN NEW;[\s\S]*\$\$;/,
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.guard_supplier_ownership_immutable()\n" +
        "  FROM PUBLIC, anon, authenticated, service_role;",
    );

    const triggers = [...sql.matchAll(/^CREATE TRIGGER ([a-z0-9_]+)/gm)].map(
      (match) => match[1],
    );
    expect(triggers).toEqual([
      "tr_suppliers_guard_ownership_immutable",
      "tr_catalog_categories_guard_ownership_immutable",
      "tr_catalog_brands_guard_ownership_immutable",
    ]);

    for (const table of STRICT_OWNERSHIP_TABLES) {
      expect(sql).toMatch(
        new RegExp(
          `BEFORE UPDATE OF ownership_scope, owner_tenant_id\\s+ON public\\.${table}\\s+FOR EACH ROW\\s+EXECUTE FUNCTION public\\.guard_supplier_ownership_immutable\\(\\);`,
        ),
      );
    }
    const triggerStatements = [
      ...sql.matchAll(/CREATE TRIGGER[\s\S]*?;/g),
    ].map((match) => match[0]);
    expect(triggerStatements.join("\n")).not.toMatch(
      /ON public\.(supplier_products|supplier_skus)/,
    );
  });

  test("creates bounded ownership lookup indexes using real status columns", () => {
    const indexes = {
      suppliers:
        "ownership_scope, owner_tenant_id, operational_status, id",
      catalog_categories:
        "ownership_scope, owner_tenant_id, parent_id, status, sort_order, id",
      catalog_brands:
        "ownership_scope, owner_tenant_id, status, sort_order, id",
      supplier_products:
        "ownership_scope, owner_tenant_id, supplier_id, status, id",
      supplier_skus:
        "ownership_scope, owner_tenant_id, supplier_id, status, id",
    } as const;

    for (const [table, columns] of Object.entries(indexes)) {
      expect(compact(sql)).toContain(
        `CREATE INDEX ${table}_ownership_lookup_idx ON public.${table}( ${columns} );`,
      );
    }
  });

  test("adds four disabled rollout flags with a hard dependency order", () => {
    const settingsStatements = compact(
      tableStatements("tenant_supplier_settings").join("\n"),
    );

    for (const flag of [
      "ownership_reads_enabled",
      "private_supplier_writes_enabled",
      "private_catalog_writes_enabled",
      "procurement_snapshot_v1_enabled",
    ]) {
      expect(settingsStatements).toContain(
        `ADD COLUMN ${flag} boolean NOT NULL DEFAULT false`,
      );
    }

    const rolloutCheck = compact(
      constraint("tenant_supplier_settings_ownership_rollout_order_check"),
    );
    expect(rolloutCheck).toContain(
      "NOT module_enabled AND ( ownership_reads_enabled OR private_supplier_writes_enabled OR private_catalog_writes_enabled OR procurement_snapshot_v1_enabled )",
    );
    expect(rolloutCheck).toContain(
      "private_supplier_writes_enabled AND NOT ownership_reads_enabled",
    );
    expect(rolloutCheck).toContain(
      "private_catalog_writes_enabled AND NOT ( ownership_reads_enabled AND private_supplier_writes_enabled )",
    );
    expect(rolloutCheck).toContain(
      "procurement_snapshot_v1_enabled AND NOT ( ownership_reads_enabled AND private_supplier_writes_enabled AND private_catalog_writes_enabled )",
    );
  });

  test("reasserts forced RLS and service-role-only table privileges", () => {
    for (const table of PRIVATE_TABLES) {
      expect(sql).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      );
      expect(sql).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
      );
      expect(sql).toContain(
        `REVOKE ALL ON TABLE public.${table}\n` +
          "  FROM PUBLIC, anon, authenticated, service_role;",
      );
      expect(sql).toContain(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table}\n` +
          "  TO service_role;",
      );
    }
  });

  test("upserts domain permissions into the intended scoped admin roles", () => {
    for (const permission of [
      "platform.supplier-product.manage",
      "supplier.master.manage",
      "supplier.catalog.manage",
    ]) {
      expect(sql).toContain(`'${permission}'`);
    }
    expect(sql).toContain(
      "'platform.supplier-product.manage', '管理平台共享商品', " +
        "'platform_supplier', 'supplier_product', 'manage'",
    );
    expect(sql).toContain(
      "'supplier.master.manage', '管理本租户私有供应商主档', " +
        "'supplier', 'master', 'manage'",
    );
    expect(sql).toContain(
      "'supplier.catalog.manage', '管理本租户分类、品牌和规格模板', " +
        "'supplier', 'catalog', 'manage'",
    );
    expect(sql).toMatch(
      /ON CONFLICT \(code\) DO UPDATE SET[\s\S]*status = EXCLUDED\.status;/,
    );
    expect(sql).toMatch(
      /permissions\.code = 'platform\.supplier-product\.manage'[\s\S]*roles\.code = 'platform_admin'[\s\S]*roles\.tenant_id IS NULL[\s\S]*ON CONFLICT \(role_id, permission_id\) DO UPDATE SET\s+access_scope = EXCLUDED\.access_scope;/,
    );
    expect(sql).toMatch(
      /permissions\.code IN \(\s*'supplier\.master\.manage',\s*'supplier\.catalog\.manage'\s*\)[\s\S]*roles\.code = 'system_admin'[\s\S]*roles\.tenant_id IS NOT NULL[\s\S]*ON CONFLICT \(role_id, permission_id\) DO UPDATE SET\s+access_scope = EXCLUDED\.access_scope;/,
    );
    expect(sql).toMatch(/SELECT roles\.id, permissions\.id, 'all'/);
  });
});
