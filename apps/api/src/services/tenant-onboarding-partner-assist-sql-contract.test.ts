import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repositorySource = readFileSync(
  join(import.meta.dir, "../repositories/tenant-onboarding-partner-assist.ts"),
  "utf8",
);
const migrationSql = readFileSync(
  join(
    import.meta.dir,
    "../../../../supabase/migrations/20260714223000_atomic_tenant_onboarding_partner_assist.sql",
  ),
  "utf8",
);

describe("tenant onboarding partner assist SQL contracts", () => {
  test("scopes list and detail before execution and selects no sensitive fields", () => {
    expect(repositorySource).toMatch(
      /listPartnerAssistTasks[\s\S]*?\.select\(PARTNER_ASSIST_SELECT[\s\S]*?\.eq\("candidate_partner_id", input\.partnerId\)[\s\S]*?\.neq\("partner_assist_status", "not_applicable"\)[\s\S]*?\.or\(`partner_assist_status\.neq\.pending,partner_assist_due_at\.gt\.\$\{input\.cutoff\}`\)[\s\S]*?\.range\(/,
    );
    expect(repositorySource).toMatch(
      /findPartnerAssistTask[\s\S]*?\.select\(PARTNER_ASSIST_SELECT\)[\s\S]*?\.eq\("candidate_partner_id", input\.partnerId\)[\s\S]*?\.neq\("partner_assist_status", "not_applicable"\)[\s\S]*?\.or\(`partner_assist_status\.neq\.pending,partner_assist_due_at\.gt\.\$\{input\.cutoff\}`\)[\s\S]*?\.eq\("id", input\.applicationId\)[\s\S]*?\.maybeSingle\(/,
    );
    const select = repositorySource.match(
      /const PARTNER_ASSIST_SELECT = \[([\s\S]*?)\]\.join/,
    )?.[1] ?? "";
    for (const forbidden of [
      "business_license_file_id",
      "unified_social_credit_code",
      "address_latitude",
      "address_longitude",
      "privacy_policy_version",
      "onboarding_terms_version",
      "consented_at",
      '"address"',
    ]) {
      expect(select).not.toContain(forbidden);
    }
  });

  test("atomically decides only pending non-terminal tasks for the token partner", () => {
    expect(migrationSql).toContain(
      "CREATE OR REPLACE FUNCTION public.submit_tenant_onboarding_partner_assist",
    );
    expect(migrationSql).toMatch(
      /WHERE application\.id = p_application_id\s+AND application\.candidate_partner_id = p_partner_id\s+FOR UPDATE/,
    );
    expect(migrationSql).toMatch(
      /WHERE application\.id = p_application_id[\s\S]*?FOR UPDATE;[\s\S]*?FROM public\.platform_partners AS partner[\s\S]*?FOR SHARE;[\s\S]*?FROM public\.platform_partner_members AS member[\s\S]*?FOR SHARE;/,
    );
    expect(migrationSql).toContain(
      "p_decision NOT IN ('verified', 'supplement_suggested', 'not_recommended')",
    );
    expect(migrationSql).toContain("OR p_decision IS NULL");
    expect(migrationSql).toMatch(
      /UPDATE public\.tenant_onboarding_applications AS application\s+SET\s+partner_assist_status = p_decision,\s+version = application\.version \+ 1,\s+updated_at = p_now/,
    );
    expect(migrationSql).toMatch(
      /WHERE application\.id = v_application\.id\s+AND application\.candidate_partner_id = p_partner_id\s+AND application\.partner_assist_status = 'pending'\s+AND application\.status IN \(\s*'submitted',\s*'reviewing',\s*'supplement_required'\s*\)\s+AND application\.partner_assist_due_at > p_now\s+AND application\.version = p_expected_version/,
    );
    expect(migrationSql).toMatch(
      /INSERT INTO public\.tenant_onboarding_application_reviews[\s\S]*?VALUES \(\s*v_application\.id,\s*'partner_assist',\s*p_decision,\s*'partner_member',\s*p_partner_member_id,[\s\S]*?v_application\.status,\s*v_application\.status,\s*'pending',\s*p_decision/,
    );
    const submitFunction = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.submit_tenant_onboarding_partner_assist[\s\S]*?\$\$;/,
    )?.[0] ?? "";
    expect(submitFunction.match(/'version', v_after\.version/g)).toHaveLength(1);
  });

  test("keeps expiry bounded, idempotent, non-terminal, and append-only", () => {
    expect(migrationSql).toContain(
      "CREATE OR REPLACE FUNCTION public.expire_tenant_onboarding_partner_assists",
    );
    expect(migrationSql).toMatch(
      /ORDER BY applications\.partner_assist_due_at ASC, applications\.id ASC\s+LIMIT 100\s+FOR UPDATE SKIP LOCKED/,
    );
    expect(migrationSql).toMatch(
      /partner_assist_status = 'pending'[\s\S]*?status IN \(\s*'submitted',\s*'reviewing',\s*'supplement_required'\s*\)/,
    );
    expect(migrationSql).toMatch(
      /expired_applications\.id,\s*'partner_assist',\s*'expired',\s*'system',\s*expired_applications\.status,\s*expired_applications\.status,\s*'pending',\s*'expired'/,
    );
    expect(migrationSql).toMatch(
      /IF p_cutoff IS NULL THEN\s+RAISE EXCEPTION USING[\s\S]*?TENANT_ONBOARDING_PARTNER_ASSIST_CUTOFF_REQUIRED/,
    );
  });

  test("expires the locked task at cutoff even when it missed the cleanup batch", () => {
    const submitFunction = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.submit_tenant_onboarding_partner_assist[\s\S]*?\$\$;/,
    )?.[0] ?? "";
    expect(submitFunction).toMatch(
      /IF v_application\.partner_assist_due_at <= p_now THEN[\s\S]*?partner_assist_status = 'expired'[\s\S]*?INSERT INTO public\.tenant_onboarding_application_reviews[\s\S]*?'partner_assist',[\s\S]*?'expired',[\s\S]*?'system',[\s\S]*?'pending',[\s\S]*?'expired'[\s\S]*?RETURN pg_catalog\.jsonb_build_object\('status', 'state_conflict'\)/,
    );
  });

  test("restricts both mutation functions to service role", () => {
    for (const functionName of [
      "submit_tenant_onboarding_partner_assist",
      "expire_tenant_onboarding_partner_assists",
    ]) {
      expect(migrationSql).toContain(`REVOKE ALL ON FUNCTION public.${functionName}`);
      expect(migrationSql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${functionName}\\([\\s\\S]*?TO service_role;`),
      );
    }
  });
});
