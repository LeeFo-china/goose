import { beforeAll, describe, expect, mock, test } from "bun:test";

import type {
  PlatformBrandingAddonOrderAuditRecord,
  PlatformBrandingAddonOrderDetailRecord,
  PlatformBrandingAddonOrderListRecord,
} from "@/repositories/branding-addon-orders";
import type { PlatformBrandingAddonOrderListQuery } from "@/schema/branding-addon";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_USER_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";

const platformAuth: AuthContext = {
  authUserId: AUTH_USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台管理员",
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
  permissions: [{
    code: "platform.branding_order.read",
    scope: "all",
  }],
};

const safeOrder = {
  id: ORDER_ID,
  tenant_id: TENANT_ID,
  order_no: "BA202607280001",
  out_trade_no: "BA202607280001WX",
  product_code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  product_name: "年度品牌技术支持",
  amount_fen: 1,
  term_years: 1,
  purchase_notes: "支付成功后自动开通一年",
  refund_policy: "数字权益支付成功并开通后不支持退款",
  status: "paid",
  channel: "wechat_pay",
  payment_expires_at: "2026-07-28T08:05:00.000Z",
  transaction_id: "4200000001202607280000000001",
  paid_amount_fen: 1,
  paid_at: "2026-07-28T08:01:00.000Z",
  closed_at: null,
  failure_code: null,
  failure_message: null,
  entitlement_event_id: "55555555-5555-4555-8555-555555555555",
  created_by: EMPLOYEE_ID,
  created_at: "2026-07-28T08:00:00.000Z",
  updated_at: "2026-07-28T08:01:00.000Z",
  tenant: {
    id: TENANT_ID,
    name: "测试租户",
    slug: "test-tenant",
  },
} satisfies PlatformBrandingAddonOrderDetailRecord;

const sensitiveFields = {
  payer_openid: "o-sensitive",
  payment_config_id: "66666666-6666-4666-8666-666666666666",
  expected_guard_version: 7,
  payment_mchid: "1900000109",
  payment_appid: "wx-sensitive",
  prepay_id: "wx-prepay-sensitive",
  metadata: { api_v3_key: "must-not-leak" },
  close_claim_token: "77777777-7777-4777-8777-777777777777",
  close_claim_expires_at: "2026-07-28T08:10:00.000Z",
  close_last_error: "private upstream diagnostics",
  raw_payload: { resource: { ciphertext: "encrypted-sensitive" } },
};

type ServiceConstructor = typeof import(
  "./platform-branding-addon-orders"
)["PlatformBrandingAddonOrdersService"];

let PlatformBrandingAddonOrdersService: ServiceConstructor;

beforeAll(async () => {
  ({ PlatformBrandingAddonOrdersService } = await import(
    "./platform-branding-addon-orders"
  ));
});

