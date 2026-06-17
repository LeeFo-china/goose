import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../../../supabase/migrations/20260617190000_decoration_workflow_business_templates.sql",
);

describe("decoration workflow business template migration", () => {
  test("creates and republishes three business workflow templates", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("project_signing");
    expect(migration).toContain("customer_main");
    expect(migration).toContain("construction_main");
    expect(migration).toContain("replace_workflow_draft_graph");
    expect(migration).toContain("publish_workflow_definition");
    expect(migration).toContain("p_expected_updated_at");
    expect(migration).toContain("DROP TABLE IF EXISTS pg_temp.tmp_workflow_draft_nodes");
    expect(migration).toContain("definition.status <> 'active'");
    expect(migration).toContain("payment_stage_2");
    expect(migration).toContain("final_acceptance");
  });

  test("does not delete or rewrite running workflow instances", () => {
    const migration = readFileSync(migrationPath, "utf8").toLowerCase();

    expect(migration).not.toContain("delete from public.workflow_instances");
    expect(migration).not.toContain("update public.workflow_instances");
    expect(migration).not.toContain("delete from public.workflow_tasks");
    expect(migration).not.toContain("update public.workflow_tasks");
  });
});
