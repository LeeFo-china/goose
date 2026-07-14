import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const repository = readFileSync(
  new URL("../repositories/tenant-onboarding.ts", import.meta.url),
  "utf8",
);
const notificationRepository = readFileSync(
  new URL("../repositories/tenant-onboarding-notifications.ts", import.meta.url),
  "utf8",
);
const service = readFileSync(
  new URL("./tenant-onboarding-applications.ts", import.meta.url),
  "utf8",
);

describe("tenant-onboarding applicant repository contract", () => {
  test("owned lists select only summary fields with a deterministic id tie-breaker", () => {
    const summarySelect = repository.match(
      /const OWNED_LIST_SELECT = \[([\s\S]*?)\]\.join/,
    )?.[1] ?? "";
    for (const field of [
      "id", "application_no", "company_name", "status",
      "partner_assist_status", "version", "created_at", "updated_at",
    ]) expect(summarySelect).toContain(`"${field}"`);
    for (const sensitive of [
      "admin_phone", "admin_name", "unified_social_credit_code",
      "business_license_file_id", "address", "candidate_snapshot",
    ]) expect(summarySelect).not.toContain(`"${sensitive}"`);
    expect(repository).toMatch(
      /\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: false \}\)/,
    );
  });

  test("durable applicant mutations use RPCs and never split SMS or audit writes", () => {
    expect(repository).toContain('"submit_tenant_onboarding_application"');
    expect(repository).toContain('"supplement_tenant_onboarding_application"');
    expect(repository).toContain('"withdraw_tenant_onboarding_application"');
    expect(service).not.toContain("markVerified");
    expect(service).not.toContain("appendReviewEvent");
  });

  test("approves through the narrow RPC and runtime parser", () => {
    expect(repository).toContain('async approveApplication(');
    expect(repository).toContain('"approve_tenant_onboarding_application"');
    expect(repository).toContain("parseTenantOnboardingApprovalRpcResult");
    expect(repository).not.toMatch(/return data as TenantOnboardingApprovalRpcResult/);
  });

  test("parses untyped Supabase rows at both repository boundaries", () => {
    for (const source of [repository, notificationRepository]) {
      expect(source).toContain("tenant-onboarding-parsers");
      expect(source).not.toMatch(/data\s+as\s+TenantOnboarding/);
    }
    expect(repository).toContain("parseTenantOnboardingApplication");
    expect(notificationRepository).toContain("parseTenantOnboardingNotificationDelivery");
  });
});
