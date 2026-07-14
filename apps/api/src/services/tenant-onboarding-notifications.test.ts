import { beforeEach, describe, expect, mock, test } from "bun:test";

import type {
  TenantOnboardingNotificationDeliveryRecord,
  TenantOnboardingNotificationEventType,
} from "@/repositories/tenant-onboarding-types";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const APPLICATION_ID = "00000000-0000-4000-8000-000000000101";
const DELIVERY_ID = "00000000-0000-4000-8000-000000000501";
const NOW = "2026-07-14T08:00:00.000Z";

function delivery(
  overrides: Partial<TenantOnboardingNotificationDeliveryRecord> = {},
): TenantOnboardingNotificationDeliveryRecord {
  return {
    id: DELIVERY_ID,
    application_id: APPLICATION_ID,
    application_version: 1,
    event_type: "submitted",
    channel: "sms",
    status: "pending",
    attempt_count: 0,
    last_error: null,
    sent_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

const recipient = {
  application_id: APPLICATION_ID,
  application_no: "ZQ-20260714-A1B2",
  company_name: "固始晴天装饰工程有限公司",
  admin_phone: "13900139000",
};

const repository = {
  findOrCreateDelivery: mock(async (input: {
    application_id: string;
    application_version: number;
    event_type: TenantOnboardingNotificationEventType;
    channel: "sms";
  }) => ({ delivery: delivery(input), created: true })),
  findByIdAndApplication: mock(async () => delivery({ status: "failed" }) as TenantOnboardingNotificationDeliveryRecord | null),
  markAttempting: mock(async () => delivery({ attempt_count: 1 }) as TenantOnboardingNotificationDeliveryRecord | null),
  markSent: mock(async () => delivery({ status: "sent", attempt_count: 1, sent_at: NOW })),
  markFailed: mock(async (_input: { deliveryId: string; lastError: string }) =>
    delivery({ status: "failed", attempt_count: 1 })
  ),
  loadCurrentApplicationRecipient: mock(async () => recipient as typeof recipient | null),
};
const sendSmsTemplate = mock(async () => undefined);

async function createService(maxAttempts = 3) {
  const { TenantOnboardingNotificationsService } = await import(
    "./tenant-onboarding-notifications"
  );
  return new TenantOnboardingNotificationsService({
    repository,
    sendSmsTemplate,
    maxAttempts,
    clock: () => new Date(NOW),
  });
}

describe("TenantOnboardingNotificationsService", () => {
  beforeEach(() => {
    for (const fn of Object.values(repository)) fn.mockClear();
    sendSmsTemplate.mockClear();
    repository.findOrCreateDelivery.mockImplementation(async (input) => ({
      delivery: delivery(input),
      created: true,
    }));
    repository.findByIdAndApplication.mockImplementation(async () =>
      delivery({ status: "failed" })
    );
    repository.markAttempting.mockImplementation(async () =>
      delivery({ attempt_count: 1 })
    );
    repository.markSent.mockImplementation(async () =>
      delivery({ status: "sent", attempt_count: 1, sent_at: NOW })
    );
    repository.markFailed.mockImplementation(async () =>
      delivery({ status: "failed", attempt_count: 1 })
    );
    repository.loadCurrentApplicationRecipient.mockImplementation(async () => recipient);
    sendSmsTemplate.mockImplementation(async () => undefined);
  });

  test("finds or creates one delivery and deduplicates an already existing event", async () => {
    const service = await createService();

    await service.deliver({
      applicationId: APPLICATION_ID,
      applicationVersion: 1,
      eventType: "submitted",
    });
    repository.findOrCreateDelivery.mockImplementationOnce(async () => ({
      delivery: delivery({ status: "sent", attempt_count: 1, sent_at: NOW }),
      created: false,
    }));
    await service.deliver({
      applicationId: APPLICATION_ID,
      applicationVersion: 1,
      eventType: "submitted",
    });

    expect(repository.findOrCreateDelivery).toHaveBeenNthCalledWith(1, {
      application_id: APPLICATION_ID,
      application_version: 1,
      event_type: "submitted",
      channel: "sms",
    });
    expect(sendSmsTemplate).toHaveBeenCalledTimes(1);
    expect(repository.markAttempting).toHaveBeenCalledWith({
      deliveryId: DELIVERY_ID,
      expectedAttemptCount: 0,
      maxAttempts: 3,
    });
  });

  test("resolves the current application recipient without persisting message data", async () => {
    const service = await createService();

    await service.deliver({
      applicationId: APPLICATION_ID,
      applicationVersion: 1,
      eventType: "submitted",
    });

    expect(repository.findOrCreateDelivery).toHaveBeenCalledWith({
      application_id: APPLICATION_ID,
      application_version: 1,
      event_type: "submitted",
      channel: "sms",
    });
    expect(repository.loadCurrentApplicationRecipient).toHaveBeenCalledWith(APPLICATION_ID);
    expect(sendSmsTemplate).toHaveBeenCalledWith({
      phone: recipient.admin_phone,
      templatePurpose: "tenant_onboarding_submitted",
      templateParam: {
        application_no: recipient.application_no,
        company_name: recipient.company_name,
      },
    });
    expect(repository.markSent).toHaveBeenCalledWith({
      deliveryId: DELIVERY_ID,
      sentAt: NOW,
    });
  });

  test.each([
    ["submitted", "tenant_onboarding_submitted"],
    ["supplement_required", "tenant_onboarding_supplement_required"],
    ["approved", "tenant_onboarding_approved"],
    ["rejected", "tenant_onboarding_rejected"],
  ] as const)("uses the dedicated %s SMS purpose", async (eventType, purpose) => {
    const service = await createService();

    await service.deliver({
      applicationId: APPLICATION_ID,
      applicationVersion: 2,
      eventType,
    });

    expect(sendSmsTemplate).toHaveBeenCalledWith(expect.objectContaining({
      templatePurpose: purpose,
    }));
  });

  test("writes a bounded sanitized failure and never propagates provider errors", async () => {
    sendSmsTemplate.mockImplementationOnce(async () => {
      const error = new Error(
        "provider body phone=13900139000 Authorization=Bearer-secret token=abc",
      ) as Error & { code: string };
      error.code = "SMS_CONFIG_MISSING";
      throw error;
    });
    const service = await createService();

    await expect(service.deliver({
      applicationId: APPLICATION_ID,
      applicationVersion: 1,
      eventType: "submitted",
    })).resolves.toBeDefined();

    const failure = repository.markFailed.mock.calls[0]?.[0];
    expect(failure).toEqual({
      deliveryId: DELIVERY_ID,
      lastError: "SMS_CONFIG_MISSING: 短信发送失败",
    });
    expect(JSON.stringify(failure)).not.toContain("13900139000");
    expect(JSON.stringify(failure)).not.toContain("Bearer-secret");
    expect(JSON.stringify(failure)).not.toContain("token=abc");
  });

  test("absorbs recipient and persistence failures without exposing provider state", async () => {
    repository.loadCurrentApplicationRecipient.mockImplementationOnce(async () => null);
    repository.markFailed.mockImplementationOnce(async () => {
      throw new Error("database unavailable");
    });
    const service = await createService();

    await expect(service.deliver({
      applicationId: APPLICATION_ID,
      applicationVersion: 1,
      eventType: "submitted",
    })).resolves.toBeDefined();
    expect(sendSmsTemplate).not.toHaveBeenCalled();
  });

  test("retries only a delivery belonging to the reviewed application", async () => {
    repository.findByIdAndApplication.mockImplementationOnce(async () => null);
    const service = await createService();

    await expect(service.retry({
      applicationId: APPLICATION_ID,
      deliveryId: DELIVERY_ID,
    })).rejects.toMatchObject({
      statusCode: 404,
      code: "TENANT_ONBOARDING_APPLICATION_NOT_FOUND",
    });
    expect(repository.findByIdAndApplication).toHaveBeenCalledWith(
      DELIVERY_ID,
      APPLICATION_ID,
    );
    expect(sendSmsTemplate).not.toHaveBeenCalled();
  });

  test("retries a failed delivery using the current application phone", async () => {
    const service = await createService();

    await service.retry({
      applicationId: APPLICATION_ID,
      deliveryId: DELIVERY_ID,
    });

    expect(repository.markAttempting).toHaveBeenCalledWith({
      deliveryId: DELIVERY_ID,
      expectedAttemptCount: 0,
      maxAttempts: 3,
    });
    expect(sendSmsTemplate).toHaveBeenCalledWith(expect.objectContaining({
      phone: recipient.admin_phone,
      templatePurpose: "tenant_onboarding_submitted",
    }));
  });

  test("does not send beyond the bounded delivery attempt limit", async () => {
    repository.findByIdAndApplication.mockImplementationOnce(async () =>
      delivery({ status: "failed", attempt_count: 3 })
    );
    repository.markAttempting.mockImplementationOnce(async () => null);
    const service = await createService(3);

    await expect(service.retry({
      applicationId: APPLICATION_ID,
      deliveryId: DELIVERY_ID,
    })).resolves.toMatchObject({ attempt_count: 3 });
    expect(sendSmsTemplate).not.toHaveBeenCalled();
  });
});

describe("tenant onboarding SMS template settings", () => {
  test("maps every event to provider-specific keys instead of verification templates", async () => {
    const { getTemplateConfigKey } = await import("./sms/legacy/config");
    const purposes = [
      "tenant_onboarding_submitted",
      "tenant_onboarding_supplement_required",
      "tenant_onboarding_approved",
      "tenant_onboarding_rejected",
    ] as const;

    for (const purpose of purposes) {
      const suffix = purpose.toUpperCase();
      expect(getTemplateConfigKey({ provider: "aliyun", purpose })).toBe(
        `ALIYUN_SMS_TEMPLATE_CODE_${suffix}`,
      );
      expect(getTemplateConfigKey({ provider: "tencent", purpose })).toBe(
        `TENCENT_SMS_TEMPLATE_ID_${suffix}`,
      );
    }
  });
});
