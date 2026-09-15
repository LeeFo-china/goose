import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migration = new URL(
  "../../../../../supabase/migrations/20260915090000_remove_douyin_clue_component_dependency.sql",
  import.meta.url,
);

function source(): string {
  return existsSync(migration) ? readFileSync(migration, "utf8") : "";
}

function normalize(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
}

describe("standalone Douyin phone capture migration", () => {
  test("removes the clue component runtime dependency while retaining the column", () => {
    const sql = normalize(source());
    expect(existsSync(migration)).toBe(true);
    expect(sql).toContain(
      "DROP CONSTRAINT douyin_installations_active_clue_component_check",
    );
    expect(sql).toContain("runtime_config #- '{features,clue_component_id}'");
    expect(sql).not.toContain("DROP COLUMN clue_component_id");
  });

  test("replaces the config command with a five-argument service-role-only RPC", () => {
    const sql = normalize(source());
    expect(sql).toContain(
      "DROP FUNCTION public.update_douyin_miniapp_lead_capture_config(uuid, uuid, text, timestamptz, boolean, text)",
    );
    expect(sql).toContain(
      "FUNCTION public.update_douyin_miniapp_lead_capture_config( p_tenant_id uuid, p_installation_id uuid, p_authorizer_appid text, p_expected_updated_at timestamptz, p_enabled boolean )",
    );
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain(
      "v_installation.updated_at IS DISTINCT FROM p_expected_updated_at",
    );
    expect(sql).toContain("'phone_capture_mode', 'douyin_phone'");
    expect(sql).not.toContain("'clue_component_id',");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("TO service_role");
  });
});
