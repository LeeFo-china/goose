import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { DouyinLeadRequest } from "@/schema/douyin-miniapp";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let MarketingService: typeof import("./marketing").DouyinMiniappMarketingService;

beforeAll(async () => {
  ({ DouyinMiniappMarketingService: MarketingService } = await import("./marketing"));
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
};
const lead: DouyinLeadRequest = {
  name: "李先生",
  community: "示例花园",
  preferred_visit_date: "2026-07-20",
  preferred_visit_period: "afternoon",
  privacy_policy_version: "2026-07-19",
  consented_at: "2026-07-19T09:59:00.000Z",
  idempotency_key: "33333333-3333-4333-8333-333333333333",
  attribution,
  verification_method: "douyin_phone",
  douyin_phone_code: "official-phone-code",
};

describe("DouyinMiniappMarketingService official phone", () => {
  test("exchanges the Douyin phone code and submits without SMS fields", async () => {
    const submitMeasurementAppointment = mock(async () => ({
      lead_id: "44444444-4444-4444-8444-444444444444",
      appointment_id: "55555555-5555-4555-8555-555555555555",
      appointment_no: "DYLF-20260719-000001",
      status: "pending_confirmation" as const,
      already_submitted: false,
      updated_existing: false,
      existing_customer_linked: false,
      recent_pending_appointment_exists: false,
    }));
    const getAuthorizerAccessToken = mock(async () => "authorizer-token");
    const getPhoneNumberInfo = mock(async () => ({ phone: "13900000000" }));
    const service = new MarketingService({
      contextRepository: { findActiveInstallation: mock(async () => ({
        id: INSTALLATION_ID,
        tenant_id: TENANT_ID,
        authorizer_appid: "tt-authorizer",
        deployment_key: "merchant-dev",
        authorization_status: "active" as const,
        template_version: "1.0.0",
        installation_kind: "merchant" as const,
        runtime_config: {
          brand: { logo_url: null, qualifications: [] },
          theme: { primary_color: "#C45A32", navigation_text_color: "black" },
          features: {
            cases: true,
            sites: true,
            sms_lead: true,
            douyin_phone: true,
            phone_capture_mode: "douyin_phone",
            clue_component_id: "clue-123",
          },
          home_banners: [],
          trust_metrics: [],
          privacy_policy_version: "2026-07-19",
        },
        tenant: { id: TENANT_ID, status: "active" as const },
      })) } as never,
      marketingRepository: {
        submitMeasurementAppointment,
        insertEvents: mock(async () => undefined),
        listPublishedMaterialNoteIds: mock(async () => []),
        listActiveClaimedMaterialNoteIds: mock(async () => []),
      } as never,
      notificationService: { createTenantAdminNotifications: mock(async () => []) } as never,
      smsService: { sendCode: mock(async () => ({ success: true, cooldown_seconds: 60 })) } as never,
      accessTokens: { getAuthorizerAccessToken },
      phoneGateway: { getPhoneNumberInfo },
      douyinPhoneNumberPrivateKeyPem: "private-key",
      now: () => new Date("2026-07-19T10:00:00.000Z"),
    });

    await expect(service.submitLead(user, lead, { requestIp: null, userAgent: null }))
      .resolves.toMatchObject({ appointment_no: "DYLF-20260719-000001" });
    expect(getAuthorizerAccessToken).toHaveBeenCalledWith({
      authorizerAppId: "tt-authorizer",
      deploymentKey: "merchant-dev",
    });
    expect(getPhoneNumberInfo).toHaveBeenCalledWith({
      appId: "tt-authorizer",
      authorizerAccessToken: "authorizer-token",
      code: "official-phone-code",
      privateKeyPem: "private-key",
    });
    expect(submitMeasurementAppointment).toHaveBeenCalledWith(expect.objectContaining({
      phone: "13900000000",
      verification: { type: "douyin_phone" },
    }));
  });

  test("rejects official phone mode without a server private key before consuming the code", async () => {
    const getAuthorizerAccessToken = mock(async () => "authorizer-token");
    const getPhoneNumberInfo = mock(async () => ({ phone: "13900000000" }));
    const service = new MarketingService({
      contextRepository: { findActiveInstallation: mock(async () => ({
        id: INSTALLATION_ID,
        tenant_id: TENANT_ID,
        authorizer_appid: "tt-authorizer",
        deployment_key: "merchant-dev",
        authorization_status: "active" as const,
        template_version: "1.0.0",
        installation_kind: "merchant" as const,
        runtime_config: {
          brand: { logo_url: null, qualifications: [] },
          theme: { primary_color: "#C45A32", navigation_text_color: "black" },
          features: {
            cases: true,
            sites: true,
            sms_lead: true,
            douyin_phone: true,
            phone_capture_mode: "douyin_phone",
            clue_component_id: "clue-123",
          },
          home_banners: [],
          trust_metrics: [],
          privacy_policy_version: "2026-07-19",
        },
        tenant: { id: TENANT_ID, status: "active" as const },
      })) } as never,
      marketingRepository: {
        submitMeasurementAppointment: mock(async () => ({})),
        insertEvents: mock(async () => undefined),
        listPublishedMaterialNoteIds: mock(async () => []),
        listActiveClaimedMaterialNoteIds: mock(async () => []),
      } as never,
      notificationService: { createTenantAdminNotifications: mock(async () => []) } as never,
      smsService: { sendCode: mock(async () => ({ success: true, cooldown_seconds: 60 })) } as never,
      accessTokens: { getAuthorizerAccessToken },
      phoneGateway: { getPhoneNumberInfo },
      douyinPhoneNumberPrivateKeyPem: null,
      now: () => new Date("2026-07-19T10:00:00.000Z"),
    });

    await expect(service.submitLead(user, lead, { requestIp: null, userAgent: null }))
      .rejects.toMatchObject({ code: "DOUYIN_PHONE_NUMBER_CONFIG_INVALID" });
    expect(getAuthorizerAccessToken).not.toHaveBeenCalled();
    expect(getPhoneNumberInfo).not.toHaveBeenCalled();
  });
});
