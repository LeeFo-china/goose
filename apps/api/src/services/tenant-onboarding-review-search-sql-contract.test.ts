import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migration = new URL(
  "../../../../supabase/migrations/20260714222000_add_tenant_onboarding_review_search_indexes.sql",
  import.meta.url,
);
const repository = new URL(
  "../repositories/tenant-onboarding-review.ts",
  import.meta.url,
);

describe("tenant onboarding platform review keyword search", () => {
  test("adds pg_trgm GIN indexes for every contains-search column", () => {
    const sql = existsSync(migration) ? readFileSync(migration, "utf8") : "";
    expect(sql).toContain(
      "CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions",
    );
    for (const column of [
      "application_no", "company_name", "admin_phone",
      "unified_social_credit_code",
    ]) {
      expect(sql).toMatch(new RegExp(
        `USING gin\\s*\\(\\s*${column} extensions\\.gin_trgm_ops\\s*\\)`,
      ));
    }
  });

  test("keeps the four-field contains API backed by exact count", () => {
    const source = readFileSync(repository, "utf8");
    expect(source).toContain('.select(LIST_SELECT, { count: "exact" })');
    for (const column of [
      "application_no", "company_name", "admin_phone",
      "unified_social_credit_code",
    ]) expect(source).toContain(`${column}.ilike.%\${keyword}%`);
  });
});
