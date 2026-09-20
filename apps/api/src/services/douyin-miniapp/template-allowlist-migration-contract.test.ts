import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../../supabase/migrations/20260920193000_add_douyin_template_tenant_allowlist.sql",
  import.meta.url,
);
const migration = existsSync(migrationUrl)
  ? readFileSync(migrationUrl, "utf8").replace(/\s+/g, " ")
  : "";

describe("Douyin tenant template allowlist migration", () => {
  test("adds audited tenant selectability and backfills the current template", () => {
    expect(migration).toContain("is_tenant_selectable boolean NOT NULL DEFAULT false");
    expect(migration).toContain("selectability_updated_at timestamptz NOT NULL DEFAULT now()");
    expect(migration).toContain("selectability_updated_by_employee_id uuid NULL");
    expect(migration).toContain("WHERE is_current = true");
    expect(migration).toContain("SET is_tenant_selectable = true");
    expect(migration).toContain("UPDATE OF is_current, is_tenant_selectable");
    expect(migration).toContain(
      "CREATE INDEX douyin_deployable_templates_selectable_channel_idx",
    );
  });

  test("keeps confirmed templates selectable without disabling older allowlist rows", () => {
    expect(migration).toContain(
      "CREATE FUNCTION public.ensure_current_douyin_template_selectable",
    );
    expect(migration).toContain("BEFORE INSERT OR UPDATE OF is_current");
    expect(migration).toContain("is_tenant_selectable = true");
    expect(migration).not.toContain("SET is_tenant_selectable = false");
  });

  test("changes selectability with CAS and protects the recommended template", () => {
    expect(migration).toContain(
      "CREATE FUNCTION public.set_douyin_deployable_template_selectability",
    );
    expect(migration).toContain("DOUYIN_TEMPLATE_SELECTABILITY_CHANGED");
    expect(migration).toContain("DOUYIN_CURRENT_TEMPLATE_MUST_REMAIN_SELECTABLE");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.set_douyin_deployable_template_selectability",
    );
  });

  test("links release cycles to templates and preserves released history", () => {
    expect(migration).toContain("deployable_template_id uuid NULL");
    expect(migration).toContain("other_template.id <> template.id");
    expect(migration).toContain("DROP CONSTRAINT douyin_miniapp_releases_delivery_key_unique");
    expect(migration).toContain("latest_exact.status = 'released'");
    expect(migration).toContain("INSERT INTO public.douyin_miniapp_releases");
    expect(migration).toContain(
      "CREATE FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v3",
    );
    expect(migration).toContain("p_deployable_template_id uuid");
    expect(migration).toContain("release.deployable_template_id");
  });

  test("keeps upload claims service-role only and documents forward rollback", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = pg_catalog, public");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v3",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v3",
    );
    expect(migration.toLowerCase()).toContain("rollback");
    expect(migration).toContain("DOUYIN_MINIAPP_RELEASE_UPLOAD_CLAIM_INVALID");
  });
});
