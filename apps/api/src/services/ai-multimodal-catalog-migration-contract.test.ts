import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";

const migrationsDirectory = new URL(
  "../../../../supabase/migrations/",
  import.meta.url,
);
const baseRoutingMigration = new URL(
  "20260509183000_create_ai_provider_routing.sql",
  migrationsDirectory,
);
const multimodalMigration = new URL(
  "20260901100000_extend_ai_multimodal_catalog.sql",
  migrationsDirectory,
);

function compact(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function functionDefinition(source: string, name: string): string {
  return compact(
    source.match(
      new RegExp(
        `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$function\\$;`,
      ),
    )?.[0] ?? "",
  );
}

describe("AI multimodal catalog migration", () => {
  test("does not rewrite the historical AI provider routing migration", async () => {
    const source = await Bun.file(baseRoutingMigration).text();
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "25fdb19adb13dab4d79537cda73566c15b6f3aa7dde5e669110c889bf3d0225a",
    );
  });

  test("extends provider, model and scene route tables without unsafe rewrites", async () => {
    const source = await Bun.file(multimodalMigration).text();
    const sql = compact(source);
    expect(source.startsWith("-- Rollback: forward-only.")).toBe(true);
    expect(sql).toMatch(/^begin; set local lock_timeout = '5s';/);
    expect(sql).toMatch(/commit;$/);
    expect(sql).toContain("drop constraint if exists ai_providers_type_check");
    expect(sql).toContain("provider_type = any (array['openai_compatible'::text, 'openrouter'::text])");
    expect(sql).toContain("alter table public.ai_providers add column if not exists version integer not null default 1");
    expect(sql).toContain("add column if not exists modality text not null default 'text'");
    expect(sql).toContain("modality = any (array['text'::text, 'image'::text, 'video'::text, 'speech'::text])");
    expect(sql).toContain("add column if not exists input_modalities jsonb not null default '[\"text\"]'::jsonb");
    expect(sql).toContain("add column if not exists capability_payload jsonb not null default '{}'::jsonb");
    expect(sql).toContain("add column if not exists catalog_managed boolean not null default false");
    expect(sql).toContain("jsonb_typeof(capability_payload) = 'object'");
    expect(sql).toContain("probe_status = any (array['unverified'::text, 'eligible'::text, 'ineligible'::text, 'stale'::text])");
    expect(sql).toContain("drop index if exists public.uniq_ai_scene_routes_scene");
    expect(sql).toContain("create unique index if not exists uniq_ai_scene_routes_scene_quality");
    expect(sql).toContain("on public.ai_scene_routes(scene_code, quality_tier)");
    expect(sql).toContain("max_cost_usd > 0 and confirmation_threshold_usd >= 0");
    expect(sql).toContain("cost_guard_status = any (array['active'::text, 'paused_overrun'::text])");
    expect(sql).not.toMatch(/drop table public\.ai_/);
  });

  test("creates bounded catalog run, entry and append-only price snapshot tables", async () => {
    const source = await Bun.file(multimodalMigration).text();
    const sql = compact(source);
    expect(sql).toContain("create table if not exists public.ai_model_catalog_sync_runs");
    expect(sql).toContain("create table if not exists public.ai_model_catalog_entries");
    expect(sql).toContain("create table if not exists public.ai_model_price_snapshots");
    expect(sql).toContain("currency text not null default 'usd'");
    expect(sql).toContain("numeric(24, 12)");
    expect(sql).toContain("raw_price_projection jsonb not null");
    expect(sql).toContain("catalog_hash text not null");
    expect(sql).toContain("current_model_version integer null");
    expect(sql).toContain("constraint ai_model_catalog_entries_current_model_version_check");
    expect(sql).toContain("current_model_version is not null and current_model_version >= 1");
    expect(sql).toMatch(
      /constraint ai_model_catalog_entries_run_position_check check \(\s*entry_position >= 1 and entry_position <= 10000\s*\)/,
    );
    expect(sql).toMatch(
      /constraint ai_model_catalog_entries_change_type_check check \(\s*change_type = any \(array\['new'::text, 'changed'::text, 'removed'::text, 'unchanged'::text\]\)\s*\)/,
    );
    expect(sql).toContain("raise exception using errcode = 'p0001', message = 'ai_model_price_snapshots_append_only'");
    expect(sql).toContain("create trigger tr_ai_model_price_snapshots_append_only");
    expect(sql).toContain("raise exception using errcode = 'p0001', message = 'ai_model_catalog_entries_update_forbidden'");
  });

  test("defines service-role-only atomic catalog apply and capability override RPCs", async () => {
    const source = await Bun.file(multimodalMigration).text();
    for (const name of [
      "save_openrouter_model_catalog_preview",
      "apply_openrouter_model_catalog",
      "save_ai_model_capability_override",
    ]) {
      const fn = functionDefinition(source, name);
      expect(fn).toContain("returns jsonb language plpgsql security definer");
      expect(fn).toContain("set search_path = pg_catalog, public");
      expect(fn).toContain("'data',");
      expect(fn).toContain("public.ai_catalog_error(");
      expect(source).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated;`,
      ));
      expect(source).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?TO service_role;`,
      ));
    }
    expect(functionDefinition(source, "ai_catalog_error")).toContain("'error',");
    const preview = functionDefinition(source, "save_openrouter_model_catalog_preview");
    expect(preview).toContain("jsonb_array_length(p_entries) > 10000");
    expect(preview).toContain("provider.provider_type = 'openrouter'");
    expect(preview).toContain("jsonb_object_keys(raw.value)");
    expect(preview).toContain("insert into public.ai_model_catalog_sync_runs");
    expect(preview).toContain("insert into public.ai_model_catalog_entries");
    expect(preview).toContain("current_model.version");
    expect(preview).toContain("current_model.model_name = btrim(raw.value ->> 'external_model_id')");
    expect(preview).toContain("current_model.catalog_managed is true");
    const apply = functionDefinition(source, "apply_openrouter_model_catalog");
    expect(apply).toContain("jsonb_array_length(p_entry_ids) > 100");
    expect(apply).toContain("value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'");
    expect(apply).toContain("v_run.run_status <> 'preview'");
    expect(apply).toContain("v_selected_count <> v_count");
    expect(apply).toMatch(/v_selected_count <> v_count[\s\S]*?ai_model_catalog_entry_not_found[\s\S]*?for v_entry in/);
    expect(apply).toContain("for update of current_model");
    expect(apply).toContain("current_model.version <> entry.current_model_version");
    expect(apply).toContain("for update of conflict_model");
    expect(apply).toContain("conflict_model.code = entry.model_code");
    expect(apply).toContain("ai_model_catalog_model_stale");
    expect(apply).toContain("ai_model_catalog_code_conflict");
    expect(apply).toContain("and version = v_entry.current_model_version");
    expect(apply).toContain("catalog_managed = true");
    expect(apply).toContain("when unique_violation then");
    expect(apply).toContain("get stacked diagnostics v_constraint_name = constraint_name");
    expect(apply).toContain("provider.provider_type = 'openrouter'");
    expect(apply).toContain("entry.catalog_hash = p_expected_catalog_hash");
    expect(apply).toContain("for update");
    const override = functionDefinition(source, "save_ai_model_capability_override");
    expect(override).toContain("v_model.version <> p_expected_version");
    expect(override).toContain("capability_payload = p_capability_payload");
    expect(override).toContain("version = version + 1");
  });

  test("locks RLS, ACL and query indexes for the new catalog surfaces", async () => {
    const source = await Bun.file(multimodalMigration).text();
    const sql = compact(source);
    for (const table of [
      "ai_model_catalog_sync_runs",
      "ai_model_catalog_entries",
      "ai_model_price_snapshots",
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`alter table public.${table} force row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated, service_role`);
      expect(sql).toContain(`grant select on table public.${table} to service_role`);
    }
    expect(sql).toContain("create index if not exists ai_models_provider_status_idx on public.ai_models(provider_id, status, modality, sort_order, id)");
    expect(sql).toContain("create unique index if not exists uniq_ai_models_catalog_managed_provider_model_name on public.ai_models(provider_id, model_name) where catalog_managed");
    expect(sql).toContain("create index if not exists ai_scene_routes_scene_tier_idx on public.ai_scene_routes(scene_code, quality_tier, status)");
    expect(sql).toContain("create index if not exists ai_model_catalog_entries_run_position_idx");
    expect(sql).toContain("create index if not exists ai_model_price_snapshots_model_valid_idx");
    expect(source).not.toMatch(/GRANT EXECUTE[\s\S]*?TO (?:PUBLIC|anon|authenticated)/);
  });
});
