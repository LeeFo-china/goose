import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { TenantCreditWechatNotificationRecord } from "@/repositories/billing-recharge";
import type { PlatformBillingRechargeOrderListItem } from "@/repositories/platform-billing-recharge";
import type { AuthContext } from "@/services/authorization";
import { PlatformBillingRechargeCompensationService } from "./platform-billing-recharge-compensation";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const paidOrder = {
  id: "order-paid-1",
  tenant_id: "tenant-1",
  order_no: "TC202607020001",
  idempotency_key: "idem-1",
  package_code: "credit_1000",
  credits: 1000,
  amount_fen: 10000,
  bonus_credits: 100,
  channel: "wechat_pay",
  status: "paid",
  paid_at: "2026-07-02T08:05:00.000Z",
  created_by: "employee-1",
  remark: null,
  metadata: {},
  payment_config_id: "platform-config-1",
  out_trade_no: "TC202607020001",
  prepay_id: "prepay-1",
  transaction_id: "4200000000202607020000000001",
  paid_amount_fen: 10000,
  closed_at: null,
  latest_notification_id: "notification-old-1",
  created_at: "2026-07-02T08:01:00.000Z",
  updated_at: "2026-07-02T08:05:00.000Z",
  tenant: { id: "tenant-1", name: "测试租户", slug: "test-tenant" },
} satisfies PlatformBillingRechargeOrderListItem;

const authContext = {
  authUserId: "auth-platform",
  employeeId: "employee-platform",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台超管",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [],
} satisfies AuthContext;

const atomicResult = {
  order: paidOrder,
  account: { id: "account-1" },
  ledger: { id: "ledger-1" },
  recovery: { recovered: true },
  idempotent: true,
};
const notification = {
  id: "notification-old-1",
  tenant_id: "tenant-1",
  credit_order_id: paidOrder.id,
  notify_id: "notify-old-1",
  event_type: "TRANSACTION.SUCCESS",
  resource_type: "encrypt-resource",
  raw_payload: {},
  signature_valid: true,
  processed: true,
  processed_at: paidOrder.paid_at,
  error_message: null,
  created_at: paidOrder.paid_at,
  updated_at: paidOrder.paid_at,
} satisfies TenantCreditWechatNotificationRecord;
const findOrderById = mock(
  async (): Promise<PlatformBillingRechargeOrderListItem | null> => paidOrder,
);
const findWechatNotificationByNotifyId = mock(async () => null);
const createWechatNotification = mock(async () => {
  throw new Error("paid recovery must not create a notification");
});
const markWechatNotificationProcessed = mock(async () => notification);
const markWechatNotificationFailed = mock(async () => notification);
const confirmWechatRecharge = mock(async () => atomicResult);
const findWechatPayConfig = mock(async () => null);
const loadSecretBundle = mock(async () => {
  throw new Error("paid recovery must not load payment secrets");
});
const queryTransactionByOutTradeNo = mock(async () => {
  throw new Error("paid recovery must not query WeChat");
});
const recordBestEffort = mock(async () => null);

function createService() {
  return new PlatformBillingRechargeCompensationService({
    repository: { findOrderById },
    rechargeRepository: {
      findWechatNotificationByNotifyId,
      createWechatNotification,
      markWechatNotificationProcessed,
      markWechatNotificationFailed,
      confirmWechatRecharge,
    },
    paymentConfigRepository: { findWechatPayConfig },
    secretBundleService: { load: loadSecretBundle },
    wechatPayGateway: { queryTransactionByOutTradeNo },
    auditLogService: { recordBestEffort },
  });
}

describe("PlatformBillingRechargeCompensationService paid recovery", () => {
  beforeEach(() => {
    for (const fn of [
      findOrderById,
      findWechatNotificationByNotifyId,
      createWechatNotification,
      markWechatNotificationProcessed,
      markWechatNotificationFailed,
      confirmWechatRecharge,
      findWechatPayConfig,
      loadSecretBundle,
      queryTransactionByOutTradeNo,
      recordBestEffort,
    ]) fn.mockClear();
    findOrderById.mockImplementation(async () => paidOrder);
    confirmWechatRecharge.mockImplementation(async () => atomicResult);
  });

  test("retries atomic subscription recovery from stored paid fields", async () => {
    const service = createService();

    const result = await service.compensateWechatOrder(
      authContext,
      paidOrder.id,
      { reason: "恢复历史订阅" },
    );

    expect(confirmWechatRecharge).toHaveBeenCalledWith({
      orderId: paidOrder.id,
      transactionId: paidOrder.transaction_id,
      paidAmountFen: paidOrder.paid_amount_fen,
      paidAt: paidOrder.paid_at,
      notificationId: paidOrder.latest_notification_id,
      metadata: {
        compensation_source: "platform_paid_recovery",
        compensation_actor_employee_id: authContext.employeeId,
        out_trade_no: paidOrder.out_trade_no,
      },
    });
    expect(findWechatPayConfig).not.toHaveBeenCalled();
    expect(loadSecretBundle).not.toHaveBeenCalled();
    expect(queryTransactionByOutTradeNo).not.toHaveBeenCalled();
    expect(markWechatNotificationProcessed).not.toHaveBeenCalled();
    expect(markWechatNotificationFailed).not.toHaveBeenCalled();
    expect(recordBestEffort).toHaveBeenCalledWith(expect.objectContaining({
      status: "success",
      resourceId: paidOrder.id,
    }));
    expect(result).toMatchObject({
      compensated: false,
      already_paid: true,
      result: atomicResult,
    });
  });

  test("audits and propagates an atomic paid recovery failure", async () => {
    confirmWechatRecharge.mockImplementationOnce(async () => {
      throw new Error("atomic recovery failed");
    });
    const service = createService();

    await expect(
      service.compensateWechatOrder(authContext, paidOrder.id),
    ).rejects.toThrow("atomic recovery failed");

    expect(recordBestEffort).toHaveBeenCalledWith(expect.objectContaining({
      status: "failure",
      metadata: expect.objectContaining({
        error_message: "atomic recovery failed",
      }),
    }));
    expect(markWechatNotificationProcessed).not.toHaveBeenCalled();
    expect(markWechatNotificationFailed).not.toHaveBeenCalled();
    expect(queryTransactionByOutTradeNo).not.toHaveBeenCalled();
  });

  test("rejects a paid order without its stored transaction id", async () => {
    findOrderById.mockImplementationOnce(async () => ({
      ...paidOrder,
      transaction_id: null,
    }));
    const service = createService();

    await expect(
      service.compensateWechatOrder(authContext, paidOrder.id),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "BILLING_RECHARGE_TRANSACTION_ID_REQUIRED",
    });

    expect(confirmWechatRecharge).not.toHaveBeenCalled();
    expect(recordBestEffort).toHaveBeenCalledWith(expect.objectContaining({
      status: "failure",
    }));
    expect(queryTransactionByOutTradeNo).not.toHaveBeenCalled();
  });
});
