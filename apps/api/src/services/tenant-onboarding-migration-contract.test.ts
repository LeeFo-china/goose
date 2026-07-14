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
});
