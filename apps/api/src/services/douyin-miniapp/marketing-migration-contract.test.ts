import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migration = new URL(
  "../../../../../supabase/migrations/20260719101000_create_douyin_miniapp_marketing.sql",
  import.meta.url,
);

function migrationSql(): string {
  return existsSync(migration)
    ? readFileSync(migration, "utf8").replace(/--.*$/gm, "").replace(/\s+/g, " ").trim()
    : "";
}

function functionBody(source: string): string {
  const start = source.indexOf("FUNCTION public.submit_douyin_miniapp_lead(");
  const end = source.indexOf("$$;", start);
  return start < 0 || end < 0 ? "" : source.slice(start, end);
}

const douyinEvents = [
  "app_launch",
  "page_view",
  "case_view",
  "site_view",
  "lead_cta_click",
  "sms_send",
  "lead_submit",
  "lead_submit_success",
  "phone_call_click",
] as const;

const smsScenes = [
  "bind_customer",
  "bind_employee",
  "admin_login",
  "rebind_wechat",
  "bind_platform_partner",
  "unbind_platform_partner",
  "rebind_platform_partner",
  "partner_application",
  "partner_tenant_onboarding",
  "tenant_onboarding_application",
  "login_identity",
  "douyin_lead",
] as const;

function constraintValues(source: string, constraintName: string): string[] {
  const start = source.indexOf(`ADD CONSTRAINT ${constraintName}`);
  const end = source.indexOf(");", start);
  return start < 0 || end < 0
    ? []
    : [...source.slice(start, end).matchAll(/'([^']+)'/g)].map((match) => match[1]!);
}

