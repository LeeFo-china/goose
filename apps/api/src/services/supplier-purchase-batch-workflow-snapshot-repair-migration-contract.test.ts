import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260902202000_repair_supplier_purchase_batch_workflow_snapshot.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
const assigneeMigrationUrl = new URL(
  "../../../../supabase/migrations/20260902203000_repair_supplier_purchase_batch_workflow_assignee_scope.sql",
  import.meta.url,
);
const assigneeSql = existsSync(assigneeMigrationUrl)
  ? readFileSync(assigneeMigrationUrl, "utf8")
  : "";

function stripLineComments(value: string): string {
  return value
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

describe("supplier purchase batch workflow snapshot repair migration", () => {
  test("exists as a bounded forward-fix migration", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    const normalized = compact(stripLineComments(sql));
    expect(normalized).toMatch(/^BEGIN;/);
    expect(normalized).toContain("SET LOCAL lock_timeout = '5s';");
    expect(normalized).toContain("SET LOCAL statement_timeout = '5min';");
    expect(normalized).toMatch(/COMMIT;$/);
    expect(sql).toMatch(/Rollback: forward-fix/i);
  });

  test("repairs only published supplier purchase batch workflow snapshots", () => {
    const normalized = compact(sql);
    expect(normalized).toContain("UPDATE public.workflow_versions AS version");
    expect(normalized).toContain("jsonb_set(");
    expect(normalized).toContain("'{subject_type}'");
    expect(normalized).toContain("to_jsonb('supplier_purchase_batch'::text)");
    expect(normalized).toContain("FROM public.workflow_definitions AS definition");
    expect(normalized).toContain(
      "definition.workflow_key = 'supplier_purchase_batch_approval'",
    );
    expect(normalized).toContain("version.status = 'published'");
    expect(normalized).toContain(
      "version.snapshot->>'workflow_key' = 'supplier_purchase_batch_approval'",
    );
    expect(normalized).toContain(
      "version.snapshot->>'subject_type' IS DISTINCT FROM 'supplier_purchase_batch'",
    );
    expect(normalized).not.toMatch(
      /UPDATE public\.tenant_supplier_settings[\s\S]*purchase_batch_workflow_enabled/i,
    );
    expect(normalized).not.toMatch(/DELETE FROM public\.workflow_/i);
  });
});

describe("supplier purchase batch workflow assignee scope repair migration", () => {
  test("exists as a bounded forward-fix migration", () => {
    expect(existsSync(assigneeMigrationUrl)).toBe(true);
    const normalized = compact(stripLineComments(assigneeSql));
    expect(normalized).toMatch(/^BEGIN;/);
    expect(normalized).toContain("SET LOCAL lock_timeout = '5s';");
    expect(normalized).toContain("SET LOCAL statement_timeout = '5min';");
    expect(normalized).toMatch(/COMMIT;$/);
    expect(assigneeSql).toMatch(/Rollback: forward-fix/i);
  });

  test("removes only legacy system_admin role pinning from purchase batch approval nodes", () => {
    const normalized = compact(assigneeSql);
    expect(normalized).toContain("UPDATE public.workflow_nodes AS node");
    expect(normalized).toContain("node.config - 'assignee_id'");
    expect(normalized).toContain("node.node_type = 'approval'");
    expect(normalized).toContain(
      "definition.workflow_key = 'supplier_purchase_batch_approval'",
    );
    expect(normalized).toContain(
      "node.config->>'assignee_id' = 'system_admin'",
    );
    expect(normalized).toContain(
      "node.config->>'assignee_permission_code' IN",
    );
    expect(normalized).toContain("UPDATE public.workflow_versions AS version");
    expect(normalized).toContain("jsonb_agg(");
    expect(normalized).toMatch(
      /node - 'config' \|\| (?:pg_catalog\.)?jsonb_build_object/,
    );
    expect(normalized).toContain(
      "(node->'config')->>'assignee_id' = 'system_admin'",
    );
    expect(normalized).not.toMatch(
      /UPDATE public\.tenant_supplier_settings[\s\S]*purchase_batch_workflow_enabled/i,
    );
    expect(normalized).not.toMatch(/DELETE FROM public\.workflow_/i);
  });
});
