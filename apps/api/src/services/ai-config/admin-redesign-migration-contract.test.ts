import { describe, expect, test } from "bun:test";

const migration = new URL(
  "../../../../../supabase/migrations/20260912100000_rework_ai_model_routing_admin.sql",
  import.meta.url,
);

describe("AI model routing admin redesign migration", () => {
  test("protects model modality with immediate composite foreign keys and preserves nullable bindings", async () => {
    const sql = (await Bun.file(migration).text()).replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").toLowerCase();
    expect(sql).toContain("add constraint ai_models_id_modality_key unique (id, modality) not deferrable");
    for (const slot of ["primary", "fallback"]) {
      expect(sql).toContain(`add constraint ai_scene_routes_${slot}_model_modality_fkey foreign key (${slot}_model_id, modality) references public.ai_models(id, modality) match simple on update restrict on delete set null (${slot}_model_id) not deferrable`);
      expect(sql).toContain(`on public.ai_scene_routes(${slot}_model_id)`);
    }
    expect(sql).toContain("message = 'ai_route_model_modality_mismatch'");
    expect(sql).toContain("primary_model.modality is distinct from route.modality");
    expect(sql).toContain("fallback_model.modality is distinct from route.modality");
    expect(sql).toMatch(/select route\.id[\s\S]+limit 1; if found then/);
    expect(sql.indexOf("message = 'ai_route_model_modality_mismatch'")).toBeLessThan(sql.indexOf("add constraint ai_models_id_modality_key"));
    expect(sql).not.toContain("ai_scene_route_model_modality_guard()");
    expect(sql).not.toContain("ai_model_modality_route_guard()");
  });
  test("grants only scene name and status updates to the service role", async () => {
    const sql = (await Bun.file(migration).text())
      .replace(/--[^\n]*/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase();
    const sceneGrants = sql.match(/grant\s+[^;]*\bon\s+(?:table\s+)?public\.ai_system_scenes\s+to\s+[^;]+;/g);

    expect(sceneGrants).toEqual([
      "grant update (name, status) on table public.ai_system_scenes to service_role;",
    ]);
  });

  test("supports custom scenes while preserving immutable configuration codes", async () => {
    expect(await Bun.file(migration).exists()).toBe(true);
    const sql = (await Bun.file(migration).text()).replace(/\s+/g, " ").toLowerCase();

    expect(sql).toContain("source = any (array['system'::text, 'custom'::text, 'legacy'::text])");
    expect(sql).toContain("requirements_source = any (array['runtime'::text, 'planned_adapter'::text, 'admin'::text])");
    expect(sql).toContain("unique (provider_id, model_name, modality)");
    expect(sql).toContain("ai_config_code_immutable");
    expect(sql).toContain("create_ai_custom_scene_route");
    expect(sql).toContain("delete_ai_custom_scene");
    expect(sql).toContain("v_model_code := 'mdl_' || replace(gen_random_uuid()::text, '-', '')");
    expect(sql).not.toContain("code = v_entry.model_code");
    for (const signature of [
      "create_ai_custom_scene_route(text, text, text, text, uuid, uuid, numeric, text, integer, text)",
      "delete_ai_custom_scene(text, integer)",
      "apply_openrouter_model_catalog(uuid, jsonb, text)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role`);
    }
  });
});
