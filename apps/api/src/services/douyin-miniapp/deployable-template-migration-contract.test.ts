import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../../supabase/migrations/20260813200000_create_douyin_deployable_templates.sql",
  import.meta.url,
);
const migration = existsSync(migrationUrl)
  ? readFileSync(migrationUrl, "utf8").replace(/\s+/g, " ")
  : "";

describe("Douyin deployable template migration", () => {
  test("stores immutable template confirmations with one current row per channel", () => {
    expect(migration).toContain(
      "CREATE TABLE public.douyin_miniapp_deployable_templates",
    );
    expect(migration).toContain("source_draft_id text NOT NULL");
    expect(migration).toContain(
      "UNIQUE (source_draft_id, channel)",
    );
    expect(migration).toContain("UNIQUE (template_id, channel)");
    expect(migration).toContain("channel text NOT NULL DEFAULT 'default'");
    expect(migration).toContain("is_current boolean NOT NULL DEFAULT true");
    expect(migration).toContain(
      "CREATE UNIQUE INDEX douyin_deployable_templates_one_current_channel_idx",
    );
    expect(migration).toContain("WHERE is_current = true");
    expect(migration).toContain(
      "template_app_id = 'tt0d647bd99301341b01'",
    );
  });

  test("confirms the current template atomically and service-role only", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.confirm_douyin_deployable_template",
    );
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("OR p_channel IS NULL");
    expect(migration).toContain(
      "p_template_app_id <> 'tt0d647bd99301341b01'",
    );
    expect(migration).toContain("IF v_existing.id IS NOT NULL THEN");
    expect(migration).not.toContain("IF FOUND AND v_existing.id IS NOT NULL");
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.douyin_miniapp_deployable_templates FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE ON TABLE public.douyin_miniapp_deployable_templates TO service_role",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.confirm_douyin_deployable_template",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.confirm_douyin_deployable_template",
    );
  });

  test("grants production publishing only to tenant system administrators", () => {
    expect(migration).toContain("'douyin_miniapp.publish'");
    expect(migration).toContain("WHERE roles.code = 'system_admin'");
    expect(migration).toContain("AND roles.tenant_id IS NOT NULL");
    expect(migration).toContain("AND roles.status = 'active'");
  });

  test("prevents a newer template from replacing an unfinished tenant release", () => {
    expect(migration).toContain(
      "CREATE FUNCTION public.prevent_douyin_unfinished_release_replacement",
    );
    expect(migration).toContain(
      "CREATE TRIGGER prevent_douyin_unfinished_release_replacement_trigger",
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX douyin_miniapp_releases_one_unfinished_installation_idx",
    );
    expect(migration).toContain("ON public.douyin_miniapp_releases(installation_id)");
    expect(migration).toContain(
      "release.operation_claim_token IS NOT NULL",
    );
    expect(migration).toContain(
      "release.operation_claim_expires_at > clock_timestamp()",
    );
    expect(migration).toContain(
      "MESSAGE = 'DOUYIN_UNFINISHED_RELEASE_DUPLICATES_EXIST'",
    );
    expect(migration).toContain("GROUP BY release.installation_id");
    expect(migration).toContain("HAVING count(*) > 1");
    expect(migration).toContain(
      "'created', 'uploaded', 'testing', 'audit_pending'",
    );
    expect(migration).toContain("'audit_approved'");
  });

  test("authorizes confirmation by active platform permission and all scope", () => {
    expect(migration).toContain(
      "permission.code = 'platform.douyin_miniapp.manage'",
    );
    expect(migration).toContain("role_permission.access_scope = 'all'");
    expect(migration).not.toContain(
      "PERFORM public.assert_platform_operator_actor(p_actor_employee_id)",
    );
  });
});
