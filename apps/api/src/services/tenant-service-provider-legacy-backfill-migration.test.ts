import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migration = new URL(
  "../../../../supabase/migrations/20260717110000_backfill_legacy_service_provider_profiles.sql",
  import.meta.url,
);

describe("legacy service provider profile backfill migration", () => {
  test("backfills draft profiles for active historical tenants", () => {
    const sql = existsSync(migration) ? readFileSync(migration, "utf8") : "";

    expect(sql).toContain("INSERT INTO public.tenant_service_provider_profiles");
    expect(sql).toContain("FROM public.tenants AS tenant");
    expect(sql).toContain("tenant.status = 'active'");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("existing_profile.tenant_id = tenant.id");
    expect(sql).toContain("pg_catalog.btrim(tenant.name)");
    expect(sql).toContain("'draft'");
  });

  test("lets legacy active areas enter review and deactivates them during submit", () => {
    const sql = existsSync(migration) ? readFileSync(migration, "utf8") : "";
    const submitFunction = sql.match(
      /CREATE OR REPLACE FUNCTION public\.submit_tenant_service_provider_profile[\s\S]*?END;\s*\$\$;/,
    )?.[0] ?? "";

    expect(submitFunction).not.toBe("");
    expect(submitFunction).toContain("FROM public.tenant_service_areas AS area");
    expect(submitFunction).toContain("WHERE area.tenant_id = p_tenant_id");
    expect(submitFunction).not.toContain("area.status = 'inactive'");
    expect(submitFunction).toMatch(
      /UPDATE public\.tenant_service_areas\s+SET status = 'inactive'\s+WHERE tenant_id = p_tenant_id/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.submit_tenant_service_provider_profile[\s\S]*?TO service_role/,
    );
  });
});
