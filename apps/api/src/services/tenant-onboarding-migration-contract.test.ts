import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationSql = readFileSync(
  join(
    import.meta.dir,
    "../../../../supabase/migrations/20260714210000_create_tenant_onboarding_workflow.sql",
  ),
  "utf8",
);

describe("tenant onboarding migration contract", () => {
  test("contains the shared workflow database contracts", () => {
    const requiredContracts = [
      "CREATE TABLE IF NOT EXISTS public.tenant_onboarding_applications",
      "CREATE TABLE IF NOT EXISTS public.tenant_onboarding_application_reviews",
      "CREATE TABLE IF NOT EXISTS public.tenant_service_provider_profiles",
      "CREATE TABLE IF NOT EXISTS public.tenant_onboarding_notification_deliveries",
      "tenant_onboarding_applications_open_subject_unique_idx",
      "platform_partners_region_codes_gin_idx",
      "owner_visitor_id",
      "expire_tenant_onboarding_partner_assists",
      "'region_auto_assignment'",
      "'platform.tenant_onboarding.review'",
      "'service_provider.profile.manage'",
    ] as const;

    for (const contract of requiredContracts) {
      expect(migrationSql).toContain(contract);
    }
  });

  test("records expired partner assists in the partner-assist review stage", () => {
    const expiryFunction =
      migrationSql.match(
        /CREATE OR REPLACE FUNCTION public\.expire_tenant_onboarding_partner_assists\([\s\S]*?\$\$;/,
      )?.[0] ?? "";

    expect(expiryFunction).not.toBe("");
    expect(expiryFunction).toMatch(
      /INSERT INTO public\.tenant_onboarding_application_reviews \([\s\S]*?\)\s*SELECT\s+expired_applications\.id,\s*'partner_assist',\s*'expired',\s*'system',/,
    );
  });

  test("preflights and normalizes service-area adcodes before uniqueness", () => {
    expect(migrationSql).toContain("TENANT_SERVICE_AREA_ADCODE_DUPLICATE");
    expect(migrationSql).toContain(
      "SHARE is the least restrictive table lock",
    );
    expect(migrationSql).toContain(
      "earlier-versioned remediation migration",
    );
    expect(migrationSql).toContain("before 20260714210000");
    expect(migrationSql).toContain("Never run manual remote DML");
    expect(migrationSql).not.toContain("NOT VALID");
    expect(migrationSql).toMatch(
      /GROUP BY\s+service_areas\.tenant_id,\s*btrim\(service_areas\.adcode\)\s+HAVING count\(\*\) > 1/,
    );
    expect(migrationSql).toMatch(
      /LOCK TABLE public\.tenant_service_areas IN SHARE MODE;[\s\S]*?UPDATE public\.tenant_service_areas\s+SET adcode = NULL\s+WHERE adcode IS NOT NULL\s+AND btrim\(adcode\) = '';[\s\S]*?TENANT_SERVICE_AREA_ADCODE_DUPLICATE[\s\S]*?UPDATE public\.tenant_service_areas\s+SET adcode = btrim\(adcode\)\s+WHERE adcode IS NOT NULL\s+AND btrim\(adcode\) <> ''[\s\S]*?ADD CONSTRAINT tenant_service_areas_adcode_trimmed_check\s+CHECK \(adcode IS NULL OR adcode = btrim\(adcode\)\);[\s\S]*?CREATE UNIQUE INDEX IF NOT EXISTS tenant_service_areas_tenant_adcode_unique_idx\s+ON public\.tenant_service_areas\(tenant_id, adcode\)/,
    );
    expect(migrationSql).toMatch(
      /BEGIN;[\s\S]*?TENANT_SERVICE_AREA_ADCODE_DUPLICATE[\s\S]*?COMMIT;/,
    );
  });

  test("indexes globally due pending partner assists", () => {
    expect(migrationSql).toMatch(
      /CREATE INDEX IF NOT EXISTS tenant_onboarding_applications_pending_assist_due_idx\s+ON public\.tenant_onboarding_applications\(\s*partner_assist_due_at,\s*id\s*\)\s+WHERE partner_assist_status = 'pending'\s+AND partner_assist_due_at IS NOT NULL\s+AND status IN \('submitted', 'reviewing', 'supplement_required'\)/,
    );
  });
});
