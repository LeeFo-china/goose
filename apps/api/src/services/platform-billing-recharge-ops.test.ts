import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  CreditRechargeProductRecord,
  TenantCreditWechatNotificationRecord,
} from "@/repositories/billing-recharge";
import type {
  PlatformBillingRechargeOrderListItem,
  PlatformRechargeProductCreateRecordInput,
} from "@/repositories/platform-billing-recharge";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const product = {
  id: "00000000-0000-4000-8000-000000000001",
  code: "credit_1000",
  title: "体验包",
  amount_fen: 10000,
  credits: 1000,
  bonus_credits: 0,
  enabled: true,
  sort_order: 10,
  metadata: {},
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
  created_at: "2026-07-02T08:00:00.000Z",
  updated_at: "2026-07-02T08:00:00.000Z",
} satisfies CreditRechargeProductRecord;

const order = {
  id: "order-1",
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
  latest_notification_id: "notification-1",
  created_at: "2026-07-02T08:01:00.000Z",
  updated_at: "2026-07-02T08:05:00.000Z",
  tenant: { id: "tenant-1", name: "固始晴天装饰", slug: "qingtian" },
} satisfies PlatformBillingRechargeOrderListItem;

const creditNotification = {
  id: "notification-1",
  tenant_id: "tenant-1",
  credit_order_id: "order-1",
  notify_id: "query-compensation:4200000000202607020000000001",
  event_type: "TRANSACTION.SUCCESS",
  resource_type: "wechatpay-query",
  raw_payload: {},
  signature_valid: true,
  processed: true,
  processed_at: "2026-07-02T08:06:00.000Z",
  error_message: null,
  created_at: "2026-07-02T08:06:00.000Z",
  updated_at: "2026-07-02T08:06:00.000Z",
} satisfies TenantCreditWechatNotificationRecord;

const auditLog = {
  id: "audit-1",
  action: "platform_billing_recharge",
  actor_employee_id: "employee-platform",
  actor_user_id: "auth-platform",
  target_tenant_id: "tenant-1",
  resource_type: "tenant_credit_order",
  resource_id: "order-1",
  resource_label: "TC202607020001",
  status: "success",
  summary: "微信支付查单确认积分充值入账",
  metadata: { out_trade_no: "TC202607020001" },
  created_at: "2026-07-02T08:07:00.000Z",
};

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
  roleCodes: ["platform_admin"],
  roles: [],
  permissions: [
    { code: "platform.billing.read", scope: "all" },
    { code: "platform.billing.recharge_product.manage", scope: "all" },
  ],
} satisfies AuthContext;

const repository = {
  listProducts: mock(async () => ({
    list: [product],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  createProduct: mock(async () => product),
  updateProduct: mock(async () => product),
  upsertProducts: mock(async (_input: PlatformRechargeProductCreateRecordInput[]) => [
    product,
    { ...product, id: "00000000-0000-4000-8000-000000000002", code: "credit_3000", title: "标准包" },
    { ...product, id: "00000000-0000-4000-8000-000000000003", code: "credit_5000", title: "成长包" },
    { ...product, id: "00000000-0000-4000-8000-000000000004", code: "credit_10000", title: "专业包" },
    { ...product, id: "00000000-0000-4000-8000-000000000005", code: "credit_30000", title: "企业包" },
  ]),
  listOrders: mock(async () => ({
    list: [order],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  findOrderById: mock(async () => order),
  listNotificationsByOrderId: mock(async () => [creditNotification]),
  listAuditLogsByOrderId: mock(async () => [auditLog]),
};

async function createService() {
  const { PlatformBillingRechargeService } = await import("./platform-billing-recharge");
  return new PlatformBillingRechargeService({
    repository,
    compensationService: {
      compensateWechatOrder: mock(async () => ({
        compensated: false,
        already_paid: false,
        trade_state: "NOTPAY" as const,
        order_id: "order-1",
        out_trade_no: "TC202607020001",
        transaction_id: null,
        notification_id: null,
        result: null,
      })),
    },
  });
}

describe("PlatformBillingRechargeService ops", () => {
  beforeEach(() => {
    for (const fn of Object.values(repository)) fn.mockClear();
  });

  test("applies recommended recharge products with operator metadata", async () => {
    const service = await createService();

    const result = await service.applyRecommendedProducts(authContext);

    const products = repository.upsertProducts.mock.calls[0]?.[0] ?? [];
    expect(products).toHaveLength(5);
    expect(products.map((item) => item.code)).toEqual([
      "credit_1000",
      "credit_3000",
      "credit_5000",
      "credit_10000",
      "credit_30000",
    ]);
    expect(products[1]).toMatchObject({
      title: "标准包",
      amount_fen: 30000,
      credits: 3000,
      bonus_credits: 300,
      enabled: true,
      sort_order: 20,
      updated_by_employee_id: "employee-platform",
      metadata: { badge: "推荐", template: "recommended_v1" },
    });
    expect(result.list).toHaveLength(5);
  });

  test("gets platform recharge order detail with notifications and audit logs", async () => {
    const service = await createService();

    const result = await service.getOrderDetail(authContext, order.id);

    expect(repository.findOrderById).toHaveBeenCalledWith(order.id);
    expect(repository.listNotificationsByOrderId).toHaveBeenCalledWith(order.id);
    expect(repository.listAuditLogsByOrderId).toHaveBeenCalledWith(order.id);
    expect(result).toEqual({
      order,
      notifications: [creditNotification],
      audit_logs: [auditLog],
    });
  });
});
