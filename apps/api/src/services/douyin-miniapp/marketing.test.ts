import { describe, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { DouyinLeadRequest } from "@/schema/douyin-miniapp";
import { getTemplateConfigKey } from "@/services/sms/legacy/config";
import { DouyinMiniappMarketingService } from "./marketing";

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
  area: 120,
  budget: "20-30万",
  start_time: "三个月内",
  demand: "旧房改造",
  privacy_policy_version: "2026-07-19",
  consented_at: "2026-07-19T09:59:00.000Z",
  idempotency_key: "33333333-3333-4333-8333-333333333333",
  attribution,
};

type CapturedLeadInput = {
  requestDigest: string;
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
  const submitLead = mock(async (_input: CapturedLeadInput) => ({
    lead_id: "44444444-4444-4444-8444-444444444444",
    already_submitted: false,
    updated_existing: false,
    message: "你已提交预约，我们将尽快联系你",
  }));
  const insertEvents = mock(async (_input: unknown) => undefined);
  const sendCode = mock(async (_input: unknown) => (
    { success: true as const, cooldown_seconds: 60 }
  ));
  const service = new DouyinMiniappMarketingService({
    contextRepository: { findActiveInstallation } as never,
    marketingRepository: { submitLead, insertEvents } as never,
    smsService: { sendCode } as never,
    now: () => new Date("2026-07-19T10:00:00.000Z"),
  });
  return { findActiveInstallation, insertEvents, sendCode, service, submitLead };
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

  test("uses a canonical digest bound to server identity but excluding the SMS secret", async () => {
    const first = harness();
    const second = harness();
    const reordered = {
      ...lead,
      sms_code: "654321",
      attribution: {
        content_id: "video-100", campaign_code: "summer-2026",
        source_type: "short_video" as const, scene: "021001",
        entry_path: "pages/lead/index" as const,
      },
    };
    await first.service.submitLead(user, lead, { requestIp: null, userAgent: null });
    await second.service.submitLead(user, reordered, { requestIp: null, userAgent: null });

    const firstDigest = first.submitLead.mock.calls[0]![0].requestDigest;
    const secondDigest = second.submitLead.mock.calls[0]![0].requestDigest;
    expect(firstDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(firstDigest).toBe(secondDigest);
    expect(first.submitLead.mock.calls[0]![0]).toMatchObject({
      tenantId: TENANT_ID, installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH, phone: lead.phone, smsCode: "123456",
    });

    const otherSubject = { ...user, sub: "b".repeat(64), subject_hash: "b".repeat(64) };
    const third = harness();
    await third.service.submitLead(otherSubject, lead, { requestIp: null, userAgent: null });
    expect(third.submitLead.mock.calls[0]![0].requestDigest).not.toBe(firstDigest);
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
});
