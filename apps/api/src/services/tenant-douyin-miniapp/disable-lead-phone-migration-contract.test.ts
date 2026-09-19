import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migration = new URL(
  "../../../../../supabase/migrations/20260919160000_disable_douyin_lead_phone_capture.sql",
  import.meta.url,
);

function source(): string {
  return existsSync(migration) ? readFileSync(migration, "utf8") : "";
}

function normalize(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
}

describe("disable Douyin lead phone capture migration", () => {
  test("normalizes every installation while preserving unrelated runtime keys", () => {
    const raw = source();
    const sql = normalize(raw);
    expect(existsSync(migration)).toBe(true);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
    expect(sql).toContain("SET LOCAL statement_timeout = '30s'");
    expect(sql).toContain("UPDATE public.douyin_miniapp_installations AS installation");
    expect(sql).toContain("'{features,douyin_phone}', 'false'::jsonb, true");
    expect(sql).toContain("'{features,phone_capture_mode}', '\"sms\"'::jsonb, true");
    expect(sql).not.toContain("jsonb_build_object( 'cases'");
    expect(raw).toContain("Rollback");
  });

  test("keeps the five-argument RPC but prevents enabling phone capture", () => {
    const sql = normalize(source());
    const signature = "public.update_douyin_miniapp_lead_capture_config( uuid, uuid, text, timestamptz, boolean )";
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.update_douyin_miniapp_lead_capture_config(");
    expect(sql).toContain("IF p_enabled THEN");
    expect(sql).toContain("'DOUYIN_LEAD_PHONE_MODE_UNAVAILABLE'");
    expect(sql).toContain("'enabled', false");
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO (?:PUBLIC|anon|authenticated)/);
  });
});
