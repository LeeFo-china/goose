import { describe, expect, mock, test } from "bun:test";

import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { OrderRecord } from "@/repositories/platform-service-order-records";
import type {
  CancelableServiceOrderRecord,
  ServiceOrderCancellationResult,
} from "@/repositories/platform-service-order-cancellations";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "00000000-0000-4000-8000-000000000011";
const employeeId = "00000000-0000-4000-8000-000000000012";
const orderId = "00000000-0000-4000-8000-000000000301";
const configId = "00000000-0000-4000-8000-000000000401";
const idempotencyKey = "00000000-0000-4000-8000-000000000901";

const pendingOrder = {
  id: orderId,
  tenant_id: tenantId,
  order_no: "TSO202608100001",
  out_trade_no: "TSO202608100001",
  product_code: "platform_service_2y",
  product_snapshot: { pricing_version: 3 },
  term_years: 2,
  amount_fen: 1568000,
  payment_status: "pending",
  service_status: "waiting_payment",
  payment_config_id: configId,
  payment_config_guard_version: 7,
  payer_openid: "openid-user",
  prepay_id: "prepay-existing",
  transaction_id: null,
  payment_expires_at: "2026-08-10T12:05:00.000Z",
  paid_at: null,
  closed_at: null,
  terms_version: 1,
  version: 3,
  created_at: "2026-08-10T12:00:00.000Z",
  updated_at: "2026-08-10T12:00:00.000Z",
} satisfies OrderRecord;

const claimedOrder: CancelableServiceOrderRecord = {
  ...pendingOrder,
  cancel_idempotency_key: idempotencyKey,
  cancel_claim_expires_at: "2026-08-10T12:15:00.000Z",
  close_reason: "user_changed_product",
  closed_by_employee_id: employeeId,
};
const closedOrder: CancelableServiceOrderRecord = {
  ...claimedOrder,
  payment_status: "closed",
  closed_at: "2026-08-10T12:01:00.000Z",
  version: 4,
};
const paidOrder = {
  ...pendingOrder,
  payment_status: "paid",
  service_status: "waiting_assignment",
  transaction_id: "4200000000000000001",
  paid_at: "2026-08-10T12:00:30.000Z",
  version: 4,
};

const paymentConfig = {
  id: configId,
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-platform",
  sub_app_id: null,
  encrypted_config_ref: "secret://wechat",
  secret_bundle_revision: "secret-rev-1",
  serial_no: "SERIAL",
  notify_url: "https://api.example.com/wechat/pay/callback",
  enabled_channels: ["platform_service"],
  status: "active",
  validation_status: "valid",
  recharge_guard_version: 7,
  last_validated_at: null,
  risk_switches: {},
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-08-03T00:00:00.000Z",
  updated_at: "2026-08-03T00:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const secretBundle = {
  privateKeyPem: "private-key",
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: null,
  wechatPayPublicKeyPem: null,
  baseUrl: "https://api.mch.weixin.qq.com",
  revision: "secret-rev-1",
};

function queryPayload(tradeState: "NOTPAY" | "CLOSED" | "SUCCESS") {
  return {
    appid: "wx-platform",
    mchid: "1900000001",
    out_trade_no: pendingOrder.out_trade_no,
    trade_state: tradeState,
    trade_state_desc: tradeState,
    ...(tradeState === "SUCCESS" ? {
      transaction_id: "4200000000000000001",
      success_time: "2026-08-10T12:00:30+00:00",
      amount: { total: pendingOrder.amount_fen, currency: "CNY" },
    } : {}),
    requestId: "wechat-request-id",
  };
}

function harness(order: CancelableServiceOrderRecord = claimedOrder) {
  const operations: string[] = [];
  const repository = {
    claim: mock(async (): Promise<ServiceOrderCancellationResult> => {
      operations.push("claim");
      return { idempotent: false, claimed: true, order };
    }),
    finalize: mock(async (): Promise<ServiceOrderCancellationResult> => {
      operations.push("finalize");
      return { idempotent: false, claimed: false, order: closedOrder };
    }),
  };
  const wechatPayGateway = {
    queryTransactionByOutTradeNo: mock(async () => {
      operations.push("query");
      return queryPayload("NOTPAY");
    }),
    closeTransactionByOutTradeNo: mock(async () => {
      operations.push("close");
    }),
  };
  return {
    operations,
    dependencies: {
      repository,
      paymentConfigRepository: {
        findWechatPayConfigById: mock(async () => paymentConfig),
      },
      secretBundleService: { load: mock(async () => secretBundle) },
      wechatPayGateway,
      paymentConfirmation: {
        confirm: mock(async () => ({
          order: paidOrder,
          work_order: { id: "work-order-1" },
          access_mode: null,
          idempotent: true,
        })),
      },
      nowFactory: () => new Date("2026-08-10T12:01:00.000Z"),
    },
  };
}

