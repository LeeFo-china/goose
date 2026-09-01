import { beforeAll, describe, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import {
  DouyinAnalyticsRequestSchema,
  type DouyinLeadRequest,
} from "@/schema/douyin-miniapp";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let MarketingService: typeof import("./marketing").DouyinMiniappMarketingService;
let getTemplateConfigKey: typeof import("@/services/sms/legacy/config").getTemplateConfigKey;

beforeAll(async () => {
  ({ DouyinMiniappMarketingService: MarketingService } = await import("./marketing"));
  ({ getTemplateConfigKey } = await import("@/services/sms/legacy/config"));
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";
const SUBJECT_HASH = "a".repeat(64);
const user = {
  sub: SUBJECT_HASH,
  token_type: "douyin_miniapp" as const,
  login_channel: "douyin" as const,
  tenant_id: TENANT_ID,
  douyin_installation_id: INSTALLATION_ID,
  douyin_app_id: "tt-authorizer",
  subject_hash: SUBJECT_HASH,
};
const attribution = {
  entry_path: "pages/lead/index" as const,
  scene: "021001",
  source_type: "short_video" as const,
  campaign_code: "summer-2026",
  content_id: "video-100",
};
const lead: DouyinLeadRequest = {
  name: "李先生",
  phone: "13800000000",
  sms_code: "123456",
  community: "示例花园",
  preferred_visit_date: "2026-07-20",
  preferred_visit_period: "afternoon",
  budget_estimate_id: "88888888-8888-4888-8888-888888888888",
  demand: "旧房改造",
  privacy_policy_version: "2026-07-19",
  consented_at: "2026-07-19T09:59:00.000Z",
  idempotency_key: "33333333-3333-4333-8333-333333333333",
  attribution,
};

const publicAppointmentResult = {
  lead_id: "44444444-4444-4444-8444-444444444444",
  appointment_no: "DYLF-20260719-000001",
  already_submitted: false,
  existing_customer_linked: false,
  status: "pending_confirmation" as const,
  message: "量房申请已提交，工作人员将与你确认具体时间" as const,
};

type CapturedLeadInput = {
  tenantId: string;
  installationId: string;
  subjectHash: string;
  phone: string;
  smsCode: string;
};

function harness(features = { sms_lead: true }) {
  const findActiveInstallation = mock(async (_input: unknown) => ({
    id: INSTALLATION_ID,
    tenant_id: TENANT_ID,
    authorizer_appid: "tt-authorizer",
    authorization_status: "active" as const,
    template_version: "1.0.0",
    runtime_config: {
      brand: { logo_url: null, qualifications: [] },
      theme: { primary_color: "#C45A32", navigation_text_color: "black" },
      features: {
        cases: true, sites: true, sms_lead: features.sms_lead,
        douyin_phone: false, phone_capture_mode: "sms",
      },
      home_banners: [], trust_metrics: [], privacy_policy_version: "2026-07-19",
    },
    tenant: { id: TENANT_ID, status: "active" },
  }));
  const submitMeasurementAppointment = mock(async (_input: CapturedLeadInput) => ({
    lead_id: "44444444-4444-4444-8444-444444444444",
    appointment_id: "55555555-5555-4555-8555-555555555555",
    appointment_no: "DYLF-20260719-000001",
    status: "pending_confirmation" as const,
    already_submitted: false,
    updated_existing: false,
    existing_customer_linked: false,
    recent_pending_appointment_exists: false,
  }));
  const createTenantAdminNotifications = mock(async (_input: unknown) => []);
  const insertEvents = mock(async (_input: unknown) => undefined);
  const sendCode = mock(async (_input: unknown) => (
    { success: true as const, cooldown_seconds: 60 }
  ));
  const service = new MarketingService({
    contextRepository: { findActiveInstallation } as never,
    marketingRepository: { submitMeasurementAppointment, insertEvents } as never,
    notificationService: { createTenantAdminNotifications } as never,
    smsService: { sendCode } as never,
    now: () => new Date("2026-07-19T10:00:00.000Z"),
  });
  return {
    createTenantAdminNotifications,
    findActiveInstallation,
    insertEvents,
    sendCode,
    service,
    submitMeasurementAppointment,
  };
}

describe("DouyinMiniappMarketingService", () => {
  test("uses the customer verification template for Douyin homeowner leads", () => {
    expect(getTemplateConfigKey({ provider: "aliyun", purpose: "douyin_lead" }))
      .toBe("ALIYUN_SMS_TEMPLATE_CODE_BIND_CUSTOMER");
    expect(getTemplateConfigKey({ provider: "tencent", purpose: "douyin_lead" }))
      .toBe("TENCENT_SMS_TEMPLATE_ID_BIND_CUSTOMER");
  });

  test("sends only the douyin lead scene with session subject/IP and records safe success", async () => {
    const { insertEvents, sendCode, service } = harness();
    await expect(service.sendCode(user, { phone: lead.phone, attribution }, {
      requestIp: "127.0.0.1", userAgent: "Douyin Miniapp",
    })).resolves.toEqual({ success: true, cooldown_seconds: 60 });

    expect(sendCode).toHaveBeenCalledWith({
      phone: lead.phone,
      scene: "douyin_lead",
      requestIp: "127.0.0.1",
      requestDevice: SUBJECT_HASH,
      requestIpLimit: 5,
    });
    expect(insertEvents).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      requestIp: "127.0.0.1",
      userAgent: "Douyin Miniapp",
      events: [{ eventName: "sms_send", occurredAt: "2026-07-19T10:00:00.000Z",
        attribution, entityId: undefined }],
    });
  });

  test("does not leak SMS failures or let analytics undo a successful send", async () => {
    const failed = harness();
    failed.sendCode.mockImplementationOnce(async () => {
      throw Errors.dbError("provider failed", { secret: "sms-provider-secret" });
    });
    let caught: unknown;
    try {
      await failed.service.sendCode(user, { phone: lead.phone, attribution }, {
        requestIp: null, userAgent: null,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "SMS_UNAVAILABLE", statusCode: 503 });
    expect(JSON.stringify(caught)).not.toContain("sms-provider-secret");

    const analyticsFailed = harness();
    analyticsFailed.insertEvents.mockImplementationOnce(async () => {
      throw Errors.dbError("analytics failed");
    });
    await expect(analyticsFailed.service.sendCode(
      user, { phone: lead.phone, attribution }, { requestIp: null, userAgent: null },
    )).resolves.toEqual({ success: true, cooldown_seconds: 60 });
  });

  test("passes the server-owned appointment command fields without a caller digest", async () => {
    const first = harness();
    await expect(first.service.submitLead(
      user,
      lead,
      { requestIp: null, userAgent: null },
    )).resolves.toEqual(publicAppointmentResult);

    const command = first.submitMeasurementAppointment.mock.calls[0]![0];
    expect(command).toMatchObject({
      tenantId: TENANT_ID, installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH, phone: lead.phone, smsCode: "123456",
      community: "示例花园",
      preferredVisitDate: "2026-07-20",
      preferredVisitPeriod: "afternoon",
      budgetEstimateId: "88888888-8888-4888-8888-888888888888",
    });
    expect(command).not.toHaveProperty("requestDigest");
    expect(command).not.toHaveProperty("area");
    expect(command).not.toHaveProperty("budget");
    expect(command).not.toHaveProperty("startTime");
  });

  test("notifies tenant admins after commit and keeps notification failure non-fatal and private", async () => {
    const succeeded = harness();
    await succeeded.service.submitLead(user, lead, { requestIp: null, userAgent: null });
    expect(succeeded.createTenantAdminNotifications).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      scene: "douyin_measurement_appointment_submitted",
      title: "新的免费量房预约",
      content: "量房预约 DYLF-20260719-000001 已提交，请及时联系并确认具体时间。",
      targetType: "marketing_lead",
      targetId: "44444444-4444-4444-8444-444444444444",
      targetUrl: "/douyin-miniapp/leads",
      payload: {
        marketing_lead_id: "44444444-4444-4444-8444-444444444444",
        appointment_id: "55555555-5555-4555-8555-555555555555",
        appointment_no: "DYLF-20260719-000001",
      },
    });

    const failed = harness();
    failed.createTenantAdminNotifications.mockImplementationOnce(async () => {
      throw new Error(`notification failed ${lead.name} ${lead.phone}`);
    });
    const warn = mock((_payload: unknown, _message: string) => undefined);
    await expect(failed.service.submitLead(user, lead, {
      requestIp: null,
      userAgent: null,
      log: { warn },
    })).resolves.toEqual(publicAppointmentResult);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("DOUYIN_MEASUREMENT_NOTIFICATION_FAILED");
    expect(logged).toContain("55555555-5555-4555-8555-555555555555");
    expect(logged).toContain("DYLF-20260719-000001");
    expect(logged).not.toContain(TENANT_ID);
    expect(logged).not.toContain(INSTALLATION_ID);
    expect(logged).not.toContain(SUBJECT_HASH);
    expect(logged).not.toContain(lead.name);
    expect(logged).not.toContain(lead.phone);
    expect(logged).not.toContain("notification failed");
  });

  test("does not create a duplicate notification for an idempotent command replay", async () => {
    const replayed = harness();
    replayed.submitMeasurementAppointment.mockImplementationOnce(async () => ({
      lead_id: "44444444-4444-4444-8444-444444444444",
      appointment_id: "55555555-5555-4555-8555-555555555555",
      appointment_no: "DYLF-20260719-000001",
      status: "pending_confirmation" as const,
      already_submitted: true,
      updated_existing: true,
      existing_customer_linked: false,
      recent_pending_appointment_exists: true,
    }));

    await expect(replayed.service.submitLead(
      user,
      lead,
      { requestIp: null, userAgent: null },
    )).resolves.toEqual({
      ...publicAppointmentResult,
      already_submitted: true,
    });
    expect(replayed.createTenantAdminNotifications).not.toHaveBeenCalled();
  });

  test("delegates past-date validation to the atomic command so replay remains possible", async () => {
    const afterMidnight = harness();
    const service = new MarketingService({
      contextRepository: { findActiveInstallation: afterMidnight.findActiveInstallation } as never,
      marketingRepository: {
        submitMeasurementAppointment: afterMidnight.submitMeasurementAppointment,
        insertEvents: afterMidnight.insertEvents,
      } as never,
      notificationService: {
        createTenantAdminNotifications: afterMidnight.createTenantAdminNotifications,
      } as never,
      smsService: { sendCode: afterMidnight.sendCode } as never,
      now: () => new Date("2026-07-19T16:00:00.000Z"),
    });
    await expect(service.submitLead(user, {
      ...lead,
      preferred_visit_date: "2026-07-19",
    }, { requestIp: null, userAgent: null })).resolves.toEqual(publicAppointmentResult);
    expect(afterMidnight.submitMeasurementAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ preferredVisitDate: "2026-07-19" }),
    );
  });

  test("rejects disabled lead capture, stale consent, and server-authoritative client events", async () => {
    await expect(harness({ sms_lead: false }).service.submitLead(
      user, lead, { requestIp: null, userAgent: null },
    )).rejects.toMatchObject({ code: "DOUYIN_LEAD_FEATURE_DISABLED", statusCode: 404 });

    await expect(harness().service.submitLead(user, {
      ...lead, consented_at: "2026-07-19T10:06:00.000Z",
    }, { requestIp: null, userAgent: null })).rejects.toMatchObject({
      code: "DOUYIN_CONSENT_TIME_INVALID", statusCode: 400,
    });

    await expect(harness().service.recordEvents(user, { events: [{
      event_name: "lead_submit_success", occurred_at: "2026-07-19T10:00:00.000Z",
      attribution,
    }] } as never, { requestIp: null, userAgent: null })).rejects.toMatchObject({
      code: "DOUYIN_EVENT_NOT_CLIENT_WRITABLE", statusCode: 400,
    });

  });

  test("writes one bounded analytics batch with server-derived ownership", async () => {
    const { insertEvents, service } = harness();
    await service.recordEvents(user, { events: [{
      event_name: "case_view",
      occurred_at: "2026-07-19T09:59:30.000Z",
      attribution,
      entity_id: "55555555-5555-4555-8555-555555555555",
    }] }, { requestIp: "127.0.0.1", userAgent: "ua" });
    expect(insertEvents).toHaveBeenCalledWith({
      tenantId: TENANT_ID, installationId: INSTALLATION_ID, subjectHash: SUBJECT_HASH,
      requestIp: "127.0.0.1", userAgent: "ua",
      events: [{ eventName: "case_view", occurredAt: "2026-07-19T09:59:30.000Z",
        attribution, entityId: "55555555-5555-4555-8555-555555555555" }],
    });
  });

  test("accepts client material engagement but keeps material claims server-only", async () => {
    const eventNames = [
      "material_preview",
      "material_copy",
      "material_budget_click",
      "material_lead_click",
    ] as const;
    const events = eventNames.map((event_name) => ({
      event_name,
      occurred_at: "2026-07-19T09:59:30.000Z",
      attribution,
      entity_id: "55555555-5555-4555-8555-555555555555",
    }));
    const parsed = DouyinAnalyticsRequestSchema.safeParse({ events });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const { insertEvents, service } = harness();
    await expect(service.recordEvents(
      user,
      parsed.data,
      { requestIp: null, userAgent: null },
    )).resolves.toEqual({ accepted: 4 });
    expect(insertEvents).toHaveBeenCalledTimes(1);
    expect(insertEvents.mock.calls[0]?.[0]).toMatchObject({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      events: eventNames.map((eventName) => ({ eventName })),
    });

    expect(DouyinAnalyticsRequestSchema.safeParse({ events: [{
      ...events[0],
      event_name: "material_claim",
    }] }).success).toBe(false);
    await expect(service.recordEvents(user, { events: [{
      ...events[0],
      event_name: "material_claim",
    }] } as never, { requestIp: null, userAgent: null })).rejects.toMatchObject({
      statusCode: 400,
      code: "DOUYIN_EVENT_NOT_CLIENT_WRITABLE",
    });
    expect(insertEvents).toHaveBeenCalledTimes(1);
  });
});
