import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const isolationSql = readFileSync(new URL(
  "../../../../supabase/migrations/20260813160700_isolate_private_suppliers_from_platform.sql",
  import.meta.url,
), "utf8");
const identitySql = readFileSync(new URL(
  "../../../../supabase/migrations/20260813160800_classify_private_supplier_identity_conflicts.sql",
  import.meta.url,
), "utf8");
const validationSql = readFileSync(new URL(
  "../../../../supabase/migrations/20260813160900_preserve_private_supplier_validation.sql",
  import.meta.url,
), "utf8");
const authorizationSql = readFileSync(new URL(
  "../../../../supabase/migrations/20260813161000_authorize_private_supplier_identity_check.sql",
  import.meta.url,
), "utf8");
const finalBoundarySql = readFileSync(new URL(
  "../../../../supabase/migrations/20260813161100_close_supplier_platform_boundaries.sql",
  import.meta.url,
), "utf8");
const compact = (value: string) => value.replace(/\s+/g, " ").trim();

describe("platform and private supplier isolation migrations", () => {
  test("filters the platform directory and guards every supplier command", () => {
    const sql = compact(isolationSql);
    expect(sql).toContain("supplier.ownership_scope = 'platform'");
    expect(sql).toContain("supplier.owner_tenant_id IS NULL");
    expect(sql).toContain("CREATE FUNCTION public.assert_platform_supplier");
    for (const name of [
      "create_supplier_qualification",
      "create_supplier_service_region",
      "create_supplier_address",
      "create_supplier_contact",
      "mutate_platform_supplier",
      "review_supplier_qualification",
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${name}`);
      expect(sql).toContain(`CREATE FUNCTION public.${name}_guarded`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${name}_guarded`);
    }
  });

  test("serializes credit identity checks without breaking command replay", () => {
    const sql = compact(`${identitySql}\n${validationSql}\n${authorizationSql}`);
    expect(sql).toContain("CREATE FUNCTION public.create_tenant_private_supplier_guarded");
    expect(sql).toContain("supplier_command_events");
    expect(sql).toContain("SUPPLIER_IDENTITY_CONFLICT");
    expect(sql).toContain("suppliers_tenant_credit_code_unique_idx");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.create_tenant_private_supplier");
    expect(sql).toContain("IF p_tenant_id IS NULL");
    const latest = compact(authorizationSql);
    expect(latest.indexOf("assert_tenant_supplier_actor"))
      .toBeLessThan(latest.indexOf("tenant-private-supplier-credit:"));
    expect(latest.indexOf("private_supplier_writes_enabled"))
      .toBeLessThan(latest.indexOf("SUPPLIER_IDENTITY_CONFLICT"));
  });

  test("closes onboarding, lock, view ACL, and private update races", () => {
    const sql = compact(finalBoundarySql);
    expect(sql).toContain("public.create_supplier_onboarding(uuid,text,text,text,text,text,text,uuid,uuid,date,date,text,text,text,integer,uuid,uuid,text)");
    expect(sql).toContain("supplier.ownership_scope = 'platform'");
    expect(sql).toContain("supplier.owner_tenant_id IS NULL");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("GRANT SELECT ON public.platform_supplier_directory TO service_role");
    expect(sql).toContain("update_tenant_private_supplier_master_guarded");
    expect(sql).toContain("tenant-private-supplier-credit:");
  });
});
