import { describe, expect, test } from "bun:test";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260902234314_restore_douyin_material_note_published_state.sql",
  import.meta.url,
);

const migrationFile = Bun.file(migrationPath);

describe("douyin material note restore migration contract", () => {
  test("is versioned and dev-only", async () => {
    expect(await migrationFile.exists()).toBe(true);
    const sql = await migrationFile.text();

    expect(sql).toContain("WECHAT_MINIPROGRAM_ENV_VERSION");
    expect(sql).toContain("lower(pg_catalog.btrim(setting.value_text)) = 'develop'");
    expect(sql).toMatch(/IF NOT v_is_develop THEN\s+RETURN;/);
    expect(sql.indexOf("IF NOT v_is_develop")).toBeLessThan(
      sql.indexOf("UPDATE public.douyin_material_notes"),
    );
  });

  test("targets only the mistaken withdrawn note and keeps production safe", async () => {
    const sql = await migrationFile.text();

    expect(sql).toContain("家庭排水系统设计与施工指南");
    expect(sql).toContain("note.status = 'withdrawn'");
    expect(sql).toContain("note.published_version_id IS NOT NULL");
    expect(sql).toContain("note.published_at IS NOT NULL");
    expect(sql).toContain("v_candidate_count > 1");
    expect(sql).toContain("DOUYIN_MATERIAL_NOTE_RESTORE_AMBIGUOUS");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.douyin_material_notes/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.douyin_material_note_versions/i);
  });

  test("restores published state and writes an audit command event", async () => {
    const sql = await migrationFile.text();

    expect(sql).toMatch(/SET status = 'published'/);
    expect(sql).toContain("ON CONFLICT (tenant_id, idempotency_key) DO NOTHING");
    expect(sql).toContain("INSERT INTO public.douyin_material_note_command_events");
    expect(sql).toContain("'publish'");
    expect(sql).toContain("dev_restore_withdrawn_material_note");
  });
});
