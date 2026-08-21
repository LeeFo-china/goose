import { describe, expect, test } from "bun:test";

const migrationPath = new URL(
  "../../../../../supabase/migrations/20260821090000_allow_stable_douyin_project_image_references.sql",
  import.meta.url,
);

const canonicalProjectImagePattern =
  "^tenants/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/project-log/projects/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{4}/(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|heic|heif)$";

function executableSql(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toLowerCase();
}

describe("stable Douyin project image reference migration", () => {
  test("replaces only the existing validator and documents forward rollback", async () => {
    const sql = await Bun.file(migrationPath).text();
    const statements = executableSql(sql);

    expect(sql).toContain("-- Forward rollback procedure:");
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.douyin_public_image_urls_are_valid(p_urls text[])",
    );
    expect(statements).not.toMatch(/\b(create|alter|drop|truncate) table\b/);
    expect(statements).not.toMatch(/\b(insert|update|delete|merge)\b/);
    expect(statements).not.toMatch(/\b(grant|revoke)\b/);
  });

  test("accepts only bounded HTTPS URLs or canonical project-log object keys", async () => {
    const sql = await Bun.file(migrationPath).text();

    expect(sql).toContain("char_length(image_reference.value) <= 2048");
    expect(sql).toContain(
      "image_reference.value ~ '^https://[^[:space:]]+$'",
    );
    expect(sql).toContain("char_length(image_reference.value) <= 1000");
    expect(sql).toContain(`image_reference.value ~ '${canonicalProjectImagePattern}'`);
    expect(sql).toContain("resolved to a fresh signed HTTPS URL at read time");
  });

  test("retains array size, null and duplicate protections", async () => {
    const sql = await Bun.file(migrationPath).text();

    expect(sql).toContain("cardinality(p_urls) <= 30");
    expect(sql).toContain("image_reference.value IS NULL");
    expect(sql).toContain("count(DISTINCT image_reference.value)");
  });
});
