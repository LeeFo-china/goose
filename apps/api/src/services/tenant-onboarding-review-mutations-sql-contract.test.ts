import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = new URL(
  "../../../../supabase/migrations/20260714221000_atomic_tenant_onboarding_platform_review_mutations.sql",
  import.meta.url,
);

function sql() {
  return readFileSync(migration, "utf8");
}

function functionBody(source: string) {
  return source.match(
    /CREATE OR REPLACE FUNCTION public\.mutate_tenant_onboarding_platform_review\([\s\S]*?\$\$;/,
  )?.[0] ?? "";
}

describe("tenant onboarding platform review mutations", () => {
  test("indexes the platform region-array filter", () => {
    expect(sql()).toContain(
      "tenant_onboarding_applications_service_regions_gin_idx",
    );
    expect(sql()).toContain(
      "ON public.tenant_onboarding_applications USING gin(service_region_codes)",
    );
  });

  test("keeps application mutation and append-only review in one RPC", () => {
    const body = functionBody(sql());
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path = pg_catalog, public, auth");
    expect(body).toMatch(
      /WHERE application\.id = p_application_id\s+FOR UPDATE;/,
    );
    for (const action of [
      "start_review",
      "request_supplement",
      "request_partner_assist",
      "reject",
    ]) expect(body).toContain(`'${action}'`);
    expect(body).toContain("UPDATE public.tenant_onboarding_applications");
    expect(body).toContain("INSERT INTO public.tenant_onboarding_application_reviews");
    expect(body).toContain("version = application.version + 1");
    const projections = [...body.matchAll(
      /'application', pg_catalog\.jsonb_build_object\(([\s\S]*?)\)\s*,\s*'idempotent'/g,
    )].map((match) => match[1] ?? "");
    expect(projections).toHaveLength(1);
    for (const projection of projections) {
      for (const field of [
        "application_no", "company_name", "business_license_file_id",
        "admin_phone", "service_region_codes", "candidate_snapshot",
        "status", "partner_assist_status", "version",
      ]) expect(projection).toContain(`'${field}'`);
      for (const forbidden of [
        "visitor_id", "visitor_context_id", "idempotency_key", "object_key",
        "public_url",
      ]) expect(projection).not.toContain(`'${forbidden}'`);
    }
    expect(body).toContain("v_after := v_application");
    expect(body).toContain("'idempotent', v_idempotent");
    expect(body).not.toContain("pg_catalog.to_jsonb(v_after)");
  });

  test("revalidates assist eligibility and preserves non-blocking attribution", () => {
    const body = functionBody(sql());
    expect(body).toContain("public.resolve_tenant_onboarding_region_paths");
    expect(body).toContain("partner.status = 'active'");
    expect(body).toContain("p_partner_id");
    expect(body).toContain("p_now + interval '48 hours'");
    expect(body).not.toMatch(/final_partner_id\s*=/);
    expect(body).not.toMatch(/attribution_source_type\s*=/);
    expect(body).toContain(
      "LOCK TABLE public.platform_partner_invite_codes IN SHARE MODE",
    );
    expect(body).toContain("fresh_region_partner_scores AS");
    expect(body).toContain("fresh_best_region_partners AS");
    expect(body).toContain("v_fresh_invite_partner_id");
    expect(body).toContain("p_partner_id = ANY (v_fresh_eligible_partner_ids)");
  });

  test("records before and after versions in every platform review event", () => {
    const body = functionBody(sql());
    expect(body).toContain("'before_version', v_application.version");
    expect(body).toContain("'after_version', v_after.version");
  });

  test("expires pending assist on rejection and keeps start-review idempotent", () => {
    const body = functionBody(sql());
    expect(body).toMatch(
      /v_application\.status = 'reviewing'[\s\S]*?v_application\.version = p_expected_version[\s\S]*?'idempotent'/,
    );
    expect(body).toMatch(
      /p_action = 'reject'[\s\S]*?partner_assist_status = CASE[\s\S]*?'expired'/,
    );
    expect(body).toContain("NULLIF(pg_catalog.btrim(COALESCE(p_remark, '')), '')");
  });

  test("grants execution only to service role", () => {
    const source = sql();
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(source).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.mutate_tenant_onboarding_platform_review[\\s\\S]*? FROM ${role};`,
      ));
    }
    expect(source).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.mutate_tenant_onboarding_platform_review[\s\S]*? TO service_role;/,
    );
  });
});
