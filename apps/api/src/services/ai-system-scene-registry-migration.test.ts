import { describe, expect, test } from "bun:test";

const migration = new URL(
  "../../../../supabase/migrations/20260911151225_create_ai_system_scene_registry.sql",
  import.meta.url,
);
const fixture = new URL(
  "../../../../supabase/tests/ai_system_scene_registry_migration.sql",
  import.meta.url,
);
const conflictFixture = new URL(
  "../../../../supabase/tests/ai_system_scene_registry_conflict.sql",
  import.meta.url,
);

function compact(value: string): string {
  return value.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("AI system scene registry migration", () => {
  test("seeds the canonical ten and backfills unknown route codes without rewriting routes", async () => {
    const source = await Bun.file(migration).text();
    const sql = compact(source);
    expect(sql).toContain("create table public.ai_system_scenes");
    expect(sql).toContain("ai_system_scene_historical_modality_conflict");
    expect(sql).toContain("insert into public.ai_system_scenes");
    expect(sql).toContain("'decoration_raw_drawing', '装修生图', 'image'");
    expect(sql).toContain("'legacy'::text");
    expect(sql).toContain("from public.ai_scene_routes");
    expect(sql).not.toMatch(/update public\.ai_scene_routes|delete from public\.ai_scene_routes/);
    expect((sql.match(/'system'::text/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("enforces immutable route identity, registry references, and service-role-only reads", async () => {
    const source = await Bun.file(migration).text();
    const sql = compact(source);
    expect(sql).toContain("foreign key (scene_code, modality) references public.ai_system_scenes(code, modality)");
    expect(sql).toContain("ai_scene_route_identity_immutable");
    expect(sql).toContain("ai_system_scene_registry_immutable");
    expect(sql).toContain("alter table public.ai_system_scenes enable row level security");
    expect(sql).toContain("alter table public.ai_system_scenes force row level security");
    expect(sql).toContain("revoke all on table public.ai_system_scenes from public, anon, authenticated, service_role");
    expect(sql).toContain("grant select on table public.ai_system_scenes to service_role");
  });

  test("ships a disposable database fixture with a strict database-name guard", async () => {
    const source = await Bun.file(fixture).text();
    const conflictSource = await Bun.file(conflictFixture).text();
    expect(source).toContain("gooes_system_scenes_fixture");
    expect(source).toContain("Fixture requires an empty disposable database");
    expect(source).toContain("\\ir ../migrations/20260911151225_create_ai_system_scene_registry.sql");
    expect(source).toContain("BEGIN;");
    expect(source).toContain("ROLLBACK;");
    expect(conflictSource).toContain("historical_conflict");
    expect(conflictSource).toContain("ai_system_scene_historical_modality_conflict");
    expect(conflictSource).toContain("Conflicting modalities must prevent registry creation");
  });
});
