import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../../../../supabase/migrations/20260828170000_repair_transferred_tenant_public_profile.sql",
);

function compactSql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("transferred tenant public profile repair migration", () => {
  test("targets only the transferred production tenant", () => {
    const sql = compactSql();

    expect(sql).toContain("3eebca47-961f-4899-b976-a3d3208d326b");
    expect(sql).toContain("固始晴天装饰工程有限公司");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("TRANSFERRED_TENANT_PUBLIC_PROFILE_PRECONDITION_FAILED");
  });

  test("restores the published profile without forging a reviewer", () => {
    const sql = compactSql();

    expect(sql).toContain("INSERT INTO public.tenant_service_provider_profiles");
    expect(sql).toContain("f806292a-c2af-4a27-bbe9-3b8517bb053f");
    expect(sql).toContain("'published'");
    expect(sql).toContain("'411525'");
    expect(sql).toContain("reviewed_by_employee_id");
    expect(sql).toMatch(/reviewed_by_employee_id[\s\S]*?NULL/);
  });

  test("restores the active service area idempotently", () => {
    const sql = compactSql();

    expect(sql).toContain("INSERT INTO public.tenant_service_areas");
    expect(sql).toContain("e2638b8a-f2f4-4bbe-a877-2cbdab6ec828");
    expect(sql).toContain("'固始县'");
    expect(sql).toContain("'active'");
    expect(sql).toContain("TRANSFERRED_TENANT_PUBLIC_PROFILE_REPAIR_FAILED");
    expect(sql).toContain("IF NOT FOUND THEN");
  });
});
