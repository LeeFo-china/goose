import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260715100000_create_phone_identity_login.sql",
    import.meta.url,
  ),
  "utf8",
);
const selectionPhoneSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260715101000_return_phone_identity_selection_phone.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("phone identity login migration", () => {
  test("adds the SMS scene without removing legacy scenes", () => {
    for (const scene of [
      "bind_customer",
      "bind_employee",
      "bind_platform_partner",
      "tenant_onboarding_application",
      "login_identity",
    ]) {
      expect(sql).toContain(`'${scene}'`);
    }
  });

  test("creates bounded session and candidate storage", () => {
    expect(sql).toContain("CREATE TABLE public.phone_identity_login_sessions");
    expect(sql).toContain("CREATE TABLE public.phone_identity_login_candidates");
    expect(sql).toContain(
      "phone_identity_login_sessions_token_hash_unique_idx",
    );
    expect(sql).toContain("phone_identity_login_sessions_status_expires_idx");
    expect(sql).toContain("phone_identity_login_candidates_session_idx");
    expect(sql).toMatch(
      /jsonb_array_length\(p_candidates\) NOT BETWEEN 2 AND 100/,
    );
    expect(sql).toContain(
      "ALTER TABLE public.phone_identity_login_sessions ENABLE ROW LEVEL SECURITY",
    );
    expect(sql).toContain(
      "ALTER TABLE public.phone_identity_login_candidates ENABLE ROW LEVEL SECURITY",
    );
    expect(sql).toContain(
      "REVOKE ALL ON TABLE public.phone_identity_login_sessions FROM PUBLIC, anon, authenticated",
    );
    expect(sql).toContain(
      "REVOKE ALL ON TABLE public.phone_identity_login_candidates FROM PUBLIC, anon, authenticated",
    );
  });

  test("locks SMS and selection rows before state changes", () => {
    expect(sql).toMatch(
      /claim_phone_identity_login_verification[\s\S]*FOR UPDATE/,
    );
    expect(sql).toMatch(/reserve_phone_identity_selection[\s\S]*FOR UPDATE/);
    expect(sql).toContain("status = 'verified'");
    expect(sql).toContain("status = 'binding'");
    expect(sql).toContain("status = 'consumed'");
  });

  test("restricts every mutation RPC to service role", () => {
    for (const name of [
      "claim_phone_identity_login_verification",
      "begin_phone_identity_selection",
      "reserve_phone_identity_selection",
      "finalize_phone_identity_selection",
      "release_phone_identity_selection",
      "purge_phone_identity_login_sessions",
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${name}`);
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated;`,
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?TO service_role;`,
        ),
      );
    }
  });

  test("adds phone-first indexes and preserves partner uniqueness", () => {
    expect(sql).toContain("customers_phone_identity_login_idx");
    expect(sql).toContain("employees_phone_identity_login_idx");
    expect(sql).not.toContain(
      "DROP INDEX IF EXISTS platform_partner_members_phone_active_unique_idx",
    );
  });

  test("purges only a bounded expired audit batch", () => {
    expect(sql).toMatch(
      /purge_phone_identity_login_sessions[\s\S]*p_limit integer DEFAULT 500/,
    );
    expect(sql).toMatch(/p_limit NOT BETWEEN 1 AND 1000/);
    expect(sql).toMatch(
      /expires_at < p_before[\s\S]*LIMIT p_limit[\s\S]*FOR UPDATE SKIP LOCKED/,
    );
  });

  test("returns verified phone when reserving a selected candidate", () => {
    expect(selectionPhoneSql).toContain(
      "DROP FUNCTION public.reserve_phone_identity_selection",
    );
    expect(selectionPhoneSql).toMatch(
      /RETURNS TABLE\([\s\S]*verified_phone text[\s\S]*target_mode text/,
    );
    expect(selectionPhoneSql).toContain("v_session.verified_phone");
    expect(selectionPhoneSql).toContain(
      "REVOKE ALL ON FUNCTION public.reserve_phone_identity_selection",
    );
    expect(selectionPhoneSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.reserve_phone_identity_selection",
    );
  });
});
