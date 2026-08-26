import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../../../../supabase/migrations/20260826112000_add_douyin_release_upload_claim_v2.sql",
);

function sql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("douyin release upload claim v2 migration", () => {
  test("returns both current QR-stage fields without replacing the legacy RPC", () => {
    const source = sql();

    expect(source).toContain(
      "CREATE FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v2",
    );
    expect(source).toMatch(/RETURNS TABLE\([^)]*latest_test_qr_url text[^)]*audit_qr_url text[^)]*recovery_required boolean[^)]*\)/);
    expect(source).toMatch(/legacy\.test_qr_url, release\.latest_test_qr_url, release\.audit_qr_url/);
    expect(source).not.toMatch(/DROP FUNCTION[^;]*get_or_create_and_claim_douyin_miniapp_release_upload\(/);
  });

  test("delegates to the legacy atomic claim command with the exact inputs", () => {
    const source = sql();

    expect(source).toMatch(/FROM public\.get_or_create_and_claim_douyin_miniapp_release_upload\( p_installation_id, p_template_id, p_template_version, p_description, p_channel, p_ext_json, p_claim_token, p_claim_expires_at, p_operator_id \) AS legacy/);
    expect(source).toMatch(/JOIN public\.douyin_miniapp_releases AS release ON release\.id = legacy\.id AND release\.installation_id = legacy\.installation_id/);
  });

  test("keeps the v2 RPC service-role-only with a fixed search path", () => {
    const source = sql();
    const signature = "public\\.get_or_create_and_claim_douyin_miniapp_release_upload_v2\\( uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid \\)";

    expect(source).toContain("SECURITY DEFINER SET search_path = pg_catalog, public");
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(source).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${signature} FROM ${role}`));
    }
    expect(source).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`));
  });
});
