import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migration = new URL(
  "../../../../supabase/migrations/20260714230000_create_service_provider_publication_rpc.sql",
  import.meta.url,
);

describe("service provider publication migration", () => {
  test("defines service-role-only atomic profile and publication functions", () => {
    const sql = existsSync(migration) ? readFileSync(migration, "utf8") : "";
    for (const fn of [
      "update_tenant_service_provider_profile",
      "upsert_tenant_service_provider_area",
      "submit_tenant_service_provider_profile",
      "publish_tenant_service_provider",
      "return_tenant_service_provider_to_draft",
      "suspend_tenant_service_provider",
    ]) {
      expect(sql).toContain(`FUNCTION public.${fn}`);
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}[\\s\\S]*?TO service_role`));
    }
    expect(sql).toContain("jsonb_object_keys");
    expect(sql).toContain("tenant_service_provider_profiles");
    expect(sql).toContain("UPDATE public.tenant_service_areas");
    expect(sql).toContain("status = 'inactive'");
  });

  test("keeps edits, publication, and regional visitor visibility atomic", () => {
    const sql = readFileSync(migration, "utf8");
    expect(sql).toContain("WHEN v_profile.status = 'pending_review' THEN 'draft'");
    expect(sql).toContain("WHEN v_profile.status IN ('published', 'suspended')");
    expect(sql).toContain("profile.status <> 'pending_review'");
    expect(sql).toContain("tenant.status = 'active'");
    expect(sql).toContain("area.status = 'active'");
    expect(sql).toContain("profile.status = 'published'");
    expect(sql).toContain("area.adcode = ANY");
    expect(sql).toContain("NULLIF(pg_catalog.btrim(v_profile.public_phone), '') IS NULL");
    expect(sql).toContain("USING gin (public_name extensions.gin_trgm_ops)");

    const targetLock = sql.indexOf("WHERE area.id = p_area_id AND area.tenant_id = p_tenant_id");
    const deactivate = sql.indexOf(
      "UPDATE public.tenant_service_areas SET status = 'inactive'",
      sql.indexOf("FUNCTION public.upsert_tenant_service_provider_area"),
    );
    expect(targetLock).toBeGreaterThan(0);
    expect(targetLock).toBeLessThan(deactivate);
  });
});
