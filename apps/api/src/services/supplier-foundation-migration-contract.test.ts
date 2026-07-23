import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPaths = {
  masterData: new URL(
    "../../../../supabase/migrations/20260723140000_create_supplier_master_data.sql",
    import.meta.url,
  ),
  tenantSupplierRelationships: new URL(
    "../../../../supabase/migrations/20260723141000_create_tenant_supplier_relationships.sql",
    import.meta.url,
  ),
  standardCatalog: new URL(
    "../../../../supabase/migrations/20260723142000_create_supplier_standard_catalog.sql",
    import.meta.url,
  ),
  foundationCommands: new URL(
    "../../../../supabase/migrations/20260723143000_create_supplier_foundation_commands.sql",
    import.meta.url,
  ),
  foundationPermissions: new URL(
    "../../../../supabase/migrations/20260723144000_seed_supplier_foundation_permissions.sql",
    import.meta.url,
  ),
} as const;

function readMigration(migrationPath: URL) {
  return existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
}

const migrationSql = {
  masterData: readMigration(migrationPaths.masterData),
  tenantSupplierRelationships: readMigration(
    migrationPaths.tenantSupplierRelationships,
  ),
  standardCatalog: readMigration(migrationPaths.standardCatalog),
  foundationCommands: readMigration(migrationPaths.foundationCommands),
  foundationPermissions: readMigration(migrationPaths.foundationPermissions),
} as const;

function readMasterDataMigration() {
  return migrationSql.masterData;
}

function extractCreateTableStatement(sql: string, table: string) {
  const statementStart = sql.search(
    new RegExp(`CREATE TABLE public\\.${table}\\s*\\(`, "i"),
  );
  if (statementStart < 0) return "";

  const bodyStart = sql.indexOf("(", statementStart);
  let depth = 0;
  let isInsideString = false;
  for (let index = bodyStart; index < sql.length; index += 1) {
    const character = sql[index];
    if (character === "'") {
      if (isInsideString && sql[index + 1] === "'") {
        index += 1;
        continue;
      }
      isInsideString = !isInsideString;
      continue;
    }
    if (isInsideString) continue;
    if (character === "(") depth += 1;
    if (character !== ")") continue;

    depth -= 1;
    if (depth === 0) {
      const statementEnd = sql.indexOf(";", index);
      return sql.slice(
        statementStart,
        statementEnd >= 0 ? statementEnd + 1 : index + 1,
      );
    }
  }
  return "";
}

function splitTopLevelSqlClauses(tableStatement: string) {
  const bodyStart = tableStatement.indexOf("(");
  const bodyEnd = tableStatement.lastIndexOf(")");
  if (bodyStart < 0 || bodyEnd <= bodyStart) return [];

  const body = tableStatement.slice(bodyStart + 1, bodyEnd);
  const clauses: string[] = [];
  let clauseStart = 0;
  let depth = 0;
  let isInsideString = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "'") {
      if (isInsideString && body[index + 1] === "'") {
        index += 1;
        continue;
      }
      isInsideString = !isInsideString;
      continue;
    }
    if (isInsideString) continue;
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character !== "," || depth !== 0) continue;

    clauses.push(body.slice(clauseStart, index).trim());
    clauseStart = index + 1;
  }
  clauses.push(body.slice(clauseStart).trim());
  return clauses.filter(Boolean);
}

function findQualificationTypeNameUniqueness(sql: string) {
  const tableStatement = extractCreateTableStatement(
    sql,
    "supplier_qualification_types",
  );
  const tableViolations = splitTopLevelSqlClauses(tableStatement)
    .filter((clause) => /\bUNIQUE\b/i.test(clause) && /\bname\b/i.test(clause));
  const indexViolations = [
    ...sql.matchAll(/CREATE\s+UNIQUE\s+INDEX\b[\s\S]*?;/gi),
  ]
    .map((match) => match[0])
    .filter((statement) => {
      const tableReference =
        /\bON\s+(?:ONLY\s+)?public\.supplier_qualification_types\b/i.exec(
          statement,
        );
      if (!tableReference || tableReference.index === undefined) return false;
      const indexDefinition = statement.slice(
        tableReference.index + tableReference[0].length,
      );
      return /\bname\b/i.test(indexDefinition);
    });

  return [...tableViolations, ...indexViolations];
}

