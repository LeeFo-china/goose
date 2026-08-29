import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../../../../supabase/migrations/20260829012000_repair_douyin_release_upload_v2_visibility.sql",
);

function sql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("douyin release upload claim v2 visibility repair migration", () => {
  test("reads the release in a new PL/pgSQL statement after the legacy claim command", () => {
    const source = sql();

    expect(source).toContain(
      "CREATE OR REPLACE FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v2",
    );
    expect(source).toContain("LANGUAGE plpgsql");
    expect(source).toMatch(
      /SELECT legacy\.id, legacy\.recovery_required INTO v_release_id, v_recovery_required FROM public\.get_or_create_and_claim_douyin_miniapp_release_upload\(/,
    );
    expect(source).toMatch(
      /IF NOT FOUND THEN RETURN; END IF; SELECT release\.\* INTO STRICT v_release FROM public\.douyin_miniapp_releases AS release/,
    );
    expect(source).not.toMatch(
      /FROM public\.get_or_create_and_claim_douyin_miniapp_release_upload\([^;]+JOIN public\.douyin_miniapp_releases/,
    );
  });

  test("keeps the repaired v2 RPC service-role-only with a fixed search path", () => {
    const source = sql();
    const signature = "public\\.get_or_create_and_claim_douyin_miniapp_release_upload_v2\\( uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid \\)";

    expect(source).toContain("SECURITY DEFINER SET search_path = pg_catalog, public");
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(source).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${signature} FROM ${role}`));
    }
    expect(source).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`));
  });

  test("clears only the proven pre-provider production claim after it expires", () => {
    const source = sql();

    expect(source).toContain("id = '6373d5b7-562a-4681-91e2-dea64fa12ff8'::uuid");
    expect(source).toContain("installation_id = '2452739c-1683-4a57-a0af-b5e973e349a0'::uuid");
    expect(source).toContain("template_id = '78689'");
    expect(source).toContain("template_version = '0.1.7'");
    expect(source).toMatch(
      /status = 'created'[^;]*douyin_log_id IS NULL[^;]*test_qr_url IS NULL[^;]*latest_test_qr_url IS NULL[^;]*audit_qr_url IS NULL/,
    );
    expect(source).toMatch(
      /operation_name = 'upload'[^;]*operation_claim_token IS NOT NULL[^;]*operation_claim_expires_at <= clock_timestamp\(\)/,
    );
    expect(source).toMatch(
      /SET operation_name = NULL, operation_claim_token = NULL, operation_claim_expires_at = NULL/,
    );
    expect(source).not.toMatch(/UPDATE public\.douyin_miniapp_releases(?![\s\S]*WHERE)/);
  });
});
