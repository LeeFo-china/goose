import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPaths = {
  platformOcrScope: new URL(
    "../../../../supabase/migrations/20260724210000_add_platform_supplier_ocr_scope.sql",
    import.meta.url,
  ),
  supplierOnboardingCommand: new URL(
    "../../../../supabase/migrations/20260724211000_create_supplier_onboarding_command.sql",
    import.meta.url,
  ),
} as const;

function readMigration(path: URL): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function extractFunction(sql: string, name: string): string {
  const start = sql.search(new RegExp(`CREATE FUNCTION public\\.${name}\\s*\\(`));
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

describe("supplier OCR onboarding migration contract", () => {
  test("extends OCR recognitions with explicit tenant and platform scope", () => {
    const sql = readMigration(migrationPaths.platformOcrScope);

    expect(existsSync(migrationPaths.platformOcrScope)).toBe(true);
    expect(sql).toMatch(/^-- Rollback:/);
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(sql).toContain(
      "ALTER TABLE public.ocr_recognitions ADD COLUMN scope_type text NOT NULL DEFAULT 'tenant'",
    );
    expect(sql).toContain(
      "ALTER TABLE public.ocr_recognitions ALTER COLUMN tenant_id DROP NOT NULL",
    );
    expect(sql).toContain("scope_type IN ('tenant', 'platform')");
    expect(sql).toContain("scope_type = 'tenant' AND tenant_id IS NOT NULL");
    expect(sql).toContain("scope_type = 'platform' AND tenant_id IS NULL");
    expect(sql).toContain("supplier_onboarding");
    expect(sql).toContain("ocr_recognitions_tenant_idempotency_idx");
    expect(sql).toContain("WHERE scope_type = 'tenant'");
    expect(sql).toContain("ocr_recognitions_platform_idempotency_idx");
    expect(sql).toContain("WHERE scope_type = 'platform'");
    expect(sql).toContain("status IN ('processing', 'succeeded')");
    expect(sql).toContain("ocr_recognitions_scope_created_idx");
  });

  test("seeds platform OCR permission and default daily quota", () => {
    const sql = readMigration(migrationPaths.platformOcrScope);

    expect(sql).toContain("platform.ocr.recognize");
    expect(sql).toContain("'recognition'");
    expect(sql).toContain("'create'");
    expect(sql).toContain("roles.code = 'platform_admin'");
    expect(sql).toContain("TENCENT_OCR_PLATFORM_DAILY_LIMIT");
    expect(sql).toContain("'100'");
    expect(sql).toContain("existing.tenant_id IS NULL");
    expect(sql).not.toContain("ON CONFLICT (key)");
  });

  test("adds nullable supplier legal representative and registered address text", () => {
    const sql = readMigration(migrationPaths.platformOcrScope);

    expect(sql).toContain("legal_representative_name text NULL");
    expect(sql).toContain("registered_address_text text NULL");
    expect(sql).toContain(
      "legal_representative_name IS NULL OR btrim(legal_representative_name) <> ''",
    );
    expect(sql).toContain(
      "registered_address_text IS NULL OR btrim(registered_address_text) <> ''",
    );
  });

  test("creates one atomic supplier onboarding RPC with private file checks", () => {
    const sql = readMigration(migrationPaths.supplierOnboardingCommand);
    const fn = extractFunction(sql, "create_supplier_onboarding");

    expect(existsSync(migrationPaths.supplierOnboardingCommand)).toBe(true);
    expect(sql).toMatch(/^-- Rollback:/);
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(fn).toContain("SECURITY DEFINER");
    expect(fn).toContain("SET search_path = pg_catalog, public");
    expect(fn).toContain("FROM public.supplier_command_events");
    expect(fn).toContain("FOR UPDATE");
    expect(fn).toContain("supplier_business_license");
    expect(fn).toContain("visibility = 'private'");
    expect(fn).toContain("status = 'active'");
    expect(fn).toContain("tenant_id IS NULL");
    expect(fn).toContain("owner_type = 'supplier_business_license'");
    expect(fn).toContain("owner_id IS NULL");
    expect(fn).toContain("created_by_employee_id = p_actor_employee_id");
  });

  test("creates supplier, pending qualification, primary contact, file binding, and ledger in one function", () => {
    const sql = readMigration(migrationPaths.supplierOnboardingCommand);
    const fn = extractFunction(sql, "create_supplier_onboarding");

    expect(fn).toContain("INSERT INTO public.suppliers");
    expect(fn).toContain("onboarding_status");
    expect(fn).toContain("'draft'");
    expect(fn).toContain("operational_status");
    expect(fn).toContain("'active'");
    expect(fn).toContain("INSERT INTO public.supplier_qualifications");
    expect(fn).toContain("verification_status");
    expect(fn).toContain("'pending'");
    expect(fn).toContain("INSERT INTO public.supplier_contacts");
    expect(fn).toContain("'primary'");
    expect(fn).toContain("is_primary");
    expect(fn).toContain("UPDATE public.platform_file_objects");
    expect(fn).toContain("owner_type = 'supplier'");
    expect(fn).toContain("owner_id = v_supplier.id");
    expect(fn).toContain("INSERT INTO public.supplier_command_events");
    expect(fn).not.toContain("'approved'");
    expect(fn).not.toContain("'verified'");
  });

  test("keeps aggregate RPC private and executable only by service role", () => {
    const sql = readMigration(migrationPaths.supplierOnboardingCommand);

    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_supplier_onboarding\([^;]+FROM PUBLIC, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_supplier_onboarding\([^;]+TO service_role;/,
    );
  });
});
