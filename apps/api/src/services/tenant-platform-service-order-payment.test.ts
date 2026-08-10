import { describe, expect, mock, test } from "bun:test";

import type { OrderRecord } from "@/repositories/platform-service-order-records";

describe("createServiceOrderPaymentRequest", () => {
  test("does not create or reuse prepay after cancellation is claimed", async () => {
    const { createServiceOrderPaymentRequest } = await import(
      "./tenant-platform-service-order-payment"
    );
    const order = {
      id: "order-1",
      order_no: "TSO1",
      product_code: "platform_service_1y",
      term_years: 1,
      amount_fen: 980000,
      payment_status: "pending",
      service_status: "waiting_payment",
      prepay_id: "prepay-existing",
      payment_expires_at: "2026-08-11T00:00:00.000Z",
      paid_at: null,
      closed_at: null,
      terms_version: 1,
      version: 1,
      created_at: "2026-08-10T00:00:00.000Z",
      updated_at: "2026-08-10T00:00:00.000Z",
      cancel_idempotency_key: "00000000-0000-4000-8000-000000000001",
    } satisfies OrderRecord & { cancel_idempotency_key: string };
    const createJsapiPrepay = mock(async () => {
      throw new Error("must not be called");
    });
    const createMiniProgramPaymentRequest = mock(() => ({
      timeStamp: "1",
      nonceStr: "nonce",
      package: "prepay_id=prepay-existing",
      signType: "RSA" as const,
      paySign: "signature",
    }));

    await expect(createServiceOrderPaymentRequest({
      repository: { markPrepayCreated: mock(async () => null) },
      paymentConfigRepository: {
        findWechatPayConfigById: mock(async () => null),
      },
      secretBundleService: { load: mock(async () => ({} as never)) },
      wechatPayGateway: {
        createJsapiPrepay,
        createMiniProgramPaymentRequest,
      },
      secretBundleMatcher: mock(() => ({} as never)),
      nowFactory: () => new Date("2026-08-10T12:00:00.000Z"),
    }, order, "1 年技术服务", false)).rejects.toMatchObject({
      code: "SERVICE_ORDER_CANCEL_IN_PROGRESS",
    });
    expect(createJsapiPrepay).not.toHaveBeenCalled();
    expect(createMiniProgramPaymentRequest).not.toHaveBeenCalled();
  });

  test("returns a state-change conflict when prepay persistence loses the race", async () => {
    const { createServiceOrderPaymentRequest } = await import(
      "./tenant-platform-service-order-payment"
    );
    const order = {
      id: "order-2",
      order_no: "TSO2",
      product_code: "platform_service_1y",
      term_years: 1,
      amount_fen: 980000,
      payment_status: "pending",
      service_status: "waiting_payment",
      prepay_id: null,
      payment_config_id: "config-1",
      payment_config_guard_version: 1,
      payer_openid: "openid-1",
      product_snapshot: {},
      payment_expires_at: "2026-08-11T00:00:00.000Z",
      paid_at: null,
      closed_at: null,
      terms_version: 1,
      version: 1,
      created_at: "2026-08-10T00:00:00.000Z",
      updated_at: "2026-08-10T00:00:00.000Z",
    } satisfies OrderRecord;

    await expect(createServiceOrderPaymentRequest({
      repository: { markPrepayCreated: mock(async () => null) },
      paymentConfigRepository: {
        findWechatPayConfigById: mock(async () => ({
          id: "config-1",
          provider: "wechat_pay",
          profile_code: "platform_direct_recharge",
          principal_type: "platform",
          merchant_mode: "direct_merchant",
          merchant_name: "平台商户",
          merchant_id: "1900000001",
          sub_merchant_id: null,
          app_id: "wx-platform",
          sub_app_id: null,
          encrypted_config_ref: "secret://test",
          secret_bundle_revision: "rev-1",
          serial_no: "SERIAL",
          notify_url: "https://example.test/notify",
          enabled_channels: ["platform_service"],
          status: "active",
          validation_status: "valid",
          recharge_guard_version: 1,
          last_validated_at: null,
          risk_switches: {},
          created_by_employee_id: null,
          updated_by_employee_id: null,
          created_at: "2026-08-10T00:00:00.000Z",
          updated_at: "2026-08-10T00:00:00.000Z",
        } as never)),
      },
      secretBundleService: { load: mock(async () => ({} as never)) },
      wechatPayGateway: {
        createJsapiPrepay: mock(async () => ({
          prepayId: "prepay-new",
          paymentRequest: {} as never,
        })),
        createMiniProgramPaymentRequest: mock(() => ({} as never)),
      },
      secretBundleMatcher: mock(() => ({} as never)),
      nowFactory: () => new Date("2026-08-10T12:00:00.000Z"),
    }, order, "1 年技术服务", false)).rejects.toMatchObject({
      code: "SERVICE_ORDER_PAYMENT_STATE_CHANGED",
      statusCode: 409,
    });
  });
});
