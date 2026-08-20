import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../../supabase/migrations/20260820101000_align_douyin_project_profile_relationship.sql",
  import.meta.url,
);

function executableStatements(sql: string): string[] {
  return sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter((statement) => statement.length > 0);
}

describe("Douyin public project profile cardinality migration", () => {
  test("allows only the six statements required to align the relationship", () => {
    expect(existsSync(migrationUrl)).toBe(true);

    const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
    const statements = executableStatements(sql);
    const executableSql = statements.join("; ");

    expect(statements).toEqual([
      "BEGIN",
      "DROP INDEX public.projects_tenant_id_id_idx",
      "ALTER TABLE public.projects ADD CONSTRAINT projects_tenant_id_id_key UNIQUE (tenant_id, id)",
      "ALTER TABLE public.douyin_project_public_profiles DROP CONSTRAINT douyin_project_public_profiles_project_tenant_fkey",
      "ALTER TABLE public.douyin_project_public_profiles ADD CONSTRAINT douyin_project_public_profiles_project_tenant_fkey FOREIGN KEY (tenant_id, project_id) REFERENCES public.projects(tenant_id, id) ON DELETE CASCADE",
      "COMMIT",
    ]);
    expect(executableSql).not.toContain(
      "DROP CONSTRAINT projects_id_tenant_key",
    );
  });

  test("documents a forward-only, dependency-aware rollback without deleting data", () => {
    const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

    expect(sql).toContain("Forward rollback procedure:");
    expect(sql).toContain("confirm that no dependent objects or new clients");
    expect(sql).toContain("FOREIGN KEY (project_id, tenant_id)");
    expect(sql).toContain("REFERENCES public.projects(id, tenant_id)");
    expect(sql).toContain("DROP CONSTRAINT projects_tenant_id_id_key");
    expect(sql).toContain("CREATE INDEX projects_tenant_id_id_idx");
    expect(sql).toContain("COMMENT ON INDEX public.projects_tenant_id_id_idx");
    expect(sql).toContain("does not modify or delete table data");
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
