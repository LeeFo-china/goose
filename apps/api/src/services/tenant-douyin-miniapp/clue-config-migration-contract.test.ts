import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migration = new URL(
  "../../../../../supabase/migrations/20260906101000_add_tenant_douyin_clue_component_config.sql",
  import.meta.url,
);

function source(): string {
  return existsSync(migration) ? readFileSync(migration, "utf8") : "";
}

function normalize(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
}

describe("tenant Douyin clue component configuration migration", () => {
  test("adds retained installation storage with a bounded identifier", () => {
    const sql = normalize(source());
    expect(existsSync(migration)).toBe(true);
    expect(sql).toContain("ADD COLUMN clue_component_id text");
    expect(sql).toContain("LOCK TABLE public.douyin_miniapp_installations IN SHARE ROW EXCLUSIVE MODE");
    expect(sql).toContain("clue_component_id ~ '^[A-Za-z0-9_-]{1,128}$'");
    expect(sql).toContain("runtime_config -> 'features' ->> 'phone_capture_mode' = 'douyin_phone'");
    expect(sql).toContain("runtime_config -> 'features' ->> 'clue_component_id'");
    expect(sql).toContain("installation_kind <> 'merchant'");
  });

  test("updates the exact active tenant installation under a row lock and CAS", () => {
    const sql = normalize(source());
    const start = sql.indexOf("FUNCTION public.update_douyin_miniapp_lead_capture_config");
    const block = sql.slice(start);
    const rowRead = block.indexOf("FROM public.douyin_miniapp_installations AS installation");
    const rowLock = block.indexOf("FOR UPDATE", rowRead);
    const staleCheck = block.indexOf(
      "v_installation.updated_at IS DISTINCT FROM p_expected_updated_at",
      rowLock,
    );
    const update = block.indexOf("UPDATE public.douyin_miniapp_installations", staleCheck);
    expect(start).toBeGreaterThan(-1);
    expect(rowRead).toBeGreaterThan(-1);
    expect(rowLock).toBeGreaterThan(rowRead);
    expect(staleCheck).toBeGreaterThan(rowLock);
    expect(update).toBeGreaterThan(staleCheck);
    expect(block).toContain("installation.tenant_id = p_tenant_id");
    expect(block).toContain(
      "installation.authorizer_appid = pg_catalog.btrim(p_authorizer_appid)",
    );
    expect(block).toContain("installation.installation_kind = 'merchant'");
    expect(block).toContain("installation.authorization_status = 'active'");
    expect(block).toContain("'DOUYIN_LEAD_CAPTURE_CONFIG_STALE'");
    expect(block).toContain(
      "pg_catalog.jsonb_typeof(v_features) IS DISTINCT FROM 'object'",
    );
    expect(block).toContain(
      "pg_catalog.jsonb_typeof(v_features -> 'cases') IS DISTINCT FROM 'boolean'",
    );
  });

  test("keeps the retained ID while disabled and writes exact runtime modes", () => {
    const sql = normalize(source());
    expect(sql).toContain("v_stored_clue_component_id := COALESCE(");
    expect(sql).toContain(
      "NULLIF(pg_catalog.btrim(p_clue_component_id), ''), v_installation.clue_component_id",
    );
    expect(sql).toContain("'phone_capture_mode', 'douyin_phone'");
    expect(sql).toContain("'douyin_phone', true");
    expect(sql).toContain("'clue_component_id', v_stored_clue_component_id");
    expect(sql).toContain("'phone_capture_mode', 'sms'");
    expect(sql).toContain("'douyin_phone', false");
    expect(sql).not.toContain("v_features ||");
    expect(sql).toContain("'DOUYIN_CLUE_COMPONENT_ID_REQUIRED'");
  });

  test("uses a monotonic installation token and service-role-only command", () => {
    const raw = source();
    const sql = normalize(raw);
    expect(sql).toContain(
      "NEW.updated_at := GREATEST( clock_timestamp(), OLD.updated_at + interval '1 microsecond', NEW.updated_at )",
    );
    expect(sql).toContain("SECURITY DEFINER SET search_path = pg_catalog, public");
    const signature =
      "public.update_douyin_miniapp_lead_capture_config( uuid, uuid, text, timestamptz, boolean, text )";
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated;`);
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM service_role;`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role;`);
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO (?:PUBLIC|anon|authenticated)/);
    expect(raw).toContain("Rollback (forward migration only)");
  });
});
