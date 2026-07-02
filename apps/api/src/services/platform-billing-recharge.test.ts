import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { CreditRechargeProductRecord, TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type { PlatformBillingRechargeOrderListItem } from "@/repositories/platform-billing-recharge";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const product = {
  id: "00000000-0000-4000-8000-000000000001",
  code: "credit_1000",
  title: "1000 积分",
  amount_fen: 10000,
  credits: 1000,
  bonus_credits: 100,
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

const platformRole = {
  id: "role-platform",
  code: "platform_admin",
  name: "平台超管",
  description: null,
  status: "active",
} satisfies AuthContext["roles"][number];

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
  roles: [platformRole],
  permissions: [{ code: "platform.billing.recharge_product.manage", scope: "all" }],
} satisfies AuthContext;

const repository = {
  listProducts: mock(async () => ({
    list: [product],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  createProduct: mock(async () => product),
  updateProduct: mock(async () => ({ ...product, enabled: false })),
  listOrders: mock(async () => ({
    list: [order],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
};

async function createService() {
  const { PlatformBillingRechargeService } = await import("./platform-billing-recharge");
  return new PlatformBillingRechargeService({ repository });
}

describe("PlatformBillingRechargeService", () => {
  beforeEach(() => {
    for (const fn of Object.values(repository)) fn.mockClear();
  });

  test("lists recharge products for platform admins", async () => {
    const service = await createService();

    const result = await service.listProducts(authContext, {
      page: 1,
      pageSize: 20,
    });

    expect(repository.listProducts).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      enabled: undefined,
    });
    expect(result.list[0]?.code).toBe("credit_1000");
  });

  test("creates recharge product with audit employee", async () => {
    const service = await createService();

    await service.createProduct(authContext, {
      code: "credit_1000",
      title: "1000 积分",
      amount_fen: 10000,
      credits: 1000,
      bonus_credits: 100,
      enabled: true,
      sort_order: 10,
      metadata: {},
    });

    expect(repository.createProduct).toHaveBeenCalledWith({
      code: "credit_1000",
      title: "1000 积分",
      amount_fen: 10000,
      credits: 1000,
      bonus_credits: 100,
      enabled: true,
      sort_order: 10,
      metadata: {},
      created_by_employee_id: "employee-platform",
      updated_by_employee_id: "employee-platform",
    });
  });

  test("updates recharge product with audit employee", async () => {
    const service = await createService();

    const result = await service.updateProduct(authContext, product.id, {
      enabled: false,
    });

    expect(repository.updateProduct).toHaveBeenCalledWith(product.id, {
      enabled: false,
      updated_by_employee_id: "employee-platform",
    });
    expect(result.enabled).toBe(false);
  });

  test("lists platform recharge orders", async () => {
    const service = await createService();

    const result = await service.listOrders(authContext, {
      page: 1,
      pageSize: 20,
      status: "paid",
      keyword: "TC202607",
    });

    expect(repository.listOrders).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: "paid",
      keyword: "TC202607",
    });
    expect(result.list[0]?.tenant?.name).toBe("固始晴天装饰");
  });

  test("rejects product writes without manage permission", async () => {
    const service = await createService();

    await expect(
      service.createProduct({ ...authContext, permissions: [] }, {
        code: "credit_1000",
        title: "1000 积分",
        amount_fen: 10000,
        credits: 1000,
        bonus_credits: 0,
        enabled: true,
        sort_order: 100,
        metadata: {},
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.createProduct).not.toHaveBeenCalled();
  });
});
