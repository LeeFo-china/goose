import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = new URL(
  "../../../../supabase/migrations/20260919120000_platform_admin_mobile_review_workbench.sql",
  import.meta.url,
);

function sql() {
  return readFileSync(migration, "utf8");
}

function commandBody(source: string) {
  return source.match(
    /CREATE OR REPLACE FUNCTION public\.review_platform_partner_application\([\s\S]*?\$\$;/,
  )?.[0] ?? "";
}

describe("platform admin mobile review migration", () => {
  test("adds partner application versions, complete statuses, reviews and queue indexes", () => {
    const source = sql();
    expect(source).toContain("ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1");
    for (const status of [
      "submitted", "reviewing", "supplement_required", "approved", "rejected", "withdrawn",
    ]) expect(source).toContain(`'${status}'`);
    expect(source).toContain("CREATE TABLE IF NOT EXISTS public.platform_partner_application_reviews");
    expect(source).toContain("UNIQUE (actor_employee_id, idempotency_key)");
    expect(source).toContain("platform_partner_applications_status_updated_idx");
    expect(source).toContain("platform_partner_application_reviews_target_created_idx");
  });

  test("handles idempotency before version and terminal-state checks", () => {
    const body = commandBody(sql());
    expect(body).toContain("pg_advisory_xact_lock");
    expect(body).toContain("request_hash");
    const replay = body.indexOf("FROM public.platform_partner_application_reviews AS review");
    const lock = body.indexOf("FOR UPDATE;");
    const version = body.indexOf("'version_conflict'");
    const terminal = body.indexOf("'already_reviewed'");
    expect(replay).toBeGreaterThan(0);
    expect(lock).toBeGreaterThan(replay);
    expect(version).toBeGreaterThan(lock);
    expect(terminal).toBeGreaterThan(version);
    expect(body).toContain("'idempotency_conflict'");
    expect(body).toContain("'idempotent', true");
  });

  test("keeps approval conversion and review evidence in one transaction", () => {
    const body = commandBody(sql());
    expect(body).toContain("INSERT INTO public.platform_partners");
    expect(body).toContain("INSERT INTO public.platform_partner_members");
    expect(body).toContain("INSERT INTO public.platform_partner_invite_codes");
    expect(body).toContain("UPDATE public.platform_partner_applications AS application");
    expect(body).toContain("version = application.version + 1");
    expect(body).toContain("INSERT INTO public.platform_partner_application_reviews");
    expect(body).toContain("p_action = 'request_supplement'");
    expect(body).toContain("p_action = 'reject'");
  });

  test("is callable only by the service role", () => {
    const source = sql();
    expect(source).toContain("SECURITY DEFINER");
    expect(source).toContain("SET search_path = pg_catalog, public, auth");
    expect(source).toContain("REVOKE ALL ON FUNCTION public.review_platform_partner_application");
    expect(source).toMatch(/GRANT EXECUTE ON FUNCTION public\.review_platform_partner_application[\s\S]*? TO service_role;/);
  });
});
