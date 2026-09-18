import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDirectory = join(import.meta.dir, "../../../../supabase/migrations");

function migrationSql() {
  const files = readdirSync(migrationsDirectory).filter((file) =>
    file.endsWith("_tenant_onboarding_share_attribution.sql")
  );
  expect(files).toHaveLength(1);
  const file = files[0];
  return file ? readFileSync(join(migrationsDirectory, file), "utf8") : "";
}

describe("tenant onboarding share attribution migration", () => {
  test("creates a private indexed share-link model", () => {
    const sql = migrationSql();

    expect(sql).toContain("CREATE TABLE public.tenant_onboarding_share_links");
    expect(sql).toContain("sharer_user_id uuid NOT NULL REFERENCES auth.users(id)");
    expect(sql).toContain("sharer_employee_id uuid NOT NULL REFERENCES public.employees(id)");
    expect(sql).toContain("UNIQUE (sharer_user_id, idempotency_key)");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON TABLE public.tenant_onboarding_share_links FROM anon, authenticated");
    expect(sql).toContain("tenant_onboarding_share_links_sharer_created_idx");
    expect(sql).toContain("tenant_onboarding_share_links_token_active_idx");
  });

  test("adds indexed server-derived attribution columns to applications", () => {
    const sql = migrationSql();

    for (const column of [
      "share_link_id",
      "referred_by_user_id",
      "referred_by_openid",
      "referred_by_employee_id",
      "referral_source",
    ]) {
      expect(sql).toContain(`ADD COLUMN ${column}`);
    }
    expect(sql).toContain("tenant_onboarding_applications_share_link_created_idx");
    expect(sql).toContain("tenant_onboarding_applications_share_link_status_idx");
  });

  test("records valid opens atomically and degrades invalid tokens", () => {
    const sql = migrationSql();
    const openFunction = sql.match(
      /CREATE OR REPLACE FUNCTION public\.record_tenant_onboarding_share_open\([\s\S]*?\$\$;/,
    )?.[0] ?? "";

    expect(openFunction).not.toBe("");
    expect(openFunction).toContain("status = 'active'");
    expect(openFunction).toContain("expires_at > p_now");
    expect(openFunction).toContain("view_count = share_link.view_count + 1");
    expect(openFunction).toContain("RETURN QUERY SELECT false");
  });

  test("creates or reuses a share link atomically by idempotency key", () => {
    const sql = migrationSql();
    const createFunction = sql.match(
      /CREATE OR REPLACE FUNCTION public\.create_tenant_onboarding_share_link\([\s\S]*?\$\$;/,
    )?.[0] ?? "";

    expect(createFunction).not.toBe("");
    expect(createFunction).toContain("ON CONFLICT (sharer_user_id, idempotency_key) DO NOTHING");
    expect(createFunction).toContain("WHERE share_link.sharer_user_id = p_sharer_user_id");
    expect(createFunction).toContain("share_link.idempotency_key = p_idempotency_key");
  });

  test("derives attribution and submission count inside the existing submit transaction", () => {
    const sql = migrationSql();
    const submitFunction = sql.match(
      /CREATE OR REPLACE FUNCTION public\.submit_tenant_onboarding_application\([\s\S]*?\$\$;/,
    )?.[0] ?? "";

    expect(submitFunction).not.toBe("");
    expect(submitFunction).toContain("'share_token'");
    expect(submitFunction).toContain("FROM public.tenant_onboarding_share_links AS share_link");
    expect(submitFunction).toContain("FOR UPDATE");
    expect(submitFunction).toContain("referred_by_user_id");
    expect(submitFunction).toContain("'tenant_onboarding_share'");
    expect(submitFunction).toContain("submitted_count = share_link.submitted_count + 1");
  });

  test("provides one paginated statistics query with approved counts", () => {
    const sql = migrationSql();

    expect(sql).toContain("list_tenant_onboarding_share_links");
    expect(sql).toContain("p_offset integer");
    expect(sql).toContain("p_limit integer");
    expect(sql).toContain("count(*) FILTER (WHERE application.status = 'approved')");
    expect(sql).toContain("count(*) OVER () AS total_count");
  });
});