const request = {
  idempotency_key: idempotencyKey,
  expected_version: 3,
  reason: "user_changed_product" as const,
};

async function cancel(dependencies: ReturnType<typeof harness>["dependencies"]) {
  const { cancelTenantPlatformServiceOrder } = await import(
    "./tenant-platform-service-order-cancellation"
  );
  return cancelTenantPlatformServiceOrder({
    dependencies,
    tenantId,
    employeeId,
    orderId,
    request,
  });
}

describe("cancelTenantPlatformServiceOrder", () => {
  test("claims before querying WeChat and finalizes only after CLOSED", async () => {
    const { dependencies, operations } = harness();
    dependencies.wechatPayGateway.queryTransactionByOutTradeNo
      .mockImplementationOnce(async () => {
        operations.push("query");
        return queryPayload("NOTPAY");
      })
      .mockImplementationOnce(async () => {
        operations.push("query");
        return queryPayload("CLOSED");
      });

    const result = await cancel(dependencies);

    expect(operations).toEqual(["claim", "query", "close", "query", "finalize"]);
    expect(dependencies.repository.finalize).toHaveBeenCalledWith({
      tenantId,
      orderId,
      expectedVersion: 3,
      idempotencyKey,
      requireMissingPrepay: false,
    });
    expect(result.order.payment_status).toBe("closed");
  });

  test("returns an already closed claimed order without calling WeChat", async () => {
    const { dependencies } = harness(closedOrder);
    const result = await cancel(dependencies);
    expect(result.idempotent).toBe(true);
    expect(dependencies.wechatPayGateway.queryTransactionByOutTradeNo).not
      .toHaveBeenCalled();
  });

  test("stops before WeChat when the idempotency claim conflicts", async () => {
    const { dependencies } = harness();
    dependencies.repository.claim.mockImplementationOnce(async () => ({
      idempotent: false,
      claimed: false,
      order: null,
      errorCode: "SERVICE_ORDER_IDEMPOTENCY_CONFLICT",
    }));
    await expect(cancel(dependencies)).rejects.toMatchObject({
      code: "SERVICE_ORDER_IDEMPOTENCY_CONFLICT",
    });
    expect(dependencies.wechatPayGateway.queryTransactionByOutTradeNo).not
      .toHaveBeenCalled();
  });

  test("uses a missing-prepay database guard for ORDER_NOT_EXIST", async () => {
    const { dependencies } = harness({ ...claimedOrder, prepay_id: null });
    dependencies.wechatPayGateway.queryTransactionByOutTradeNo
      .mockImplementationOnce(async () => {
        throw {
          code: "WECHAT_PAY_TRANSACTION_QUERY_FAILED",
          details: { status: 404, code: "ORDER_NOT_EXIST" },
        };
      });
    await cancel(dependencies);
    expect(dependencies.repository.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ requireMissingPrepay: true }),
    );
  });

  test("does not finalize when successful close still queries as NOTPAY", async () => {
    const { dependencies } = harness();
    await expect(cancel(dependencies)).rejects.toMatchObject({
      code: "SERVICE_ORDER_CANCEL_WECHAT_UNCERTAIN",
    });
    expect(dependencies.repository.finalize).not.toHaveBeenCalled();
  });

  test("recovers a successful WeChat payment and rejects cancellation", async () => {
    const { dependencies } = harness();
    dependencies.wechatPayGateway.queryTransactionByOutTradeNo
      .mockImplementationOnce(async () => queryPayload("SUCCESS"));
    await expect(cancel(dependencies)).rejects.toMatchObject({
      code: "SERVICE_ORDER_ALREADY_PAID",
    });
    expect(dependencies.paymentConfirmation.confirm).toHaveBeenCalledTimes(1);
    expect(dependencies.repository.finalize).not.toHaveBeenCalled();
  });
});

describe("TenantPlatformServiceOrderCancellationService", () => {
  test("requires tenant create permission before claiming cancellation", async () => {
    const { dependencies } = harness();
    const { TenantPlatformServiceOrderCancellationService } = await import(
      "./tenant-platform-service-order-cancellation"
    );
    const service = new TenantPlatformServiceOrderCancellationService(
      dependencies,
      {
        assertTenantContext: () => tenantId,
        hasPermission: () => false,
      },
    );
    await expect(service.cancel({ employeeId } as AuthContext, orderId, request))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(dependencies.repository.claim).not.toHaveBeenCalled();
  });
});
