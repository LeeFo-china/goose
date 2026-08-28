import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../../../../supabase/migrations/20260828160000_allow_douyin_authorization_restart.sql",
);

function compactSql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("tenant Douyin authorization restart migration", () => {
  test("supersedes an abandoned pending intent before replacement", () => {
    const sql = compactSql();

    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.create_tenant_douyin_authorization_intent",
    );
    expect(sql).toContain("WHERE tenant.id = p_tenant_id AND tenant.status = 'active' FOR UPDATE");
    expect(sql).toContain(
      "SET status = 'failed', failure_code = 'DOUYIN_AUTHORIZATION_RESTARTED'",
    );
    expect(sql).toContain(
      "WHERE intent.tenant_id = p_tenant_id AND intent.status = 'pending'",
    );
  });

  test("keeps callback processing protected from replacement", () => {
    const sql = compactSql();

    expect(sql).toContain(
      "intent.status = 'completing' AND intent.expires_at > v_now",
    );
    expect(sql).toContain("MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_CONFLICT'");
    expect(sql).not.toContain(
      "SET status = 'failed', failure_code = 'DOUYIN_AUTHORIZATION_RESTARTED' WHERE intent.tenant_id = p_tenant_id AND intent.status IN ('pending', 'completing')",
    );
  });

  test("retains the security-definer boundary and service-role-only execution", () => {
    const sql = compactSql();

    expect(sql).toContain("SECURITY DEFINER SET search_path = pg_catalog, public");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.create_tenant_douyin_authorization_intent( uuid, uuid, text, text, timestamptz ) FROM PUBLIC, anon, authenticated",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.create_tenant_douyin_authorization_intent( uuid, uuid, text, text, timestamptz ) TO service_role",
    );
  });
});
