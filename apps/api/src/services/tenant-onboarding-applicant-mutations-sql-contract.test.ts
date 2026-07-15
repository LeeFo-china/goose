import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = new URL(
  "../../../../supabase/migrations/20260714211000_atomic_tenant_onboarding_applicant_mutations.sql",
  import.meta.url,
);

function sql() {
  return readFileSync(migration, "utf8");
}

describe("atomic tenant-onboarding applicant mutations migration", () => {
  test("preserves every SMS scene and adds the applicant-only scene", () => {
    const source = sql();
    for (const scene of [
      "bind_customer", "bind_employee", "admin_login", "rebind_wechat",
      "bind_platform_partner", "unbind_platform_partner",
      "rebind_platform_partner", "partner_application",
      "partner_tenant_onboarding", "tenant_onboarding_application",
    ]) {
      expect(source).toContain(`'${scene}'`);
    }
  });

  test("submits by consuming one exact pending SMS and inserting in one RPC", () => {
    const source = sql();
    expect(source).toContain("submit_tenant_onboarding_application");
    expect(source).toContain("sms.id = p_sms_code_id");
    expect(source).toContain("sms.phone = p_sms_phone");
    expect(source).toContain("sms.scene = 'tenant_onboarding_application'");
    expect(source).toContain("sms.status = 'pending'");
    expect(source).toContain("sms.expired_at > p_now");
    expect(source).toContain("TENANT_ONBOARDING_SMS_INVALID");
    expect(source).toContain("INSERT INTO public.tenant_onboarding_applications");
    expect(source).toContain("created boolean");
  });

  test("supplement and withdraw append review events in their mutation RPC", () => {
    const source = sql();
    expect(source).toContain("supplement_tenant_onboarding_application");
    expect(source).toContain("withdraw_tenant_onboarding_application");
    expect(source.match(/INSERT INTO public\.tenant_onboarding_application_reviews/g))
      .toHaveLength(2);
    expect(source).toContain("application.version = p_expected_version");
    expect(source).toContain("FOR UPDATE");
  });

  test("locks and revalidates context and private visitor license at the write boundary", () => {
    const source = sql();
    expect(source.match(/FROM public\.user_location_contexts AS context/g))
      .toHaveLength(1);
    expect(source.match(/FROM public\.platform_file_objects AS file/g))
      .toHaveLength(2);
    expect(source.match(/FOR SHARE/g)).toHaveLength(3);
    expect(source).toContain("context.visitor_id = p_application->>'visitor_id'");
    for (const predicate of [
      "file.owner_type = 'visitor'",
      "file.owner_visitor_id = p_application->>'visitor_id'",
      "file.scene = 'tenant_onboarding_license'",
      "file.status = 'active'",
      "file.visibility = 'private'",
      "file.deleted_at IS NULL",
      "file.public_url IS NULL",
    ]) expect(source).toContain(predicate);
    expect(source).toContain("TENANT_ONBOARDING_CONTEXT_FORBIDDEN");
    expect(source).toContain("TENANT_ONBOARDING_DOCUMENT_FORBIDDEN");
    expect(source).toContain("p_patch ? 'business_license_file_id'");
  });

  test("keeps applicant RPCs service-role-only", () => {
    const source = sql();
    for (const name of [
      "submit_tenant_onboarding_application",
      "supplement_tenant_onboarding_application",
      "withdraw_tenant_onboarding_application",
    ]) {
      expect(source).toContain(`REVOKE ALL ON FUNCTION public.${name}`);
      expect(source).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}[^;]+ TO service_role;`,
        "s",
      ));
    }
  });
});
