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
const CLAIM_TOKEN = "00000000-0000-4000-8000-000000000601";
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
    claim_token: overrides.claim_token === undefined ? null : overrides.claim_token,
    claim_expires_at: overrides.claim_expires_at === undefined
      ? null
      : overrides.claim_expires_at,
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
  claimDelivery: mock(async () => delivery({
    status: "processing", attempt_count: 1, claim_token: CLAIM_TOKEN,
    claim_expires_at: "2026-07-14T08:02:00.000Z",
  }) as TenantOnboardingNotificationDeliveryRecord | null),
  finalizeSent: mock(async (): Promise<TenantOnboardingNotificationDeliveryRecord | null> =>
    delivery({ status: "sent", attempt_count: 1, sent_at: NOW })
  ),
  finalizeFailed: mock(async (_input: {
    deliveryId: string; applicationId: string; claimToken: string; lastError: string;
  }) =>
    delivery({ status: "failed", attempt_count: 1 }) as TenantOnboardingNotificationDeliveryRecord | null
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
    repository.claimDelivery.mockImplementation(async () =>
      delivery({
        status: "processing", attempt_count: 1, claim_token: CLAIM_TOKEN,
        claim_expires_at: "2026-07-14T08:02:00.000Z",
      })
    );
    repository.finalizeSent.mockImplementation(async () =>
      delivery({ status: "sent", attempt_count: 1, sent_at: NOW })
    );
    repository.finalizeFailed.mockImplementation(async () =>
      delivery({ status: "failed", attempt_count: 1 })
    );
    repository.loadCurrentApplicationRecipient.mockImplementation(async () => recipient);
    sendSmsTemplate.mockImplementation(async () => undefined);
  });

  test("finds or creates one delivery and no-ops an already sent event", async () => {
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
    expect(repository.claimDelivery).toHaveBeenCalledWith({
      deliveryId: DELIVERY_ID,
      applicationId: APPLICATION_ID,
      maxAttempts: 3,
      leaseSeconds: 120,
      now: NOW,
    });
  });

  test("resumes an existing pending delivery through the lease claim", async () => {
    repository.findOrCreateDelivery.mockImplementationOnce(async () => ({
      delivery: delivery(), created: false,
    }));
    const service = await createService();

    await service.deliver({
      applicationId: APPLICATION_ID,
      applicationVersion: 1,
      eventType: "submitted",
    });

    expect(repository.claimDelivery).toHaveBeenCalledTimes(1);
    expect(sendSmsTemplate).toHaveBeenCalledTimes(1);
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
    expect(repository.finalizeSent).toHaveBeenCalledWith({
      deliveryId: DELIVERY_ID,
      applicationId: APPLICATION_ID,
      claimToken: CLAIM_TOKEN,
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

    const failure = repository.finalizeFailed.mock.calls[0]?.[0];
    expect(failure).toEqual({
      deliveryId: DELIVERY_ID,
      applicationId: APPLICATION_ID,
      claimToken: CLAIM_TOKEN,
      lastError: "SMS_CONFIG_MISSING: 短信发送失败",
    });
    expect(JSON.stringify(failure)).not.toContain("13900139000");
    expect(JSON.stringify(failure)).not.toContain("Bearer-secret");
    expect(JSON.stringify(failure)).not.toContain("token=abc");
  });

  test("absorbs recipient and persistence failures without exposing provider state", async () => {
    repository.loadCurrentApplicationRecipient.mockImplementationOnce(async () => null);
    repository.finalizeFailed.mockImplementationOnce(async () => {
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

  test("never marks a successful provider send failed when sent finalization is uncertain", async () => {
    repository.finalizeSent.mockImplementationOnce(async () => null);
    repository.findByIdAndApplication.mockImplementationOnce(async () =>
      delivery({ status: "sent", attempt_count: 1, sent_at: NOW })
    );
    const service = await createService();

    const result = await service.deliver({
      applicationId: APPLICATION_ID,
      applicationVersion: 1,
      eventType: "submitted",
    });

    expect(result).toMatchObject({ status: "sent" });
    expect(repository.finalizeFailed).not.toHaveBeenCalled();
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

    expect(repository.claimDelivery).toHaveBeenCalledWith({
      deliveryId: DELIVERY_ID,
      applicationId: APPLICATION_ID,
      maxAttempts: 3,
      leaseSeconds: 120,
      now: NOW,
    });
    expect(sendSmsTemplate).toHaveBeenCalledWith(expect.objectContaining({
      phone: recipient.admin_phone,
      templatePurpose: "tenant_onboarding_submitted",
    }));
  });

  test("does not send beyond the bounded delivery attempt limit", async () => {
    repository.findByIdAndApplication.mockImplementation(async () =>
      delivery({ status: "failed", attempt_count: 3 })
    );
    repository.claimDelivery.mockImplementationOnce(async () => null);
    const service = await createService(3);

    await expect(service.retry({
      applicationId: APPLICATION_ID,
      deliveryId: DELIVERY_ID,
    })).resolves.toMatchObject({ attempt_count: 3 });
    expect(repository.findByIdAndApplication).toHaveBeenCalledTimes(2);
    expect(sendSmsTemplate).not.toHaveBeenCalled();
  });

  test("reloads an exhausted expired lease as failed instead of returning stale processing", async () => {
    const processing = delivery({
      status: "processing", attempt_count: 3, claim_token: CLAIM_TOKEN,
      claim_expires_at: "2026-07-14T07:59:59.000Z",
    });
    const exhausted = delivery({
      status: "failed", attempt_count: 3, claim_token: null,
      claim_expires_at: null,
      last_error: "TENANT_ONBOARDING_NOTIFICATION_ATTEMPTS_EXHAUSTED",
    });
    repository.findByIdAndApplication
      .mockImplementationOnce(async () => processing)
      .mockImplementationOnce(async () => exhausted);
    repository.claimDelivery.mockImplementationOnce(async () => null);
    const service = await createService(3);

    const result = await service.retry({
      applicationId: APPLICATION_ID,
      deliveryId: DELIVERY_ID,
    });

    expect(result).toEqual(exhausted);
    expect(repository.findByIdAndApplication).toHaveBeenCalledTimes(2);
    expect(sendSmsTemplate).not.toHaveBeenCalled();
    expect(repository.finalizeSent).not.toHaveBeenCalled();
    expect(repository.finalizeFailed).not.toHaveBeenCalled();
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