describe("douyin miniapp marketing migration", () => {
  test("extends existing leads, events, and SMS without changing H5 defaults", () => {
    const sql = migrationSql();
    expect(existsSync(migration)).toBe(true);
    expect(sql).toContain(
      "ALTER TABLE public.marketing_leads ADD COLUMN douyin_miniapp_installation_id uuid NULL REFERENCES public.douyin_miniapp_installations(id) ON DELETE RESTRICT",
    );
    expect(sql).toContain(
      "ALTER TABLE public.marketing_events ADD COLUMN douyin_miniapp_installation_id uuid NULL REFERENCES public.douyin_miniapp_installations(id) ON DELETE RESTRICT",
    );
    expect(sql).toContain(
      "ALTER TABLE public.marketing_events ADD COLUMN source text NOT NULL DEFAULT 'h5'",
    );
    expect(sql).toContain("ADD COLUMN subject_hash text NULL");
    expect(constraintValues(sql, "sms_verification_codes_scene_check"))
      .toEqual([...smsScenes]);
    for (const eventName of douyinEvents) expect(sql).toContain(`'${eventName}'`);
    for (const h5Event of ["page_view", "button_click", "phone_click", "form_submit"]) {
      expect(sql).toContain(`'${h5Event}'`);
    }
  });

  test("creates immutable idempotency facts and bounded partial indexes", () => {
    const sql = migrationSql();
    expect(sql).toContain("CREATE TABLE public.douyin_miniapp_lead_submissions");
    expect(sql).toContain("CONSTRAINT douyin_lead_submissions_installation_id_fkey REFERENCES public.douyin_miniapp_installations(id) ON DELETE RESTRICT");
    expect(sql).toContain("UNIQUE (douyin_miniapp_installation_id, idempotency_key)");
    expect(sql).toContain("request_digest text NOT NULL");
    expect(sql).toContain("marketing_lead_id uuid NOT NULL REFERENCES public.marketing_leads(id) ON DELETE RESTRICT");
    expect(sql).toContain("sms_verification_code_id uuid NOT NULL UNIQUE REFERENCES public.sms_verification_codes(id) ON DELETE RESTRICT");
    expect(sql).toContain("already_submitted boolean NOT NULL");
    expect(sql).toContain("updated_existing boolean NOT NULL");
    expect(sql).toContain(
      "CREATE INDEX marketing_leads_douyin_phone_created_idx ON public.marketing_leads(tenant_id, phone, created_at DESC) WHERE source = 'douyin_miniapp' AND phone IS NOT NULL",
    );
    expect(sql).toContain(
      "CREATE INDEX marketing_events_douyin_funnel_idx ON public.marketing_events(tenant_id, source, event_name, created_at DESC) WHERE source = 'douyin_miniapp'",
    );
    expect(sql).toContain("ALTER TABLE public.douyin_miniapp_lead_submissions ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain(
      "REVOKE ALL ON TABLE public.douyin_miniapp_lead_submissions FROM PUBLIC, anon, authenticated",
    );
    expect(sql).toContain(
      "FROM PUBLIC, anon, authenticated, service_role",
    );
    expect(sql).toContain("marketing_leads_douyin_source_shape_check");
    expect(sql).toContain("marketing_events_douyin_source_shape_check");
  });

  test("secures the atomic submission RPC for service-role only", () => {
    const sql = migrationSql();
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.submit_douyin_miniapp_lead(");
    expect(sql).toContain(
      "RETURNS TABLE ( lead_id uuid, already_submitted boolean, updated_existing boolean, message text ) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.submit_douyin_miniapp_lead( uuid, uuid, text, text, text, numeric, text, text, text, text, text, uuid, text, text, text, text, timestamptz, jsonb ) FROM PUBLIC, anon, authenticated",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.submit_douyin_miniapp_lead( uuid, uuid, text, text, text, numeric, text, text, text, text, text, uuid, text, text, text, text, timestamptz, jsonb ) TO service_role",
    );
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO (?:PUBLIC|anon|authenticated)/);
  });

  test("revalidates tenant and installation before any marketing write", () => {
    const body = functionBody(migrationSql());
    const installation = body.indexOf("FROM public.douyin_miniapp_installations AS installation");
    const tenantMatch = body.indexOf("installation.tenant_id = p_tenant_id", installation);
    const activeInstallation = body.indexOf("installation.authorization_status = 'active'", tenantMatch);
    const tenant = body.indexOf("FROM public.tenants AS tenant", activeInstallation);
    const activeTenant = body.indexOf("tenant.status = 'active'", tenant);
    const firstMarketingWrite = Math.min(
      ...["INSERT INTO public.marketing_leads", "UPDATE public.marketing_leads"]
        .map((needle) => body.indexOf(needle))
        .filter((index) => index >= 0),
    );
    expect(installation).toBeGreaterThan(-1);
    expect(tenantMatch).toBeGreaterThan(installation);
    expect(activeInstallation).toBeGreaterThan(tenantMatch);
    expect(tenant).toBeGreaterThan(activeInstallation);
    expect(activeTenant).toBeGreaterThan(tenant);
    expect(firstMarketingWrite).toBeGreaterThan(activeTenant);
    expect(body).toContain(
      "installation.runtime_config ->> 'privacy_policy_version'",
    );
    expect(body).toContain(
      "v_expected_privacy_policy_version IS DISTINCT FROM p_privacy_policy_version",
    );
    expect(body).toContain("MESSAGE = 'DOUYIN_PRIVACY_POLICY_VERSION_MISMATCH'");
  });

  test("serializes idempotency and the 24-hour tenant-phone deduplication", () => {
    const body = functionBody(migrationSql());
    expect(body).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(body).toContain("douyin:idempotency:");
    expect(body).toContain(
      "submission.douyin_miniapp_installation_id = p_douyin_miniapp_installation_id AND submission.idempotency_key = p_idempotency_key FOR UPDATE",
    );
    expect(body).toContain("v_submission.request_digest IS DISTINCT FROM p_request_digest");
    expect(body).toContain("MESSAGE = 'DOUYIN_IDEMPOTENCY_CONFLICT'");
    expect(body).toContain("pg_catalog.hashtextextended(p_tenant_id::text || ':' || p_phone, 0)");
    expect(body).toContain("lead.tenant_id = p_tenant_id");
    expect(body).toContain("lead.source = 'douyin_miniapp'");
    expect(body).toContain("lead.phone = p_phone");
    expect(body).toContain("lead.created_at >= v_now - interval '24 hours'");
    expect(body).toContain("ORDER BY lead.created_at DESC LIMIT 1 FOR UPDATE");
  });

  test("consumes one valid SMS and records lead plus authoritative events atomically", () => {
    const body = functionBody(migrationSql());
    const smsReservationLock = body.indexOf(
      "pg_catalog.hashtextextended('sms:phone:douyin_lead:' || p_phone, 0)",
    );
    const smsLookup = body.indexOf("FROM public.sms_verification_codes AS sms");
    const smsLockEnd = body.indexOf("FOR UPDATE", smsLookup);
    const smsCodeCheck = body.indexOf("v_sms.code IS DISTINCT FROM p_sms_code", smsLockEnd);
    const phoneLock = body.indexOf("pg_catalog.hashtextextended(p_tenant_id::text || ':' || p_phone, 0)");
    const leadWrite = Math.min(
      ...["INSERT INTO public.marketing_leads", "UPDATE public.marketing_leads"]
        .map((needle) => body.indexOf(needle))
        .filter((index) => index >= 0),
    );
    const smsUpdate = body.indexOf("UPDATE public.sms_verification_codes", leadWrite);
    const submissionInsert = body.indexOf("INSERT INTO public.douyin_miniapp_lead_submissions", smsUpdate);
    const eventInsert = body.indexOf("INSERT INTO public.marketing_events", submissionInsert);
    expect(smsReservationLock).toBeGreaterThan(-1);
    expect(smsLookup).toBeGreaterThan(smsReservationLock);
    expect(body).toContain("sms.scene = 'douyin_lead'");
    expect(body).toContain("sms.phone = p_phone");
    expect(body).toContain("ORDER BY sms.created_at DESC LIMIT 1 FOR UPDATE");
    expect(body.slice(smsLookup, smsLockEnd)).not.toContain("sms.code = p_sms_code");
    expect(body.slice(smsLookup, smsLockEnd)).not.toContain("sms.status = 'pending'");
    expect(smsCodeCheck).toBeGreaterThan(smsLockEnd);
    expect(body).toContain("v_sms.status IS DISTINCT FROM 'pending'");
    expect(body).toContain("v_sms.request_device IS DISTINCT FROM p_subject_hash");
    expect(body).toContain("MESSAGE = 'SMS_CODE_INVALID'");
    expect(body).toContain("MESSAGE = 'SMS_CODE_EXPIRED'");
    expect(phoneLock).toBeGreaterThan(smsLookup);
    expect(leadWrite).toBeGreaterThan(phoneLock);
    expect(smsUpdate).toBeGreaterThan(leadWrite);
    expect(submissionInsert).toBeGreaterThan(smsUpdate);
    expect(eventInsert).toBeGreaterThan(submissionInsert);
    expect(body).toContain("'lead_submit'");
    expect(body).toContain("'lead_submit_success'");
    expect(body).not.toContain("p_sms_code',");

    const leadUpdate = body.slice(
      body.indexOf("UPDATE public.marketing_leads AS lead"),
      body.indexOf("v_already_submitted := true"),
    );
    expect(leadUpdate).not.toMatch(/created_at|lead_status|follow_remark|followed_by|followed_at|customer_id/);
  });
});