describe("supplier foundation migration contract", () => {
  test("creates the six supplier master-data tables and required indexes", () => {
    const sql = readMasterDataMigration();
    const createdTables = [
      ...sql.matchAll(/^CREATE TABLE public\.([a-z0-9_]+) \(/gm),
    ].map((match) => match[1]);
    const requiredContracts = [
      "CREATE TABLE public.supplier_qualification_types",
      "CREATE TABLE public.suppliers",
      "CREATE TABLE public.supplier_qualifications",
      "CREATE TABLE public.supplier_service_regions",
      "CREATE TABLE public.supplier_addresses",
      "CREATE TABLE public.supplier_contacts",
      "suppliers_credit_code_unique_idx",
      "suppliers_platform_queue_idx",
      "supplier_qualifications_health_lookup_idx",
      "supplier_service_regions_lookup_idx",
      "supplier_addresses_supplier_type_status_default_idx",
      "supplier_contacts_supplier_type_idx",
    ] as const;

    expect(createdTables).toEqual([
      "supplier_qualification_types",
      "suppliers",
      "supplier_qualifications",
      "supplier_service_regions",
      "supplier_addresses",
      "supplier_contacts",
    ]);
    for (const contract of requiredContracts) {
      expect(sql).toContain(contract);
    }
  });

  test("locks normalized supplier and active-history lookup indexes", () => {
    const sql = readMasterDataMigration();

    expect(sql).toMatch(
      /CREATE UNIQUE INDEX suppliers_credit_code_unique_idx\s+ON public\.suppliers\(upper\(btrim\(unified_social_credit_code\)\)\)\s+WHERE unified_social_credit_code IS NOT NULL\s+AND btrim\(unified_social_credit_code\) <> '';/,
    );
    expect(sql).toMatch(
      /CREATE INDEX suppliers_platform_queue_idx\s+ON public\.suppliers\(\s*onboarding_status,\s*operational_status,\s*updated_at DESC,\s*id DESC\s*\);/,
    );
    expect(sql).toMatch(
      /CREATE INDEX supplier_addresses_supplier_type_status_default_idx\s+ON public\.supplier_addresses\(\s*supplier_id,\s*address_type,\s*status,\s*is_default DESC\s*\);/,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX supplier_addresses_active_default_type_unique_idx\s+ON public\.supplier_addresses\(supplier_id, address_type\)\s+WHERE is_default AND status = 'active';/,
    );
    expect(sql).toMatch(
      /CREATE INDEX supplier_contacts_supplier_type_idx\s+ON public\.supplier_contacts\(\s*supplier_id,\s*contact_type,\s*is_primary DESC\s*\);/,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX supplier_contacts_active_primary_type_unique_idx\s+ON public\.supplier_contacts\(supplier_id, contact_type\)\s+WHERE is_primary AND status = 'active';/,
    );
  });

  test("locks qualification-type membership, bounds, and positive versions", () => {
    const sql = readMasterDataMigration();
    const qualificationTypeTable = extractCreateTableStatement(
      sql,
      "supplier_qualification_types",
    );
    const supplierTypes = [
      "manufacturer",
      "brand_agent",
      "distributor",
      "retailer",
      "other",
    ] as const;

    expect(qualificationTypeTable).toMatch(
      /^\s*code text NOT NULL UNIQUE,\s*$/m,
    );
    expect(qualificationTypeTable).toContain("name text NOT NULL");
    expect(qualificationTypeTable).toMatch(
      /CONSTRAINT supplier_qualification_types_name_not_blank_check\s+CHECK \(btrim\(name\) <> ''\)/,
    );
    expect(findQualificationTypeNameUniqueness(sql)).toEqual([]);
    expect(qualificationTypeTable).toContain(
      "applicable_supplier_types text[] NOT NULL DEFAULT '{}'::text[]",
    );
    expect(qualificationTypeTable).toMatch(
      /applicable_supplier_types <@ ARRAY\[\s*'manufacturer',\s*'brand_agent',\s*'distributor',\s*'retailer',\s*'other'\s*\]::text\[\]/,
    );
    expect(qualificationTypeTable).toContain(
      "array_position(applicable_supplier_types, NULL) IS NULL",
    );
    for (const supplierType of supplierTypes) {
      expect(qualificationTypeTable).toContain(
        `cardinality(array_positions(applicable_supplier_types, '${supplierType}')) <= 1`,
      );
    }
    expect(qualificationTypeTable).toContain(
      "warning_days integer NOT NULL DEFAULT 30",
    );
    expect(qualificationTypeTable).toMatch(
      /CONSTRAINT supplier_qualification_types_warning_days_check\s+CHECK \(warning_days BETWEEN 0 AND 3650\)/,
    );

    for (const table of [
      "supplier_qualification_types",
      "suppliers",
      "supplier_qualifications",
      "supplier_service_regions",
      "supplier_addresses",
      "supplier_contacts",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `CONSTRAINT ${table}_version_check\\s+CHECK \\(version > 0\\)`,
        ),
      );
    }
  });

  test("rejects every qualification-type name uniqueness form", () => {
    const illegalVariants = [
      `CREATE TABLE public.supplier_qualification_types (
        code text NOT NULL UNIQUE,
        name text NOT NULL UNIQUE
      );`,
      `CREATE TABLE public.supplier_qualification_types (
        code text NOT NULL UNIQUE,
        name text NOT NULL,
        CONSTRAINT supplier_qualification_types_code_name_key
          UNIQUE (code, name)
      );`,
      `CREATE TABLE public.supplier_qualification_types (
        code text NOT NULL UNIQUE,
        name text NOT NULL,
        UNIQUE (upper(btrim(name)))
      );`,
      `CREATE UNIQUE INDEX supplier_qualification_types_name_key
        ON public.supplier_qualification_types(name);`,
      `CREATE UNIQUE INDEX IF NOT EXISTS supplier_qualification_types_name_upper_key
        ON public.supplier_qualification_types
        USING btree (upper(btrim(name)));`,
    ] as const;

    for (const illegalVariant of illegalVariants) {
      expect(findQualificationTypeNameUniqueness(illegalVariant)).not.toEqual(
        [],
      );
    }
  });

  test("locks validity, duplicate identity, and coordinate boundaries", () => {
    const sql = readMasterDataMigration();

    expect(sql).toMatch(
      /CONSTRAINT supplier_qualifications_date_order_check\s+CHECK \(\s*valid_from IS NULL\s+OR valid_until IS NULL\s+OR valid_until >= valid_from\s*\)/,
    );
    expect(sql).toMatch(
      /CONSTRAINT supplier_service_regions_date_order_check\s+CHECK \(\s*valid_from IS NULL\s+OR valid_until IS NULL\s+OR valid_until >= valid_from\s*\)/,
    );
    expect(sql).toMatch(
      /CONSTRAINT supplier_qualifications_supplier_type_document_key\s+UNIQUE \(supplier_id, qualification_type_id, document_file_id\)/,
    );
    expect(sql).toMatch(
      /CONSTRAINT supplier_addresses_longitude_check\s+CHECK \(longitude IS NULL OR longitude BETWEEN -180 AND 180\)/,
    );
    expect(sql).toMatch(
      /CONSTRAINT supplier_addresses_latitude_check\s+CHECK \(latitude IS NULL OR latitude BETWEEN -90 AND 90\)/,
    );
  });

  test("locks supplier status dimensions and private qualification documents", () => {
    const sql = readMasterDataMigration();

    expect(sql).toContain(
      "supplier_type IN ('manufacturer', 'brand_agent', 'distributor', 'retailer', 'other')",
    );
    expect(sql).toContain(
      "onboarding_status IN ('draft', 'pending_review', 'approved', 'rejected')",
    );
    expect(sql).toContain(
      "operational_status IN ('active', 'suspended', 'blacklisted')",
    );
    expect(sql).toContain(
      "verification_status IN ('pending', 'verified', 'rejected')",
    );
    expect(sql).toContain(
      "region_level IN ('province', 'city', 'district')",
    );
    expect(sql).toContain("supplier_qualification_types_status_check");
    expect(sql).toContain("supplier_service_regions_status_check");
    expect(sql).toContain("supplier_addresses_status_check");
    expect(sql).toContain("supplier_contacts_status_check");
    expect(sql).toContain(
      "address_type IN ('registered', 'shipping', 'return', 'other')",
    );
    expect(sql).toContain(
      "contact_type IN ('primary', 'sales', 'finance', 'logistics', 'after_sales')",
    );
    expect(sql).toContain(
      "document_file_id uuid NOT NULL REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT",
    );
  });

  test("forces service-role-only access", () => {
    const sql = readMasterDataMigration();
    const tables = [
      "supplier_qualification_types",
      "suppliers",
      "supplier_qualifications",
      "supplier_service_regions",
      "supplier_addresses",
      "supplier_contacts",
    ] as const;

    for (const table of tables) {
      expect(sql).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      );
      expect(sql).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
      );
      expect(sql).toContain(
        `REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated;`,
      );
      expect(sql).toContain(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO service_role;`,
      );
    }

    expect(sql).not.toMatch(/^\s*CREATE POLICY\b/im);
    expect(sql).toMatch(/^-- Rollback:/);
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
  });

  test("seeds exactly one stable business-license payload", () => {
    const sql = readMasterDataMigration();
    const seedSql =
      sql.match(
        /INSERT INTO public\.supplier_qualification_types \([\s\S]*?sort_order = EXCLUDED\.sort_order;/,
      )?.[0] ?? "";
    const valuesClause =
      seedSql.match(/\bVALUES\s+([\s\S]*?)\s+ON CONFLICT/)?.[1]?.trim() ?? "";

    expect([...sql.matchAll(/^INSERT INTO /gm)]).toHaveLength(1);
    expect(
      [...sql.matchAll(
        /^INSERT INTO public\.supplier_qualification_types\b/gm,
      )],
    ).toHaveLength(1);
    expect(seedSql).not.toBe("");
    expect(valuesClause).toMatch(
      /^\(\s*'business_license',\s*'营业执照',\s*ARRAY\[\s*'manufacturer',\s*'brand_agent',\s*'distributor',\s*'retailer',\s*'other'\s*\]::text\[\],\s*30,\s*true,\s*true,\s*10\s*\)$/,
    );
    expect(seedSql).toContain("ON CONFLICT (code) DO UPDATE SET");
    for (const field of [
      "name",
      "applicable_supplier_types",
      "warning_days",
      "is_required",
      "blocks_new_orders",
      "sort_order",
    ]) {
      expect(seedSql).toContain(`${field} = EXCLUDED.${field}`);
    }
  });
});
