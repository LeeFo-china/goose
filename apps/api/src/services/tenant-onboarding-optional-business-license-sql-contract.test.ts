import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../../../supabase/migrations/20260918100000_tenant_onboarding_optional_business_license.sql",
);
const migrationSql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

const extractFunction = (name: string) =>
  migrationSql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`,
    ),
  )?.[0] ?? "";

const submitFunction = extractFunction(
  "submit_tenant_onboarding_application",
);
const supplementFunction = extractFunction(
  "supplement_tenant_onboarding_application",
);
const compactMigrationSql = migrationSql.replace(/\s+/g, " ");

const expectPrivateVisitorFileContract = (sql: string) => {
  expect(sql).toContain("file.owner_type = 'visitor'");
  expect(sql).toContain("file.owner_visitor_id");
  expect(sql).toContain("file.scene = 'tenant_onboarding_license'");
  expect(sql).toContain("file.status = 'active'");
  expect(sql).toContain("file.visibility = 'private'");
  expect(sql).toContain("file.deleted_at IS NULL");
  expect(sql).toContain("file.public_url IS NULL");
  expect(sql).toContain("FOR SHARE");
  expect(sql).toContain("TENANT_ONBOARDING_DOCUMENT_FORBIDDEN");
};

describe("optional tenant onboarding business license SQL contract", () => {
  test("contains both complete RPC replacements", () => {
    expect(migrationSql).not.toBe("");
    expect(submitFunction).not.toBe("");
    expect(supplementFunction).not.toBe("");
  });

  test("normalizes and conditionally validates a submitted license", () => {
    expect(submitFunction).toMatch(
      /IF NULLIF\(pg_catalog\.btrim\(p_application->>'business_license_file_id'\), ''\)::uuid IS NOT NULL THEN[\s\S]*?WHERE file\.id = NULLIF\(pg_catalog\.btrim\(p_application->>'business_license_file_id'\), ''\)::uuid[\s\S]*?END IF;/,
    );
    expect(submitFunction).toContain(
      "NULLIF(pg_catalog.btrim(p_application->>'business_license_file_id'), '')::uuid",
    );
    expect(submitFunction).toMatch(
      /unified_social_credit_code, business_license_file_id,[\s\S]*?NULLIF\(p_application->>'unified_social_credit_code', ''\),\s+NULLIF\(pg_catalog\.btrim\(p_application->>'business_license_file_id'\), ''\)::uuid,/,
    );
    expectPrivateVisitorFileContract(submitFunction);
  });

  test("keeps submit idempotency ahead of SMS consumption and SMS predicates", () => {
    const idempotencyLookup = submitFunction.indexOf(
      "application.idempotency_key = p_application->>'idempotency_key'",
    );
    const smsConsumption = submitFunction.indexOf(
      "UPDATE public.sms_verification_codes AS sms",
    );

    expect(idempotencyLookup).toBeGreaterThan(-1);
    expect(smsConsumption).toBeGreaterThan(idempotencyLookup);
    expect(submitFunction).toContain(
      "sms.scene = 'tenant_onboarding_application'",
    );
    expect(submitFunction).toContain("sms.status = 'pending'");
    expect(submitFunction).toContain("sms.expired_at > p_now");
    expect(submitFunction).toContain("TENANT_ONBOARDING_SMS_INVALID");
    expect(submitFunction).toContain(
      "tenant_onboarding_applications_visitor_idempotency_unique",
    );
  });

  test("distinguishes omitted supplement keys from explicit null values", () => {
    expect(supplementFunction).toMatch(
      /IF p_patch \? 'business_license_file_id'[\s\S]*?AND NULLIF\(pg_catalog\.btrim\(p_patch->>'business_license_file_id'\), ''\)::uuid IS NOT NULL\s+THEN[\s\S]*?WHERE file\.id = NULLIF\(pg_catalog\.btrim\(p_patch->>'business_license_file_id'\), ''\)::uuid[\s\S]*?END IF;/,
    );
    expect(supplementFunction).toMatch(
      /business_license_file_id = CASE\s+WHEN p_patch \? 'business_license_file_id'\s+THEN NULLIF\(pg_catalog\.btrim\(p_patch->>'business_license_file_id'\), ''\)::uuid\s+ELSE application\.business_license_file_id\s+END/,
    );
    expectPrivateVisitorFileContract(supplementFunction);
  });

  test("keeps definer security and service-role-only execution", () => {
    for (const body of [submitFunction, supplementFunction]) {
      expect(body).toContain("SECURITY DEFINER");
      expect(body).toContain("SET search_path = pg_catalog, public");
    }

    expect(compactMigrationSql).toContain(
      "REVOKE ALL ON FUNCTION public.submit_tenant_onboarding_application( jsonb, uuid, text, timestamptz ) FROM PUBLIC, anon, authenticated;",
    );
    expect(compactMigrationSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.submit_tenant_onboarding_application( jsonb, uuid, text, timestamptz ) TO service_role;",
    );
    expect(compactMigrationSql).toContain(
      "REVOKE ALL ON FUNCTION public.supplement_tenant_onboarding_application( uuid, text, integer, jsonb, boolean, uuid, text, jsonb, text, timestamptz, timestamptz, timestamptz ) FROM PUBLIC, anon, authenticated;",
    );
    expect(compactMigrationSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.supplement_tenant_onboarding_application( uuid, text, integer, jsonb, boolean, uuid, text, jsonb, text, timestamptz, timestamptz, timestamptz ) TO service_role;",
    );
  });
});
