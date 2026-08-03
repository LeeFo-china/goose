import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = new URL(
  "../../../../../supabase/migrations/20260720110000_add_douyin_authorizer_force_refresh_claim.sql",
  import.meta.url,
);

describe("Douyin authorizer forced refresh claim migration", () => {
  test("claims only the exact provider-rejected merchant token under the existing lease", () => {
    const sql = readFileSync(migration, "utf8");

    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.claim_douyin_authorizer_token_force_refresh",
    );
    for (const predicate of [
      "installation.id = p_installation_id",
      "installation.access_token_ciphertext = p_expected_access_token_ciphertext",
      "installation.installation_kind = 'merchant'",
      "installation.authorization_status IN ('authorized_unbound', 'active')",
      "installation.refresh_token_expires_at > v_now",
      "installation.token_refresh_claim_token IS NULL",
      "installation.token_refresh_claim_expires_at <= v_now",
    ]) {
      expect(sql).toContain(predicate);
    }
    expect(sql).not.toContain("access_token_expires_at <= v_now + interval '5 minutes'");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.claim_douyin_authorizer_token_force_refresh");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.claim_douyin_authorizer_token_force_refresh");
  });
});