function createFixture(options: {
  listResult?: {
    list: PlatformBrandingAddonOrderListRecord[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
  detailResult?: PlatformBrandingAddonOrderAuditRecord | null;
  listError?: unknown;
  detailError?: unknown;
} = {}) {
  const listPlatformOrders = mock(async (): Promise<{
    list: PlatformBrandingAddonOrderListRecord[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> => {
    if (options.listError) throw options.listError;
    return options.listResult ?? {
      list: [{ ...safeOrder, ...sensitiveFields }],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
    };
  });
  const findPlatformOrderAuditById = mock(
    async (): Promise<PlatformBrandingAddonOrderAuditRecord | null> => {
      if (options.detailError) throw options.detailError;
      return options.detailResult === undefined
        ? {
          order: { ...safeOrder, ...sensitiveFields },
          entitlement: {
            starts_at: "2026-07-28T08:01:00.000Z",
            expires_at: "2027-07-28T08:01:00.000Z",
            status: "active",
            source: "purchase",
            order_no: safeOrder.order_no,
            ...sensitiveFields,
          },
          entitlement_event: {
            id: safeOrder.entitlement_event_id,
            event_type: "granted",
            source_type: "purchase",
            source_id: ORDER_ID,
            reason: "Annual branding add-on purchase confirmed",
            created_at: "2026-07-28T08:01:00.000Z",
            ...sensitiveFields,
          },
          audit: {
            id: "88888888-8888-4888-8888-888888888888",
            action: "branding_addon_purchase.confirm",
            status: "success",
            summary: "Annual branding add-on purchase confirmed",
            created_at: "2026-07-28T08:01:00.000Z",
            ...sensitiveFields,
          },
        } satisfies PlatformBrandingAddonOrderAuditRecord
        : options.detailResult;
    },
  );
  const assertPermission = mock((
    authContext: AuthContext,
    permission: string,
  ) => {
    if (!authContext.permissions.some(({ code }) => code === permission)) {
      throw Object.assign(new Error("forbidden"), {
        statusCode: 403,
        code: "FORBIDDEN",
      });
    }
    return "all" as const;
  });
  const service = new PlatformBrandingAddonOrdersService({
    repository: { listPlatformOrders, findPlatformOrderAuditById },
    accessPolicy: { assertPermission },
  });
  return {
    service,
    listPlatformOrders,
    findPlatformOrderAuditById,
    assertPermission,
  };
}

describe("PlatformBrandingAddonOrdersService access", () => {
  test.each([
    ["non-platform identity", { ...platformAuth, isPlatformAdmin: false }],
    ["tenant-scoped platform flag", { ...platformAuth, tenantId: TENANT_ID }],
    ["missing employee", { ...platformAuth, employeeId: null }],
    ["inactive employee", { ...platformAuth, employeeStatus: "inactive" }],
    ["missing auth user", { ...platformAuth, authUserId: "" }],
    ["missing permission", { ...platformAuth, permissions: [] }],
  ] satisfies Array<[string, AuthContext]>)(
    "rejects %s before querying orders",
    async (_name, authContext) => {
      const fixture = createFixture();

      await expect(fixture.service.list(authContext, {
        page: 1,
        pageSize: 20,
      })).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
      await expect(fixture.service.get(authContext, ORDER_ID)).rejects
        .toMatchObject({
          statusCode: 403,
          code: "FORBIDDEN",
        });
      expect(fixture.listPlatformOrders).not.toHaveBeenCalled();
      expect(fixture.findPlatformOrderAuditById).not.toHaveBeenCalled();
    },
  );

  test("requires the dedicated read permission for list and detail", async () => {
    const fixture = createFixture();

    await fixture.service.list(platformAuth, { page: 1, pageSize: 20 });
    await fixture.service.get(platformAuth, ORDER_ID);

    expect(fixture.assertPermission.mock.calls.map((call) => call[1])).toEqual([
      "platform.branding_order.read",
      "platform.branding_order.read",
    ]);
  });
});

describe("PlatformBrandingAddonOrdersService queries", () => {
  test("passes pagination and all supported filters to one list query", async () => {
    const fixture = createFixture({ listResult: {
      list: [],
      pagination: { page: 2, pageSize: 100, total: 0, totalPages: 0 },
    } });
    const query = {
      page: 2,
      pageSize: 100,
      tenant_id: TENANT_ID,
      status: "paid",
      keyword: "BA20260728",
      created_from: "2026-07-01T00:00:00.000Z",
      created_to: "2026-07-31T23:59:59.999Z",
    } satisfies PlatformBrandingAddonOrderListQuery;

    await expect(fixture.service.list(platformAuth, query)).resolves.toEqual({
      list: [],
      pagination: { page: 2, pageSize: 100, total: 0, totalPages: 0 },
    });
    expect(fixture.listPlatformOrders).toHaveBeenCalledTimes(1);
    expect(fixture.listPlatformOrders).toHaveBeenCalledWith({
      page: 2,
      pageSize: 100,
      tenantId: TENANT_ID,
      status: "paid",
      keyword: "BA20260728",
      createdFrom: "2026-07-01T00:00:00.000Z",
      createdTo: "2026-07-31T23:59:59.999Z",
    });
  });

  test("returns only the lightweight public fields in list responses", async () => {
    const fixture = createFixture();

    const response = await fixture.service.list(platformAuth, {
      page: 1,
      pageSize: 20,
    });

    expect(response.list).toEqual([{
      id: safeOrder.id,
      tenant_id: safeOrder.tenant_id,
      order_no: safeOrder.order_no,
      product_code: safeOrder.product_code,
      product_name: safeOrder.product_name,
      amount_fen: safeOrder.amount_fen,
      term_years: safeOrder.term_years,
      status: safeOrder.status,
      payment_expires_at: safeOrder.payment_expires_at,
      paid_at: safeOrder.paid_at,
      closed_at: safeOrder.closed_at,
      failure_code: safeOrder.failure_code,
      created_at: safeOrder.created_at,
      updated_at: safeOrder.updated_at,
      tenant: safeOrder.tenant,
    }]);
    expect(JSON.stringify(response)).not.toContain("sensitive");
    expect(JSON.stringify(response)).not.toContain("ciphertext");
  });

  test("loads the detail graph once and returns bounded audit summaries", async () => {
    const fixture = createFixture();

    const response = await fixture.service.get(platformAuth, ORDER_ID);

    expect(fixture.findPlatformOrderAuditById).toHaveBeenCalledTimes(1);
    expect(fixture.findPlatformOrderAuditById).toHaveBeenCalledWith(ORDER_ID);
    expect(response).toEqual({
      order: safeOrder,
      entitlement: {
        starts_at: "2026-07-28T08:01:00.000Z",
        expires_at: "2027-07-28T08:01:00.000Z",
        status: "active",
        source: "purchase",
        order_no: safeOrder.order_no,
      },
      entitlement_event: {
        id: safeOrder.entitlement_event_id,
        event_type: "granted",
        source_type: "purchase",
        source_id: ORDER_ID,
        reason: "Annual branding add-on purchase confirmed",
        created_at: "2026-07-28T08:01:00.000Z",
      },
      audit: {
        id: "88888888-8888-4888-8888-888888888888",
        action: "branding_addon_purchase.confirm",
        status: "success",
        summary: "Annual branding add-on purchase confirmed",
        created_at: "2026-07-28T08:01:00.000Z",
      },
    });
    expect(JSON.stringify(response)).not.toContain("sensitive");
    expect(JSON.stringify(response)).not.toContain("ciphertext");
  });

  test("maps a missing detail to the stable order not-found error", async () => {
    const fixture = createFixture({ detailResult: null });

    await expect(fixture.service.get(platformAuth, ORDER_ID)).rejects
      .toMatchObject({
        statusCode: 404,
        code: "BRANDING_ADDON_ORDER_NOT_FOUND",
      });
  });

  test("does not expose repository or RPC diagnostics", async () => {
    const privateError = {
      code: "DB_ERROR",
      details: {
        message: "select payer_openid, payment_config_id",
        hint: "private database layout",
      },
    };
    const listFixture = createFixture({ listError: privateError });
    const detailFixture = createFixture({ detailError: privateError });

    await expect(listFixture.service.list(platformAuth, {
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: undefined,
    });
    await expect(detailFixture.service.get(platformAuth, ORDER_ID)).rejects
      .toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
        details: undefined,
      });
  });
});
