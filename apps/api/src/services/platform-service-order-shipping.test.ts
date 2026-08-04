import { describe, expect, mock, test } from "bun:test";
import type { OrderRecord } from "@/repositories/platform-service-order-records";
import type {
  OrderShippingReportRecord,
} from "@/repositories/platform-service-order-shipping-reports";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "00000000-0000-4000-8000-000000000011";
const orderId = "00000000-0000-4000-8000-000000000301";
const reportId = "00000000-0000-4000-8000-000000000901";
const attemptKey = "00000000-0000-4000-8000-000000000902";
const now = new Date("2026-08-04T06:30:00.000Z");

const acceptedOrder = {
  id: orderId,
  tenant_id: tenantId,
  order_no: "TSO202608040001",
  out_trade_no: "TSO202608040001",
  product_code: "platform_service_1y",
  term_years: 1,
  amount_fen: 980000,
  payment_status: "paid",
  service_status: "accepted",
  payer_openid: "openid-tenant-employee",
  transaction_id: "4200000000202608040000000001",
  product_snapshot: { title: "平台年度技术服务" },
  prepay_id: "prepay-existing",
  payment_expires_at: "2026-08-04T12:05:00.000Z",
  paid_at: "2026-08-04T12:10:00.000Z",
  closed_at: null,
  terms_version: 1,
  version: 5,
  created_at: "2026-08-04T12:00:00.000Z",
  updated_at: "2026-08-04T12:40:00.000Z",
} satisfies OrderRecord;

const pendingReport: OrderShippingReportRecord = {
  id: reportId,
  tenant_id: tenantId,
  service_order_id: orderId,
  source: "tenant_acceptance",
  status: "pending",
  attempt_count: 1,
  last_attempt_key: attemptKey,
  request_payload: {},
  wechat_errcode: null,
  wechat_errmsg: null,
  provider_request_id: null,
  last_attempt_at: now.toISOString(),
  succeeded_at: null,
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
};

function createDependencies() {
  return {
    repository: {
      beginOrderShippingReportAttempt: mock(async () => pendingReport),
      finishOrderShippingReportAttempt: mock(async (input: {
        status: "succeeded" | "failed";
      }) => ({
        ...pendingReport,
        status: input.status,
        succeeded_at: input.status === "succeeded" ? now.toISOString() : null,
      })),
    },
    gateway: {
      uploadShippingInfo: mock(async () => ({
        wechat_errcode: 0,
        wechat_errmsg: "ok",
      })),
    },
    nowFactory: () => now,
    attemptKeyFactory: () => attemptKey,
  };
}

describe("PlatformServiceOrderShippingService", () => {
  test("uploads accepted paid platform service orders as no-physical-delivery shipping", async () => {
    const { PlatformServiceOrderShippingService } = await import(
      "./platform-service-order-shipping"
    );
    const dependencies = createDependencies();
    const service = new PlatformServiceOrderShippingService(dependencies);

    const result = await service.reportAcceptedOrder({
      order: acceptedOrder,
      source: "tenant_acceptance",
    });

    expect(dependencies.repository.beginOrderShippingReportAttempt)
      .toHaveBeenCalledWith({
        tenantId,
        serviceOrderId: orderId,
        source: "tenant_acceptance",
        attemptKey,
        requestPayload: {
          order_key: {
            order_number_type: 2,
            transaction_id: "4200000000202608040000000001",
          },
          logistics_type: 3,
          delivery_mode: 1,
          shipping_list: [{
            item_desc: "客户专属系统环境已部署，服务器配置及首次操作培训已完成",
          }],
          upload_time: "2026-08-04T06:30:00.000Z",
          payer: { openid: "openid-tenant-employee" },
        },
        attemptedAt: "2026-08-04T06:30:00.000Z",
      });
    expect(dependencies.gateway.uploadShippingInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        logistics_type: 3,
        delivery_mode: 1,
        payer: { openid: "openid-tenant-employee" },
      }),
    );
    expect(dependencies.repository.finishOrderShippingReportAttempt)
      .toHaveBeenCalledWith({
        reportId,
        attemptKey,
        status: "succeeded",
        wechatErrcode: 0,
        wechatErrmsg: "ok",
        providerRequestId: null,
        finishedAt: "2026-08-04T06:30:00.000Z",
      });
    expect(result).toMatchObject({
      status: "succeeded",
      idempotent: false,
    });
  });

  test("does not call WeChat again when the shipping report already succeeded", async () => {
    const { PlatformServiceOrderShippingService } = await import(
      "./platform-service-order-shipping"
    );
    const dependencies = createDependencies();
    dependencies.repository.beginOrderShippingReportAttempt.mockImplementationOnce(
      async () => ({ ...pendingReport, status: "succeeded" }),
    );
    const service = new PlatformServiceOrderShippingService(dependencies);

    const result = await service.reportAcceptedOrder({
      order: acceptedOrder,
      source: "tenant_acceptance",
    });

    expect(dependencies.gateway.uploadShippingInfo).not.toHaveBeenCalled();
    expect(dependencies.repository.finishOrderShippingReportAttempt)
      .not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "succeeded",
      idempotent: true,
    });
  });

  test("records a failed WeChat upload attempt without throwing to the caller", async () => {
    const { PlatformServiceOrderShippingService } = await import(
      "./platform-service-order-shipping"
    );
    const dependencies = createDependencies();
    dependencies.gateway.uploadShippingInfo.mockImplementationOnce(async () => {
      const error = Object.assign(new Error("provider private detail"), {
        code: "WECHAT_ORDER_SHIPPING_UPLOAD_REJECTED",
        details: { wechatErrcode: 10060004 },
      });
      throw error;
    });
    const service = new PlatformServiceOrderShippingService(dependencies);

    const result = await service.reportAcceptedOrder({
      order: acceptedOrder,
      source: "tenant_acceptance",
    });

    expect(dependencies.repository.finishOrderShippingReportAttempt)
      .toHaveBeenCalledWith(expect.objectContaining({
        reportId,
        attemptKey,
        status: "failed",
        wechatErrcode: 10060004,
        wechatErrmsg: "WECHAT_ORDER_SHIPPING_UPLOAD_REJECTED",
      }));
    expect(result).toMatchObject({
      status: "failed",
      idempotent: false,
      error_code: "WECHAT_ORDER_SHIPPING_UPLOAD_REJECTED",
    });
  });
});
