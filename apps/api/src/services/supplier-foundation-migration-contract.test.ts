import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
const migrationPaths = {
  masterData: new URL("../../../../supabase/migrations/20260723140000_create_supplier_master_data.sql", import.meta.url),
  tenantSupplierRelationships: new URL("../../../../supabase/migrations/20260723141000_create_tenant_supplier_relationships.sql", import.meta.url),
  standardCatalog: new URL("../../../../supabase/migrations/20260723142000_create_supplier_standard_catalog.sql", import.meta.url),
  foundationCommands: new URL("../../../../supabase/migrations/20260723143000_create_supplier_foundation_commands.sql", import.meta.url),
  foundationPermissions: new URL("../../../../supabase/migrations/20260723144000_seed_supplier_foundation_permissions.sql", import.meta.url),
} as const;
function readMigration(migrationPath: URL) {
  return existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
}
const migrationSql = {
  masterData: readMigration(migrationPaths.masterData),
  tenantSupplierRelationships: readMigration(migrationPaths.tenantSupplierRelationships),
  standardCatalog: readMigration(migrationPaths.standardCatalog),
  foundationCommands: readMigration(migrationPaths.foundationCommands),
  foundationPermissions: readMigration(migrationPaths.foundationPermissions),
} as const;
function extractCreateTableStatement(sql: string, table: string) {
  const statementStart = sql.search(new RegExp(`CREATE TABLE public\\.${table}\\s*\\(`, "i"));
  if (statementStart < 0) return "";
  const bodyStart = sql.indexOf("(", statementStart);
  let depth = 0;
  let isInsideString = false;
  for (let index = bodyStart; index < sql.length; index += 1) {
    const character = sql[index];
    if (character === "'") {
      if (isInsideString && sql[index + 1] === "'") { index += 1; continue; }
      isInsideString = !isInsideString;
      continue;
    }
    if (isInsideString) continue;
    if (character === "(") depth += 1;
    if (character !== ")" || --depth !== 0) continue;
    const statementEnd = sql.indexOf(";", index);
    return sql.slice(statementStart, statementEnd >= 0 ? statementEnd + 1 : index + 1);
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
      if (isInsideString && body[index + 1] === "'") { index += 1; continue; }
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
function extractColumnNames(sql: string, table: string) {
  return splitTopLevelSqlClauses(extractCreateTableStatement(sql, table))
    .map((clause) => /^([a-z][a-z0-9_]*)\s/i.exec(clause)?.[1] ?? "")
    .filter((name) => name && !["CONSTRAINT", "UNIQUE"].includes(name.toUpperCase()));
}
function expectSqlContracts(sql: string, contracts: readonly RegExp[]) {
  for (const contract of contracts) expect(sql).toMatch(contract);
}
function expectPrivateTables(sql: string, tables: readonly string[], revokeServiceRole = false) {
  for (const table of tables) {
    for (const clause of ["ENABLE ROW LEVEL SECURITY", "FORCE ROW LEVEL SECURITY"]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ${clause};`);
    }
    expect(sql).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated;`);
    if (revokeServiceRole) expect(sql).toContain(`REVOKE ALL ON TABLE public.${table} FROM service_role;`);
    expect(sql).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO service_role;`);
  }
  expect([...sql.matchAll(/^GRANT ([A-Z, ]+) ON TABLE public\.([a-z0-9_]+) TO service_role;$/gm)].map((match) => [match[1], match[2]])).toEqual(
    tables.map((table) => ["SELECT, INSERT, UPDATE, DELETE", table]),
  );
  expect(sql).not.toMatch(/^\s*GRANT\b[^;]*\bTO (?:PUBLIC|anon|authenticated)\s*;/im);
  expect(sql).not.toMatch(/^\s*CREATE POLICY\b/im);
}
function expectTransactionalMigration(sql: string) {
  expectSqlContracts(sql, [/^-- Rollback:/, /\bBEGIN;[\s\S]*\bCOMMIT;\s*$/]);
}
function findQualificationTypeNameUniqueness(sql: string) {
  const tableStatement = extractCreateTableStatement(sql, "supplier_qualification_types");
  const tableViolations = splitTopLevelSqlClauses(tableStatement)
    .filter((clause) => /\bUNIQUE\b/i.test(clause) && /\bname\b/i.test(clause));
  const indexViolations = [...sql.matchAll(/CREATE\s+UNIQUE\s+INDEX\b[\s\S]*?;/gi)]
    .map((match) => match[0])
    .filter((statement) => {
      const tableReference = /\bON\s+(?:ONLY\s+)?public\.supplier_qualification_types\b/i.exec(statement);
      if (!tableReference || tableReference.index === undefined) return false;
      const indexDefinition = statement.slice(tableReference.index + tableReference[0].length);
      return /\bname\b/i.test(indexDefinition);
    });
  return [...tableViolations, ...indexViolations];
}
const atomicStateCommands = ["create_platform_supplier", "mutate_platform_supplier", "review_supplier_qualification", "set_tenant_supplier_module", "create_tenant_supplier", "mutate_tenant_supplier", "create_supplier_contract", "mutate_supplier_contract"] as const;
const createCommands = ["create_supplier_qualification_type", "create_supplier_qualification", "create_supplier_service_region", "create_supplier_address", "create_supplier_contact", "create_catalog_category", "create_catalog_brand", "create_catalog_unit"] as const;
const commandFunctions = ["create_platform_supplier", ...createCommands, ...atomicStateCommands.slice(1), "get_tenant_supplier_order_eligibility", "list_tenant_suppliers_for_tenant", "list_available_suppliers_for_tenant"] as const;
const allFoundationFunctions = [...commandFunctions.slice(0, 16), "get_tenant_supplier_order_eligibility_set", ...commandFunctions.slice(16)] as const;
const requestFields = { create_platform_supplier: ["code", "name", "legal_name", "unified_social_credit_code", "supplier_type", "expected_version", "actor_employee_id"], mutate_platform_supplier: ["supplier_id", "action", "expected_version", "reason", "actor_employee_id"], review_supplier_qualification: ["supplier_id", "qualification_id", "verification_status", "expected_version", "reason", "actor_employee_id"], set_tenant_supplier_module: ["tenant_id", "module_enabled", "require_active_contract_for_new_order", "expected_version", "actor_employee_id"], create_tenant_supplier: ["tenant_id", "supplier_id", "expected_version", "actor_employee_id"], mutate_tenant_supplier: ["tenant_id", "tenant_supplier_id", "action", "expected_version", "reason", "actor_employee_id"], create_supplier_contract: ["tenant_id", "tenant_supplier_id", "contract_no", "name", "valid_from", "valid_until", "settlement_term_days", "invoice_required_before_payment", "document_file_id", "expected_version", "actor_employee_id"], mutate_supplier_contract: ["tenant_id", "tenant_supplier_id", "contract_id", "action", "expected_version", "reason", "actor_employee_id"] } as const;
function extractFunction(sql: string, name: string) { return sql.match(new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`))?.[0] ?? ""; }
describe("supplier foundation migration contract", () => {
  test("creates the six supplier master-data tables and required indexes", () => {
    const sql = migrationSql.masterData;
    const tables = ["supplier_qualification_types", "suppliers", "supplier_qualifications", "supplier_service_regions", "supplier_addresses", "supplier_contacts"] as const;
    expect([...sql.matchAll(/^CREATE TABLE public\.([a-z0-9_]+) \(/gm)].map((match) => match[1])).toEqual([...tables]);
    for (const table of tables) expect(sql).toContain(`CREATE TABLE public.${table}`);
    for (const index of ["suppliers_credit_code_unique_idx", "suppliers_platform_queue_idx", "supplier_qualifications_health_lookup_idx", "supplier_service_regions_lookup_idx", "supplier_addresses_supplier_type_status_default_idx", "supplier_contacts_supplier_type_idx"]) {
      expect(sql).toContain(index);
    }
  });
  test("locks normalized supplier and active-history lookup indexes", () => {
    const sql = migrationSql.masterData;
    expectSqlContracts(sql, [
      /CREATE UNIQUE INDEX suppliers_credit_code_unique_idx\s+ON public\.suppliers\(upper\(btrim\(unified_social_credit_code\)\)\)\s+WHERE unified_social_credit_code IS NOT NULL\s+AND btrim\(unified_social_credit_code\) <> '';/,
      /CREATE INDEX suppliers_platform_queue_idx\s+ON public\.suppliers\(\s*onboarding_status,\s*operational_status,\s*updated_at DESC,\s*id DESC\s*\);/,
      /CREATE INDEX supplier_addresses_supplier_type_status_default_idx\s+ON public\.supplier_addresses\(\s*supplier_id,\s*address_type,\s*status,\s*is_default DESC\s*\);/,
      /CREATE UNIQUE INDEX supplier_addresses_active_default_type_unique_idx\s+ON public\.supplier_addresses\(supplier_id, address_type\)\s+WHERE is_default AND status = 'active';/,
      /CREATE INDEX supplier_contacts_supplier_type_idx\s+ON public\.supplier_contacts\(\s*supplier_id,\s*contact_type,\s*is_primary DESC\s*\);/,
      /CREATE UNIQUE INDEX supplier_contacts_active_primary_type_unique_idx\s+ON public\.supplier_contacts\(supplier_id, contact_type\)\s+WHERE is_primary AND status = 'active';/,
    ]);
  });
  test("locks qualification-type membership, bounds, and positive versions", () => {
    const sql = migrationSql.masterData;
    const qualificationTypeTable = extractCreateTableStatement(sql, "supplier_qualification_types");
    const supplierTypes = ["manufacturer", "brand_agent", "distributor", "retailer", "other"] as const;
    expect(qualificationTypeTable).toMatch(/^\s*code text NOT NULL UNIQUE,\s*$/m);
    expect(qualificationTypeTable).toContain("name text NOT NULL");
    expect(qualificationTypeTable).toMatch(/CONSTRAINT supplier_qualification_types_name_not_blank_check\s+CHECK \(btrim\(name\) <> ''\)/);
    expect(findQualificationTypeNameUniqueness(sql)).toEqual([]);
    expect(qualificationTypeTable).toContain("applicable_supplier_types text[] NOT NULL DEFAULT '{}'::text[]");
    expect(qualificationTypeTable).toMatch(/applicable_supplier_types <@ ARRAY\[\s*'manufacturer',\s*'brand_agent',\s*'distributor',\s*'retailer',\s*'other'\s*\]::text\[\]/);
    expect(qualificationTypeTable).toContain("array_position(applicable_supplier_types, NULL) IS NULL");
    for (const supplierType of supplierTypes) {
      expect(qualificationTypeTable).toContain(`cardinality(array_positions(applicable_supplier_types, '${supplierType}')) <= 1`);
    }
    expect(qualificationTypeTable).toContain("warning_days integer NOT NULL DEFAULT 30");
    expect(qualificationTypeTable).toMatch(/CONSTRAINT supplier_qualification_types_warning_days_check\s+CHECK \(warning_days BETWEEN 0 AND 3650\)/);
    for (const table of ["supplier_qualification_types", "suppliers", "supplier_qualifications", "supplier_service_regions", "supplier_addresses", "supplier_contacts"]) {
      expect(sql).toMatch(new RegExp(`CONSTRAINT ${table}_version_check\\s+CHECK \\(version > 0\\)`));
    }
  });
  test("rejects every qualification-type name uniqueness form", () => {
    const illegalVariants = [
      "CREATE TABLE public.supplier_qualification_types (code text NOT NULL UNIQUE, name text NOT NULL UNIQUE);",
      "CREATE TABLE public.supplier_qualification_types (code text NOT NULL UNIQUE, name text NOT NULL, CONSTRAINT supplier_qualification_types_code_name_key UNIQUE (code, name));",
      "CREATE TABLE public.supplier_qualification_types (code text NOT NULL UNIQUE, name text NOT NULL, UNIQUE (upper(btrim(name))));",
      "CREATE UNIQUE INDEX supplier_qualification_types_name_key ON public.supplier_qualification_types(name);",
      "CREATE UNIQUE INDEX IF NOT EXISTS supplier_qualification_types_name_upper_key ON public.supplier_qualification_types USING btree (upper(btrim(name)));",
    ] as const;
    for (const illegalVariant of illegalVariants) expect(findQualificationTypeNameUniqueness(illegalVariant)).not.toEqual([]);
  });
  test("locks validity, duplicate identity, and coordinate boundaries", () => {
    const sql = migrationSql.masterData;
    expectSqlContracts(sql, [
      /CONSTRAINT supplier_qualifications_date_order_check\s+CHECK \(\s*valid_from IS NULL\s+OR valid_until IS NULL\s+OR valid_until >= valid_from\s*\)/,
      /CONSTRAINT supplier_service_regions_date_order_check\s+CHECK \(\s*valid_from IS NULL\s+OR valid_until IS NULL\s+OR valid_until >= valid_from\s*\)/,
      /CONSTRAINT supplier_qualifications_supplier_type_document_key\s+UNIQUE \(supplier_id, qualification_type_id, document_file_id\)/,
      /CONSTRAINT supplier_addresses_longitude_check\s+CHECK \(longitude IS NULL OR longitude BETWEEN -180 AND 180\)/,
      /CONSTRAINT supplier_addresses_latitude_check\s+CHECK \(latitude IS NULL OR latitude BETWEEN -90 AND 90\)/,
    ]);
  });
  test("locks supplier status dimensions and private qualification documents", () => {
    const sql = migrationSql.masterData;
    for (const contract of [
      "supplier_type IN ('manufacturer', 'brand_agent', 'distributor', 'retailer', 'other')",
      "onboarding_status IN ('draft', 'pending_review', 'approved', 'rejected')", "operational_status IN ('active', 'suspended', 'blacklisted')",
      "verification_status IN ('pending', 'verified', 'rejected')", "region_level IN ('province', 'city', 'district')",
      "supplier_qualification_types_status_check", "supplier_service_regions_status_check",
      "supplier_addresses_status_check", "supplier_contacts_status_check",
      "address_type IN ('registered', 'shipping', 'return', 'other')", "contact_type IN ('primary', 'sales', 'finance', 'logistics', 'after_sales')",
      "document_file_id uuid NOT NULL REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT",
    ]) expect(sql).toContain(contract);
  });
  test("forces service-role-only access", () => {
    const sql = migrationSql.masterData;
    const tables = ["supplier_qualification_types", "suppliers", "supplier_qualifications", "supplier_service_regions", "supplier_addresses", "supplier_contacts"] as const;
    expectPrivateTables(sql, tables);
    expectTransactionalMigration(sql);
  });
  test("seeds exactly one stable business-license payload", () => {
    const sql = migrationSql.masterData;
    const seedSql = sql.match(/INSERT INTO public\.supplier_qualification_types \([\s\S]*?sort_order = EXCLUDED\.sort_order;/)?.[0] ?? "";
    const valuesClause = seedSql.match(/\bVALUES\s+([\s\S]*?)\s+ON CONFLICT/)?.[1]?.trim() ?? "";
    expect([...sql.matchAll(/^INSERT INTO /gm)]).toHaveLength(1);
    expect([...sql.matchAll(/^INSERT INTO public\.supplier_qualification_types\b/gm)]).toHaveLength(1);
    expect(seedSql).not.toBe("");
    expect(valuesClause).toMatch(
      /^\(\s*'business_license',\s*'营业执照',\s*ARRAY\[\s*'manufacturer',\s*'brand_agent',\s*'distributor',\s*'retailer',\s*'other'\s*\]::text\[\],\s*30,\s*true,\s*true,\s*10\s*\)$/,
    );
    expect(seedSql).toContain("ON CONFLICT (code) DO UPDATE SET");
    for (const field of ["name", "applicable_supplier_types", "warning_days", "is_required", "blocks_new_orders", "sort_order"]) expect(seedSql).toContain(`${field} = EXCLUDED.${field}`);
  });
  test("locks tenant-supplier relationship table definitions", () => {
    const relationshipSql = migrationSql.tenantSupplierRelationships;
    const createdTables = [...relationshipSql.matchAll(/^CREATE TABLE public\.([a-z0-9_]+) \(/gm)].map((match) => match[1]);
    expect(createdTables).toEqual(["tenant_supplier_settings", "tenant_suppliers", "supplier_contracts"]);
    const tableContracts = {
      tenant_supplier_settings: [
        /tenant_id uuid PRIMARY KEY\s+REFERENCES public\.tenants\(id\) ON DELETE CASCADE/,
        /module_enabled boolean NOT NULL DEFAULT false/,
        /require_active_contract_for_new_order boolean NOT NULL DEFAULT false/,
        /enabled_by_employee_id uuid NULL\s+REFERENCES public\.employees\(id\) ON DELETE SET NULL/,
        /enabled_at timestamptz NULL/,
        /CONSTRAINT tenant_supplier_settings_enabled_metadata_check\s+CHECK \(\s*NOT module_enabled\s+OR \(\s*enabled_by_employee_id IS NOT NULL\s+AND enabled_at IS NOT NULL\s*\)\s*\)/,
      ],
      tenant_suppliers: [
        /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/,
        /tenant_id uuid NOT NULL\s+REFERENCES public\.tenants\(id\) ON DELETE RESTRICT/,
        /supplier_id uuid NOT NULL\s+REFERENCES public\.suppliers\(id\) ON DELETE RESTRICT/,
        /relationship_status text NOT NULL DEFAULT 'evaluating'[\s\S]*relationship_status IN \('evaluating', 'active', 'suspended', 'terminated', 'blacklisted'\)/,
        /settlement_term_days integer NOT NULL DEFAULT 0[\s\S]*CHECK \(settlement_term_days BETWEEN 0 AND 3650\)/,
        /credit_limit_minor bigint NOT NULL DEFAULT 0[\s\S]*CHECK \(credit_limit_minor >= 0\)/,
        /invoice_required_before_payment boolean NOT NULL DEFAULT false[\s\S]*default_currency char\(3\) NOT NULL DEFAULT 'CNY'[\s\S]*default_tax_inclusive boolean NOT NULL DEFAULT true[\s\S]*CHECK \(default_currency::text ~ '\^\[A-Z\]\{3\}\$'\)/,
        /tenant_owner_employee_id uuid NULL\s+REFERENCES public\.employees\(id\) ON DELETE SET NULL[\s\S]*started_at date NULL[\s\S]*ended_at date NULL[\s\S]*CHECK \(\s*started_at IS NULL\s+OR ended_at IS NULL\s+OR ended_at >= started_at\s*\)/,
        /remark text NULL[\s\S]*CONSTRAINT tenant_suppliers_remark_not_blank_check\s+CHECK \(remark IS NULL OR btrim\(remark\) <> ''\)/,
        /created_by_employee_id uuid NOT NULL\s+REFERENCES public\.employees\(id\) ON DELETE RESTRICT[\s\S]*updated_by_employee_id uuid NOT NULL\s+REFERENCES public\.employees\(id\) ON DELETE RESTRICT/,
        /CONSTRAINT tenant_suppliers_tenant_supplier_key\s+UNIQUE \(tenant_id, supplier_id\)/,
        /CONSTRAINT tenant_suppliers_id_tenant_key\s+UNIQUE \(id, tenant_id\)/,
      ],
      supplier_contracts: [
        /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/,
        /tenant_id uuid NOT NULL\s+REFERENCES public\.tenants\(id\) ON DELETE RESTRICT/,
        /tenant_supplier_id uuid NOT NULL\s+REFERENCES public\.tenant_suppliers\(id\) ON DELETE RESTRICT/,
        /contract_no text NOT NULL[\s\S]*name text NOT NULL[\s\S]*CONSTRAINT supplier_contracts_contract_no_not_blank_check\s+CHECK \(btrim\(contract_no\) <> ''\)[\s\S]*CONSTRAINT supplier_contracts_name_not_blank_check\s+CHECK \(btrim\(name\) <> ''\)/,
        /lifecycle_status text NOT NULL DEFAULT 'draft'[\s\S]*lifecycle_status IN \('draft', 'active', 'terminated'\)/,
        /valid_from date NOT NULL[\s\S]*valid_until date NOT NULL[\s\S]*CONSTRAINT supplier_contracts_date_order_check\s+CHECK \(valid_until >= valid_from\)/,
        /settlement_term_days integer NOT NULL DEFAULT 0[\s\S]*invoice_required_before_payment boolean NOT NULL DEFAULT false[\s\S]*CHECK \(settlement_term_days BETWEEN 0 AND 3650\)/,
        /document_file_id uuid NOT NULL REFERENCES public\.platform_file_objects\(id\) ON DELETE RESTRICT/,
        /created_by_employee_id uuid NOT NULL\s+REFERENCES public\.employees\(id\) ON DELETE RESTRICT[\s\S]*updated_by_employee_id uuid NOT NULL\s+REFERENCES public\.employees\(id\) ON DELETE RESTRICT/,
        /CONSTRAINT supplier_contracts_tenant_contract_no_key\s+UNIQUE \(tenant_id, contract_no\)/,
        /CONSTRAINT supplier_contracts_tenant_supplier_tenant_fkey\s+FOREIGN KEY \(tenant_supplier_id, tenant_id\)\s+REFERENCES public\.tenant_suppliers\(id, tenant_id\)\s+ON DELETE RESTRICT/,
      ],
    } as const;
    for (const [table, contracts] of Object.entries(tableContracts)) {
      const tableSql = extractCreateTableStatement(relationshipSql, table);
      for (const contract of contracts) expect(tableSql).toMatch(contract);
      expect(tableSql).toMatch(new RegExp("version integer NOT NULL DEFAULT 1[\\s\\S]*created_at timestamptz NOT NULL DEFAULT now\\(\\)[\\s\\S]*updated_at timestamptz NOT NULL DEFAULT now\\(\\)[\\s\\S]*CONSTRAINT " + table + "_version_check\\s+CHECK \\(version > 0\\)"));
    }
    expect(extractCreateTableStatement(relationshipSql, "tenant_suppliers")).not.toMatch(/(?:started_at|ended_at) timestamptz/);
    expect(extractCreateTableStatement(relationshipSql, "supplier_contracts")).not.toMatch(/valid_(?:from|until) date NULL/);
  });
  test("locks relationship indexes, tenant guard, timestamps, and private access", () => {
    const relationshipSql = migrationSql.tenantSupplierRelationships;
    for (const contract of [
      /CREATE INDEX tenant_suppliers_tenant_status_updated_idx\s+ON public\.tenant_suppliers\(\s*tenant_id,\s*relationship_status,\s*updated_at DESC,\s*id DESC\s*\);/,
      /CREATE INDEX tenant_suppliers_supplier_status_idx\s+ON public\.tenant_suppliers\(\s*supplier_id,\s*relationship_status,\s*tenant_id\s*\);/,
      /CREATE INDEX supplier_contracts_active_lookup_idx\s+ON public\.supplier_contracts\(\s*tenant_id,\s*tenant_supplier_id,\s*lifecycle_status,\s*valid_until DESC\s*\);/,
      /CREATE FUNCTION public\.set_supplier_contract_tenant_id\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SET search_path = pg_catalog, public\s+AS \$\$/,
      /SELECT relationship\.tenant_id\s+INTO parent_tenant_id\s+FROM public\.tenant_suppliers AS relationship\s+WHERE relationship\.id = NEW\.tenant_supplier_id;/,
      /IF NOT FOUND THEN\s+RAISE EXCEPTION '租户供应商合作关系不存在';/,
      /IF NEW\.tenant_id IS NULL THEN\s+NEW\.tenant_id := parent_tenant_id;\s+ELSIF NEW\.tenant_id <> parent_tenant_id THEN\s+RAISE EXCEPTION '供应商合同租户与合作关系租户不一致';/,
      /CREATE TRIGGER tr_supplier_contracts_set_tenant_id\s+BEFORE INSERT OR UPDATE ON public\.supplier_contracts\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.set_supplier_contract_tenant_id\(\);/,
      /REVOKE ALL ON FUNCTION public\.set_supplier_contract_tenant_id\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    ]) expect(relationshipSql).toMatch(contract);

    const tables = ["tenant_supplier_settings", "tenant_suppliers", "supplier_contracts"] as const;
    for (const table of tables) {
      expect(relationshipSql).toMatch(new RegExp("CREATE TRIGGER tr_" + table + "_updated_at\\s+BEFORE UPDATE ON public\\." + table + "\\s+FOR EACH ROW\\s+EXECUTE FUNCTION public\\.update_updated_at_column\\(\\);"));
    }
    expectPrivateTables(relationshipSql, tables, true);
    expectTransactionalMigration(relationshipSql);
  });
  test("locks standard catalog tables, columns, references, and checks", () => {
    const sql = migrationSql.standardCatalog;
    const columns = {
      catalog_categories: ["id", "parent_id", "code", "name", "level", "status", "sort_order", "version", "created_by_employee_id", "updated_by_employee_id", "created_at", "updated_at"],
      catalog_brands: ["id", "code", "name", "legal_name", "logo_file_id", "status", "sort_order", "version", "created_by_employee_id", "updated_by_employee_id", "created_at", "updated_at"],
      catalog_units: ["id", "code", "name", "symbol", "base_unit_id", "conversion_factor", "status", "sort_order", "version", "created_by_employee_id", "updated_by_employee_id", "created_at", "updated_at"],
    } as const;
    expect(
      [...sql.matchAll(/^CREATE TABLE public\.([a-z0-9_]+) \(/gm)].map(
        (match) => match[1],
      ),
    ).toEqual(Object.keys(columns));
    for (const [table, expectedColumns] of Object.entries(columns)) {
      const tableSql = extractCreateTableStatement(sql, table);
      expect(extractColumnNames(sql, table)).toEqual([...expectedColumns]);
      expectSqlContracts(tableSql, [
        /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/,
        /status text NOT NULL DEFAULT 'active'/,
        /sort_order integer NOT NULL DEFAULT 100/,
        /version integer NOT NULL DEFAULT 1/,
        /created_by_employee_id uuid NOT NULL\s+REFERENCES public\.employees\(id\) ON DELETE RESTRICT/,
        /updated_by_employee_id uuid NOT NULL\s+REFERENCES public\.employees\(id\) ON DELETE RESTRICT/,
        /created_at timestamptz NOT NULL DEFAULT now\(\)/,
        /updated_at timestamptz NOT NULL DEFAULT now\(\)/,
        new RegExp(`CONSTRAINT ${table}_status_check\\s+CHECK \\(status IN \\('active', 'inactive'\\)\\)`),
        new RegExp(`CONSTRAINT ${table}_version_check\\s+CHECK \\(version > 0\\)`),
      ]);
      for (const field of ["code", "name"]) {
        expect(tableSql).toMatch(
          new RegExp(`CONSTRAINT ${table}_${field}_trimmed_check\\s+CHECK \\(${field} = btrim\\(${field}\\) AND ${field} <> ''\\)`),
        );
      }
    }
    expectSqlContracts(extractCreateTableStatement(sql, "catalog_categories"), [
      /parent_id uuid NULL\s+REFERENCES public\.catalog_categories\(id\) ON DELETE RESTRICT/,
      /code text NOT NULL UNIQUE/,
      /name text NOT NULL/,
      /^\s*level integer NOT NULL,\s*$/m,
      /CONSTRAINT catalog_categories_level_check\s+CHECK \(level BETWEEN 1 AND 6\)/,
    ]);
    expect(extractCreateTableStatement(sql, "catalog_categories")).not.toMatch(/\blevel (?:smallint|integer NOT NULL DEFAULT)\b/);
    expectSqlContracts(extractCreateTableStatement(sql, "catalog_brands"), [
      /code text NOT NULL UNIQUE/,
      /name text NOT NULL/,
      /legal_name text NULL/,
      /logo_file_id uuid NULL\s+REFERENCES public\.platform_file_objects\(id\) ON DELETE SET NULL/,
      /CONSTRAINT catalog_brands_legal_name_trimmed_check\s+CHECK \(\s*legal_name IS NULL\s+OR \(legal_name = btrim\(legal_name\) AND legal_name <> ''\)\s*\)/,
    ]);
    expectSqlContracts(extractCreateTableStatement(sql, "catalog_units"), [
      /code text NOT NULL UNIQUE/,
      /name text NOT NULL/,
      /symbol text NOT NULL/,
      /base_unit_id uuid NULL\s+REFERENCES public\.catalog_units\(id\) ON DELETE RESTRICT/,
      /conversion_factor numeric\(18, 6\) NOT NULL DEFAULT 1/,
      /CONSTRAINT catalog_units_symbol_trimmed_check\s+CHECK \(symbol = btrim\(symbol\) AND symbol <> ''\)/,
      /CONSTRAINT catalog_units_conversion_factor_positive_check\s+CHECK \(conversion_factor > 0\)/,
      /CONSTRAINT catalog_units_base_conversion_check\s+CHECK \(\s*\(base_unit_id IS NULL AND conversion_factor = 1\)\s+OR base_unit_id IS NOT NULL\s*\)/,
    ]);
  });
  test("locks category hierarchy and unit-base trigger invariants", () => {
    const sql = migrationSql.standardCatalog;
    const rowFunction = sql.match(/CREATE FUNCTION public\.set_catalog_category_level\(\)[\s\S]*?\$\$;/)?.[0] ?? "";
    expect(rowFunction).not.toContain("pg_advisory_xact_lock");
    expectSqlContracts(sql, [
      /CREATE FUNCTION public\.lock_catalog_category_hierarchy\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SET search_path = pg_catalog, public\s+AS \$\$[\s\S]*PERFORM pg_catalog\.pg_advisory_xact_lock\(6720240723142000::bigint\);[\s\S]*RETURN NULL;[\s\S]*\$\$;/,
      /REVOKE ALL ON FUNCTION public\.lock_catalog_category_hierarchy\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
      /CREATE TRIGGER tr_catalog_categories_lock_hierarchy\s+BEFORE INSERT OR UPDATE ON public\.catalog_categories\s+FOR EACH STATEMENT\s+EXECUTE FUNCTION public\.lock_catalog_category_hierarchy\(\);/,
      /CREATE FUNCTION public\.set_catalog_category_level\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SET search_path = pg_catalog, public\s+AS \$\$/,
      /IF TG_OP = 'UPDATE'\s+AND NEW\.parent_id IS DISTINCT FROM OLD\.parent_id THEN[\s\S]*IF EXISTS \([\s\S]*FROM descendants[\s\S]*\) THEN\s+RAISE EXCEPTION '只能移动叶子目录分类';/,
      /IF NEW\.parent_id IS NULL THEN\s+NEW\.level := 1;/,
      /IF NEW\.parent_id = NEW\.id THEN\s+RAISE EXCEPTION '目录分类不能将自身设为父分类';/,
      /WITH RECURSIVE ancestors AS \([\s\S]*FROM public\.catalog_categories AS parent[\s\S]*JOIN ancestors[\s\S]*NOT parent\.id = ANY\(ancestors\.path\)/,
      /IF EXISTS \([\s\S]*SELECT 1\s+FROM ancestors\s+WHERE ancestors\.id = NEW\.id[\s\S]*\) THEN\s+RAISE EXCEPTION '目录分类层级不能形成环';/,
      /SELECT parent\.level\s+INTO parent_level\s+FROM public\.catalog_categories AS parent\s+WHERE parent\.id = NEW\.parent_id/,
      /IF NOT FOUND THEN\s+RAISE EXCEPTION '父目录分类不存在';/,
      /NEW\.level := parent_level \+ 1;/,
      /IF NEW\.level > 6 THEN\s+RAISE EXCEPTION '目录分类层级不能超过 6 级';/,
      /CREATE TRIGGER tr_catalog_categories_set_level\s+BEFORE INSERT OR UPDATE ON public\.catalog_categories\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.set_catalog_category_level\(\);/,
      /CREATE FUNCTION public\.validate_catalog_unit_base\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SET search_path = pg_catalog, public\s+AS \$\$/,
      /IF NEW\.base_unit_id = NEW\.id THEN\s+RAISE EXCEPTION '目录单位不能将自身设为基准单位';/,
      /SELECT base_unit\.base_unit_id\s+INTO parent_base_unit_id\s+FROM public\.catalog_units AS base_unit\s+WHERE base_unit\.id = NEW\.base_unit_id\s+FOR UPDATE;/,
      /IF NOT FOUND THEN\s+RAISE EXCEPTION '基准单位不存在';/,
      /IF parent_base_unit_id IS NOT NULL THEN\s+RAISE EXCEPTION '派生单位只能引用基准单位';/,
      /IF TG_OP = 'UPDATE'[\s\S]*EXISTS \([\s\S]*FROM public\.catalog_units AS derived_unit\s+WHERE derived_unit\.base_unit_id = OLD\.id[\s\S]*\) THEN\s+RAISE EXCEPTION '已有派生单位引用的基准单位不能改为派生单位';/,
      /CREATE TRIGGER tr_catalog_units_validate_base\s+BEFORE INSERT OR UPDATE ON public\.catalog_units/,
      /REVOKE ALL ON FUNCTION public\.set_catalog_category_level\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
      /REVOKE ALL ON FUNCTION public\.validate_catalog_unit_base\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    ]);
    expect(sql.indexOf("CREATE TRIGGER tr_catalog_categories_lock_hierarchy")).toBeLessThan(sql.indexOf("CREATE TRIGGER tr_catalog_categories_set_level"));
  });
  test("locks standard catalog indexes, timestamps, private access, and no seeds", () => {
    const sql = migrationSql.standardCatalog;
    expectSqlContracts(sql, [
      /CREATE INDEX catalog_categories_parent_status_sort_idx\s+ON public\.catalog_categories\(parent_id, status, sort_order, id\);/,
      /CREATE INDEX catalog_brands_status_name_idx\s+ON public\.catalog_brands\(status, name, id\);/,
      /CREATE INDEX catalog_units_status_sort_idx\s+ON public\.catalog_units\(status, sort_order, id\);/,
      /CREATE INDEX catalog_units_base_unit_lookup_idx\s+ON public\.catalog_units\(base_unit_id\)\s+WHERE base_unit_id IS NOT NULL;/,
    ]);
    const tables = ["catalog_categories", "catalog_brands", "catalog_units"] as const;
    for (const table of tables) {
      expect(sql).toMatch(new RegExp(`CREATE TRIGGER tr_${table}_updated_at\\s+BEFORE UPDATE ON public\\.${table}\\s+FOR EACH ROW\\s+EXECUTE FUNCTION public\\.update_updated_at_column\\(\\);`));
    }
    expectPrivateTables(sql, tables, true);
    expect(sql).not.toMatch(/^\s*INSERT\b/im);
    expectTransactionalMigration(sql);
  });
  test("locks the append-only command ledger and exact RPC boundary", () => {
    const sql = migrationSql.foundationCommands;
    expect(extractColumnNames(sql, "supplier_command_events")).toEqual(["id", "tenant_id", "resource_type", "resource_id", "command", "from_state", "to_state", "reason", "actor_user_id", "actor_employee_id", "idempotency_key", "result_version", "created_at"]);
    expectSqlContracts(extractCreateTableStatement(sql, "supplier_command_events"), [
      /resource_type IN \([\s\S]*'supplier'[\s\S]*'supplier_qualification'[\s\S]*'tenant_supplier'[\s\S]*'supplier_contract'[\s\S]*\)/,
      /idempotency_key text NOT NULL CHECK \(\s*btrim\(idempotency_key\) <> '' AND char_length\(idempotency_key\) <= 120\s*\)/,
      /UNIQUE \(actor_user_id, idempotency_key\)/,
    ]);
    for (const clause of ["ENABLE ROW LEVEL SECURITY", "FORCE ROW LEVEL SECURITY"]) expect(sql).toContain(`ALTER TABLE public.supplier_command_events ${clause};`);
    expect(sql).toContain("REVOKE ALL ON TABLE public.supplier_command_events FROM PUBLIC, anon, authenticated, service_role;");
    expect(sql).toContain("GRANT SELECT, INSERT ON TABLE public.supplier_command_events TO service_role;");
    expect(sql).toContain("REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.supplier_command_events FROM PUBLIC, anon, authenticated, service_role;");
    expect([...sql.matchAll(/^CREATE FUNCTION public\.([a-z0-9_]+)\(/gm)].map((match) => match[1])).toEqual([...allFoundationFunctions]);
    for (const name of commandFunctions) {
      const functionSql = extractFunction(sql, name);
      expectSqlContracts(functionSql, [/SECURITY DEFINER/, /SET search_path = pg_catalog, public/]);
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?TO service_role;`));
    }
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*?\bTO (?:PUBLIC|anon|authenticated);/);
    expectTransactionalMigration(sql);
  });
  test("exposes an exact-count supplier directory with database-side qualification health", () => {
    const sql = migrationSql.foundationCommands;
    const view = sql.match(/CREATE VIEW public\.platform_supplier_directory[\s\S]*?;\s*$/m)?.[0] ?? "";
    expectSqlContracts(view, [
      /WITH \(security_invoker = true\)\s+AS/,
      /WITH required_types AS \(/,
      /supplier\.id[\s\S]*supplier\.updated_at[\s\S]*qualification_health/,
      /qualification_type\.status = 'active'\s+AND qualification_type\.is_required/,
      /cardinality\(qualification_type\.applicable_supplier_types\) = 0[\s\S]*supplier\.supplier_type = ANY \(qualification_type\.applicable_supplier_types\)/,
      /required_type_documents AS \([\s\S]*GROUP BY required_type\.supplier_id,\s*required_type\.qualification_type_id,\s*required_type\.warning_days/,
      /verification_status = 'verified'[\s\S]*valid_from <= CURRENT_DATE[\s\S]*valid_until >= CURRENT_DATE[\s\S]*AS has_current_verified/,
      /verification_status = 'verified'[\s\S]*valid_until IS NULL[\s\S]*valid_until > CURRENT_DATE \+ required_type\.warning_days[\s\S]*AS has_long_valid_verified/,
      /bool_and\([\s\S]*valid_until IS NOT NULL[\s\S]*valid_until < CURRENT_DATE[\s\S]*FILTER \(WHERE qualification\.verification_status = 'verified'\)[\s\S]*AS all_verified_expired/,
      /has_long_valid_verified, false\)\s+THEN 'valid'[\s\S]*has_current_verified, false\)\s+THEN 'expiring'[\s\S]*has_verified, false\)[\s\S]*all_verified_expired, false\)\s+THEN 'expired'[\s\S]*ELSE 'missing'/,
      /COUNT\(required_type_health\.qualification_type_id\) = 0 THEN 'valid'[\s\S]*qualification_health = 'missing'\) THEN 'missing'[\s\S]*qualification_health = 'expired'\) THEN 'expired'[\s\S]*qualification_health = 'expiring'\) THEN 'expiring'[\s\S]*ELSE 'valid'/,
    ]);
    expect(view).not.toMatch(/LEFT JOIN LATERAL|'unchecked'|has_pending|has_expiring_verified|has_not_expired_verified|verification_status = 'pending'/);
    expect(sql).toContain("REVOKE ALL ON TABLE public.platform_supplier_directory FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT SELECT ON TABLE public.platform_supplier_directory TO service_role;");
    expect(sql).toMatch(/^-- Rollback:[\s\S]*DROP VIEW IF EXISTS public\.platform_supplier_directory/);
  });
  test("gates submit atomically before supplier update and event insertion", () => {
    const mutation = extractFunction(migrationSql.foundationCommands, "mutate_platform_supplier");
    expectSqlContracts(mutation, [
      /IF p_action = 'submit' AND v_supplier\.onboarding_status IN \('draft', 'rejected'\) THEN\s+IF EXISTS \([\s\S]*qualification_type\.status = 'active'[\s\S]*qualification_type\.is_required[\s\S]*supplier_type = ANY \(qualification_type\.applicable_supplier_types\)[\s\S]*NOT EXISTS \([\s\S]*verification_status = 'verified'[\s\S]*valid_from <= CURRENT_DATE[\s\S]*valid_until >= CURRENT_DATE[\s\S]*RETURN jsonb_build_object\('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT', 'reason', 'required_qualification_missing'\);[\s\S]*v_next_onboarding := 'pending_review';/,
    ]);
    expect(mutation.indexOf("FOR UPDATE")).toBeLessThan(mutation.indexOf("IF p_action = 'submit'"));
    expect(mutation.indexOf("IF p_action = 'submit'")).toBeLessThan(mutation.indexOf("UPDATE public.suppliers"));
    expect(mutation.indexOf("IF p_action = 'submit'")).toBeLessThan(mutation.indexOf("INSERT INTO public.supplier_command_events"));
  });
  test("locks idempotent lifecycle state machines and aggregate writes", () => {
    const sql = migrationSql.foundationCommands;
    for (const name of atomicStateCommands) {
      const functionSql = extractFunction(sql, name);
      for (const contract of ["p_expected_version", "p_actor_user_id", "p_actor_employee_id", "p_idempotency_key", "pg_advisory_xact_lock", "public.supplier_command_events", "SUPPLIER_IDEMPOTENCY_CONFLICT", "FOR UPDATE", "INSERT INTO public.supplier_command_events"]) expect(functionSql).toContain(contract);
      expect(functionSql.indexOf("pg_advisory_xact_lock")).toBeLessThan(functionSql.indexOf("FROM public.supplier_command_events"));
    }
    for (const [name, fields] of Object.entries(requestFields)) { const functionSql = extractFunction(sql, name); for (const field of fields) expect(functionSql).toContain(`'${field}', p_${field}`); expectSqlContracts(functionSql, [/v_event\.from_state -> '_request' IS DISTINCT FROM v_request[\s\S]*SUPPLIER_IDEMPOTENCY_CONFLICT[\s\S]*RETURN jsonb_build_object/, /jsonb_build_object\('_request', v_request\)/]); }
    for (const name of ["create_tenant_supplier", "mutate_tenant_supplier", "mutate_supplier_contract"]) expectSqlContracts(extractFunction(sql, name), [/IF v_event\.tenant_id IS DISTINCT FROM p_tenant_id[\s\S]*SUPPLIER_IDEMPOTENCY_CONFLICT[\s\S]*RETURN jsonb_build_object/]);
    expectSqlContracts(extractFunction(sql, "create_tenant_supplier"), [/SELECT setting\.\* INTO v_setting[\s\S]*FROM public\.tenant_supplier_settings AS setting[\s\S]*FOR UPDATE;[\s\S]*IF NOT v_setting\.module_enabled/]);
    expectSqlContracts(extractFunction(sql, "create_platform_supplier"), [/EXCEPTION\s+WHEN unique_violation THEN[\s\S]*'status', 'state_conflict'[\s\S]*'SUPPLIER_STATE_CONFLICT'/]);
    expectSqlContracts(extractFunction(sql, "review_supplier_qualification"), [/SELECT qualification\.supplier_id\s+INTO v_qualification_supplier_id[\s\S]*SELECT supplier\.\* INTO v_supplier[\s\S]*WHERE supplier\.id = v_qualification_supplier_id\s+FOR UPDATE;[\s\S]*SELECT qualification\.\* INTO v_qualification[\s\S]*FOR UPDATE;/, /v_qualification\.supplier_id IS DISTINCT FROM p_supplier_id/]);
    expectSqlContracts(extractFunction(sql, "mutate_platform_supplier"), [/SELECT supplier\.\* INTO v_supplier[\s\S]*WHERE supplier\.id = p_supplier_id\s+FOR UPDATE;[\s\S]*p_action = 'approve'[\s\S]*FROM public\.supplier_qualification_types AS qualification_type/]);
    for (const [name, previous] of [["mutate_platform_supplier", "previous_supplier"], ["review_supplier_qualification", "previous_qualification"], ["set_tenant_supplier_module", "previous_setting"]] as const) {
      expectSqlContracts(extractFunction(sql, name), [new RegExp(`'idempotent', true,[\\s\\S]*'${previous}', v_event\\.from_state - '_request'`), new RegExp(`'idempotent', false,[\\s\\S]*'${previous}', v_before`)]);
    }
    expectSqlContracts(sql, [
      /p_action = 'submit'[\s\S]*onboarding_status IN \('draft', 'rejected'\)[\s\S]*'pending_review'/,
      /p_action = 'approve'[\s\S]*onboarding_status = 'pending_review'[\s\S]*'approved'/,
      /p_action = 'blacklist'[\s\S]*operational_status IN \('active', 'suspended'\)[\s\S]*'blacklisted'/,
      /qualification_type\.status = 'active'[\s\S]*qualification_type\.is_required[\s\S]*supplier\.supplier_type = ANY \(qualification_type\.applicable_supplier_types\)[\s\S]*verification_status = 'verified'[\s\S]*valid_until >= CURRENT_DATE/,
      /p_verification_status NOT IN \('verified', 'rejected'\)[\s\S]*qualification\.supplier_id IS DISTINCT FROM p_supplier_id/,
      /module_enabled[\s\S]*enabled_by_employee_id[\s\S]*require_active_contract_for_new_order/,
      /v_supplier\.onboarding_status <> 'approved'[\s\S]*v_supplier\.operational_status <> 'active'[\s\S]*'evaluating'/,
      /p_action = 'activate'[\s\S]*relationship_status IN \('evaluating', 'suspended'\)[\s\S]*'active'/,
      /p_action = 'terminate'[\s\S]*lifecycle_status IN \('draft', 'active'\)[\s\S]*'terminated'/,
    ]);
    expect(extractFunction(sql, "mutate_tenant_supplier")).not.toContain("UPDATE public.suppliers");
    expect(sql).not.toContain("'unblacklist'");
  });
  test("locks complete eligibility and bounded available-supplier directory", () => {
    const eligibilitySet = extractFunction(migrationSql.foundationCommands, "get_tenant_supplier_order_eligibility_set");
    const eligibility = extractFunction(migrationSql.foundationCommands, "get_tenant_supplier_order_eligibility");
    const directory = extractFunction(migrationSql.foundationCommands, "list_available_suppliers_for_tenant");
    for (const reason of ["module_disabled", "supplier_not_approved", "supplier_suspended", "supplier_blacklisted", "relationship_not_active", "required_qualification_missing", "required_qualification_expired", "active_contract_required"]) expect(eligibilitySet).toContain(`'${reason}'`);
    expectSqlContracts(eligibility, [/p_checked_at timestamptz/, /IF p_checked_at IS NULL THEN[\s\S]*SUPPLIER_ORDER_NOT_ELIGIBLE/, /get_tenant_supplier_order_eligibility_set\(/, /jsonb_build_object\([\s\S]*'eligible'[\s\S]*'blocking_reasons'[\s\S]*'checked_at'/]);
    expectSqlContracts(eligibilitySet, [/qualification_status AS MATERIALIZED/, /qualification_type\.status = 'active'[\s\S]*qualification_type\.blocks_new_orders[\s\S]*relationship\.supplier_type =\s*ANY \(qualification_type\.applicable_supplier_types\)/, /verification_status = 'verified'[\s\S]*valid_from <= p_checked_at::date[\s\S]*valid_until >= p_checked_at::date/, /contract_status AS MATERIALIZED[\s\S]*lifecycle_status = 'active'[\s\S]*valid_from <= p_checked_at::date[\s\S]*valid_until >= p_checked_at::date/, /ARRAY_REMOVE\([\s\S]*'module_disabled'[\s\S]*'active_contract_required'/]);
    expectSqlContracts(directory, [/p_page integer DEFAULT 1/, /p_page_size integer DEFAULT 20/, /LEAST\(GREATEST\(COALESCE\(p_page_size, 20\), 1\), 100\)/, /onboarding_status = 'approved'[\s\S]*operational_status = 'active'/, /relationship_status IN \('blacklisted', 'terminated'\)/, /ORDER BY (?:supplier\.)?name ASC, (?:supplier\.)?id ASC/, /LIMIT v_page_size[\s\S]*OFFSET \(v_page - 1\) \* v_page_size/]);
    expect(migrationSql.foundationCommands).toMatch(/CREATE INDEX suppliers_available_directory_idx\s+ON public\.suppliers\(onboarding_status, operational_status, name, id\);/);
  });
  test("seeds supplier permissions only to their intended global or tenant admin roles", () => {
    const sql = migrationSql.foundationPermissions;
    const platformCodes = ["platform.supplier.view", "platform.supplier.review", "platform.supplier.manage", "platform.supplier.blacklist", "platform.catalog.manage"] as const;
    const tenantCodes = ["supplier.view", "supplier.manage", "supplier.contract.manage"] as const;
    for (const code of [...platformCodes, ...tenantCodes]) expect(sql).toContain(`'${code}'`);
    expectSqlContracts(sql, [/^-- Rollback: in a forward migration, remove the matching scoped role_permissions rows/, /permissions\.code IN \(\s*'platform\.supplier\.view',[\s\S]*'platform\.catalog\.manage'\s*\)[\s\S]*roles\.code = 'platform_admin'\s+AND roles\.tenant_id IS NULL/, /permissions\.code IN \(\s*'supplier\.view',[\s\S]*'supplier\.contract\.manage'\s*\)[\s\S]*roles\.code = 'system_admin'\s+AND roles\.tenant_id IS NOT NULL/]);
    expect([...sql.matchAll(/roles\.code = '([a-z_]+)'/g)].map((match) => match[1])).toEqual(["platform_admin", "system_admin"]);
    expect([...sql.matchAll(/SELECT roles\.id, permissions\.id, '([^']+)'/g)].map((match) => match[1])).toEqual(["all", "all"]);
    expectTransactionalMigration(sql);
  });
});
