import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../../supabase/migrations/20260820101000_align_douyin_project_profile_relationship.sql",
  import.meta.url,
);

describe("Douyin public project profile cardinality migration", () => {
  test("replaces the tenant/project index and aligns the one-to-one foreign key", () => {
    expect(existsSync(migrationUrl)).toBe(true);

    const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    expect(normalizedSql).toContain(
      "DROP INDEX public.projects_tenant_id_id_idx",
    );
    expect(normalizedSql).toContain(
      "ALTER TABLE public.projects ADD CONSTRAINT projects_tenant_id_id_key UNIQUE (tenant_id, id)",
    );
    expect(normalizedSql).toContain(
      "ALTER TABLE public.douyin_project_public_profiles DROP CONSTRAINT douyin_project_public_profiles_project_tenant_fkey",
    );
    expect(normalizedSql).toContain(
      "ADD CONSTRAINT douyin_project_public_profiles_project_tenant_fkey FOREIGN KEY (tenant_id, project_id) REFERENCES public.projects(tenant_id, id) ON DELETE CASCADE",
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
