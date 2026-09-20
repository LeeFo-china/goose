import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migration = new URL(
  "../../../../../supabase/migrations/20260920100000_restore_douyin_lead_phone_capture.sql",
  import.meta.url,
);

function source(): string {
  return existsSync(migration) ? readFileSync(migration, "utf8") : "";
}

function normalize(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
}

describe("restore Douyin lead phone capture migration", () => {
  test("enables only active merchant installations and preserves runtime keys", () => {
    const raw = source();
    const sql = normalize(raw);
    expect(existsSync(migration)).toBe(true);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
    expect(sql).toContain("SET LOCAL statement_timeout = '30s'");
    expect(sql).toContain("LOCK TABLE public.douyin_miniapp_installations");
    expect(sql).toContain("installation.installation_kind = 'merchant'");
    expect(sql).toContain("installation.authorization_status = 'active'");
    expect(sql).toContain("installation.runtime_config -> 'features'");
    expect(sql).toContain("'douyin_phone', true");
    expect(sql).toContain("'phone_capture_mode', 'douyin_phone'");
    expect(sql).not.toContain("jsonb_build_object( 'cases'");
    expect(raw).toContain("Rollback");
  });

  test("restores the guarded five-argument toggle RPC", () => {
    const sql = normalize(source());
    const signature = "public.update_douyin_miniapp_lead_capture_config( uuid, uuid, text, timestamptz, boolean )";
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.update_douyin_miniapp_lead_capture_config(",
    );
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("v_features || pg_catalog.jsonb_build_object");
    expect(sql).toContain("'douyin_phone', p_enabled");
    expect(sql).toContain("CASE WHEN p_enabled THEN 'douyin_phone' ELSE 'sms' END");
    expect(sql).toContain("'enabled', p_enabled");
    expect(sql).not.toContain("DOUYIN_LEAD_PHONE_MODE_UNAVAILABLE");
    expect(sql).toContain(
      `REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated`,
    );
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO (?:PUBLIC|anon|authenticated)/);
  });
});
