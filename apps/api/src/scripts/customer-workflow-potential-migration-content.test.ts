import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../../../supabase/migrations/20260617173000_add_customer_potential_workflow_node.sql",
);

describe("customer workflow potential node migration", () => {
  test("patches only customer_main workflows missing the potential node", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("definition.workflow_key = 'customer_main'");
    expect(migration).toContain("node->>'node_key' = 'potential'");
    expect(migration).toContain("node->>'node_key' = 'following'");
    expect(migration).toContain("jsonb_set(definition_record.snapshot, '{nodes}'");
    expect(migration).toContain("'{edges}'");
    expect(migration).toContain("INSERT INTO public.workflow_versions");
    expect(migration).toContain("SET active_version_id = v_new_version_id");
    expect(migration).toContain("INSERT INTO public.workflow_nodes");
    expect(migration).toContain("INSERT INTO public.workflow_edges");
  });
});
