import { describe, expect, test } from "bun:test";

const migrationsDirectory = new URL(
  "../../../../../supabase/migrations/",
  import.meta.url,
);
const classificationMigration = new URL(
  "20260904110000_extend_openrouter_catalog_classification.sql",
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

describe("OpenRouter catalog classification migration", () => {
  test("adds modality-scoped identity and apply eligibility controls", async () => {
    const source = await Bun.file(classificationMigration).text();
    const sql = compact(source);

    expect(sql).toMatch(/^begin; set local lock_timeout = '5s';/);
    expect(sql).toMatch(/commit;$/);
    expect(sql).toContain("apply_status text not null default 'eligible'");
    expect(sql).toContain("apply_block_code text null");
    expect(sql).toContain("unique (run_id, external_model_id, modality)");
    expect(sql).toContain("on public.ai_models(provider_id, model_name, modality)");
    expect(sql).toContain(
      "on public.ai_model_catalog_entries(run_id, modality, change_type, entry_position)",
    );
    expect(sql).toContain("ai_model_catalog_entries_apply_status_check");
    expect(sql).toContain(
      "apply_status = any (array['eligible'::text, 'blocked'::text])",
    );
    expect(sql).toContain("ai_model_catalog_entries_apply_block_check");
    expect(sql).toContain("capability_metadata_incomplete");
  });

  test("persists preview eligibility fields and scopes current identity by modality", async () => {
    const source = await Bun.file(classificationMigration).text();
    const preview = functionDefinition(
      source,
      "save_openrouter_model_catalog_preview",
    );

    expect(preview).toContain("'apply_status'");
    expect(preview).toContain("'apply_block_code'");
    expect(preview).toContain(
      "(raw.value ->> 'apply_status') = any (array['eligible'::text, 'blocked'::text])",
    );
    expect(preview).toContain(
      "(raw.value ->> 'apply_block_code') is distinct from 'capability_metadata_incomplete'",
    );
    expect(preview).toContain("insert into public.ai_model_catalog_entries");
    expect(preview).toContain("apply_status");
    expect(preview).toContain("apply_block_code");
    expect(preview).toContain(
      "current_model.modality = raw.value ->> 'modality'",
    );
  });

  test("rejects blocked apply entries and scopes model identity by modality", async () => {
    const source = await Bun.file(classificationMigration).text();
    const apply = functionDefinition(source, "apply_openrouter_model_catalog");

    expect(apply).toContain("entry.apply_status <> 'eligible'");
    expect(apply).toContain("ai_model_catalog_entry_blocked");
    expect(apply.indexOf("entry.apply_status <> 'eligible'")).toBeLessThan(
      apply.indexOf("for v_entry in"),
    );
    expect(apply).toContain("change_type = 'removed' and entry.current_model_id is null");
    expect(apply).toContain("identity_model.modality = entry.modality");
    expect(apply).toContain("current_model.modality <> entry.modality");
    expect(apply).toContain(
      "uniq_ai_models_catalog_managed_provider_model_modality",
    );
  });

  test("does not weaken security, ACL, or audit retention", async () => {
    const source = await Bun.file(classificationMigration).text();

    expect(source).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(source).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[\s\S]*?ON\s+TABLE\s+public\.ai_model_catalog_entries[\s\S]*?TO\s+authenticated/i,
    );
    expect(source).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[\s\S]*?ON\s+TABLE\s+public\.ai_model_catalog_sync_runs[\s\S]*?TO\s+authenticated/i,
    );
    expect(source).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[\s\S]*?ON\s+TABLE\s+public\.ai_model_price_snapshots[\s\S]*?TO\s+authenticated/i,
    );
    expect(source).not.toMatch(/DELETE\s+FROM\s+public\.ai_model_catalog_entries/i);
    expect(source).not.toMatch(/TRUNCATE\s+TABLE\s+public\.ai_model_catalog_entries/i);
    expect(source).not.toMatch(/DROP\s+TABLE\s+public\.ai_model_catalog_entries/i);
    expect(source).not.toMatch(/DELETE\s+FROM\s+public\.ai_model_catalog_sync_runs/i);
    expect(source).not.toMatch(/TRUNCATE\s+TABLE\s+public\.ai_model_catalog_sync_runs/i);
    expect(source).not.toMatch(/DROP\s+TABLE\s+public\.ai_model_catalog_sync_runs/i);
    expect(source).not.toMatch(/DELETE\s+FROM\s+public\.ai_model_price_snapshots/i);
    expect(source).not.toMatch(/TRUNCATE\s+TABLE\s+public\.ai_model_price_snapshots/i);
    expect(source).not.toMatch(/DROP\s+TABLE\s+public\.ai_model_price_snapshots/i);
  });
});
