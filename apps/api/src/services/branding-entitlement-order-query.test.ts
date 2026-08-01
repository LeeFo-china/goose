import { describe, expect, mock, test } from "bun:test";

import type {
  BrandingEntitlementOrderDetail,
  BrandingEntitlementOrderListRecord,
} from "@/repositories/branding-entitlement-order-query";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_USER_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const LEGACY_ID = "44444444-4444-4444-8444-444444444444";
const VIRTUAL_ID = "55555555-5555-4555-8555-555555555555";

const tenantAuth: AuthContext = {
  authUserId: AUTH_USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  tenantName: "测试租户",
  tenantSlug: "test-tenant",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "租户管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["system_admin"],
  roles: [],
  permissions: [{ code: "brand.entitlement_order.read", scope: "all" }],
};

const platformAuth: AuthContext = {
  ...tenantAuth,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  roleCodes: ["platform_admin"],
  permissions: [{ code: "platform.branding_order.read", scope: "all" }],
};

const legacyRow: BrandingEntitlementOrderListRecord = {
  payment_channel: "legacy_direct" as const,
  payment_platform: "unknown" as const,
  payment_status: "succeeded" as const,
  fulfillment_status: "granted" as const,
  refund_status: "none" as const,
  id: LEGACY_ID,
  tenant_id: TENANT_ID,
  order_no: "BA202607310001",
  product_code: "custom_support_branding_annual",
  product_name: "年度品牌技术支持",
  amount_fen: 100,
  term_years: 1,
  payment_expires_at: "2026-07-31T08:05:00.000Z",
  paid_at: "2026-07-31T08:01:00.000Z",
  closed_at: null,
  failure_code: null,
  created_at: "2026-07-31T08:00:00.000Z",
  updated_at: "2026-07-31T08:01:00.000Z",
  tenant_name: "测试租户",
  tenant_slug: "test-tenant",
  entitlement_starts_at: "2026-07-31T08:01:00.000Z",
  entitlement_expires_at: "2027-07-31T08:01:00.000Z",
  entitlement_status: "active" as const,
  entitlement_source: "purchase" as const,
  entitlement_source_id: LEGACY_ID,
};

const virtualRow: BrandingEntitlementOrderListRecord = {
  ...legacyRow,
  payment_channel: "wechat_virtual" as const,
  payment_platform: "ios" as const,
  id: VIRTUAL_ID,
  order_no: "BVO-20260731-1",
};

const virtualDetail = {
  payment_channel: "wechat_virtual" as const,
  order: {
    ...virtualRow,
    out_trade_no: "BV202607310001",
    entitlement_code: "custom_support_branding" as const,
    purchase_notes: "支付成功后自动开通一年",
    refund_policy: "按数字权益规则处理",
    paid_amount_fen: 100,
    failure_message: null,
    entitlement_event_id: "66666666-6666-4666-8666-666666666666",
    created_by: EMPLOYEE_ID,
    environment: "production" as const,
    settlement_channel: "wechat" as const,
    provider_order_no: "provider-order",
    transaction_id: "transaction-id",
    payer_openid: "sensitive-openid",
    secret_revision: 7,
  },
  entitlement: {
    starts_at: "2026-07-31T08:01:00.000Z",
    expires_at: "2027-07-31T08:01:00.000Z",
    status: "active" as const,
    source: "purchase" as const,
    order_no: "BVO-20260731-1",
  },
  entitlement_event: null,
  audit: null,
  audit_summary: {
    source: "virtual_order" as const,
    payment_status: "succeeded" as const,
    fulfillment_status: "granted" as const,
    refund_status: "none" as const,
    failure_code: null,
    failure_message: null,
    updated_at: "2026-07-31T08:01:00.000Z",
  },
};

function createFixture(options: {
  detailResult?: BrandingEntitlementOrderDetail | null;
  detailError?: unknown;
} = {}) {
  const list = mock(async () => ({
    list: [
      { ...legacyRow, payer_openid: "sensitive-legacy-openid" },
      { ...virtualRow, metadata: { secret: "must-not-leak" } },
    ],
    pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
  }));
  const findDetail = mock(async () => {
    if (options.detailError) throw options.detailError;
    return options.detailResult === undefined
      ? virtualDetail
      : options.detailResult;
  });
  const assertTenantContext = mock((auth: AuthContext) => {
    if (!auth.tenantId) throw Object.assign(new Error("forbidden"), { statusCode: 403 });
    return auth.tenantId;
  });
  const hasPermission = mock((auth: AuthContext, permission: string) =>
    auth.permissions.some(({ code }) => code === permission)
  );
  const assertPermission = mock((auth: AuthContext, permission: string) => {
    if (!auth.permissions.some(({ code }) => code === permission)) {
      throw Object.assign(new Error("forbidden"), {
        statusCode: 403,
        code: "FORBIDDEN",
      });
    }
    return "all" as const;
  });
  return { list, findDetail, assertTenantContext, hasPermission, assertPermission };
}

describe("BrandingEntitlementOrderQueryService", () => {
  test("maps legacy and virtual orders into one stable tenant shape", async () => {
    const fixture = createFixture();
    const { BrandingEntitlementOrderQueryService } = await import(
      "./branding-entitlement-order-query"
    );
    const service = new BrandingEntitlementOrderQueryService({
      repository: { list: fixture.list, findDetail: fixture.findDetail },
      accessPolicy: fixture,
      nowFactory: () => new Date("2026-07-31T08:02:00.000Z"),
    });

    const result = await service.listTenant(tenantAuth, {
      page: 1,
      pageSize: 20,
    });

    expect(result.list.map((item) => item.payment_channel)).toEqual([
      "legacy_direct",
      "wechat_virtual",
    ]);
    expect(result.list[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      fulfillment_status: "granted",
      refund_status: "none",
      entitlement: { order_no: "BA202607310001" },
    });
    expect(fixture.list).toHaveBeenCalledTimes(1);
    expect(fixture.list).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT_ID,
    }));
  });

  test("passes every platform filter to the single query", async () => {
    const fixture = createFixture();
    const { BrandingEntitlementOrderQueryService } = await import(
      "./branding-entitlement-order-query"
    );
    const service = new BrandingEntitlementOrderQueryService({
      repository: { list: fixture.list, findDetail: fixture.findDetail },
      accessPolicy: fixture,
    });

    await service.listPlatform(platformAuth, {
      page: 1,
      pageSize: 100,
      tenant_id: TENANT_ID,
      payment_channel: "wechat_virtual",
      payment_status: "succeeded",
      fulfillment_status: "granted",
      refund_status: "none",
      keyword: "BVO-20260731",
      created_from: "2026-07-01T00:00:00.000Z",
      created_to: "2026-07-31T23:59:59.999Z",
    });

    expect(fixture.list).toHaveBeenCalledTimes(1);
    expect(fixture.list).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      page: 1,
      pageSize: 100,
      paymentChannel: "wechat_virtual",
      paymentStatus: "succeeded",
      fulfillmentStatus: "granted",
      refundStatus: "none",
      keyword: "BVO-20260731",
      createdFrom: "2026-07-01T00:00:00.000Z",
      createdTo: "2026-07-31T23:59:59.999Z",
    });
  });

  test.each([
    ["non-platform", { ...platformAuth, isPlatformAdmin: false }],
    ["tenant-scoped", { ...platformAuth, tenantId: TENANT_ID }],
    ["inactive employee", { ...platformAuth, employeeStatus: "inactive" }],
    ["missing permission", { ...platformAuth, permissions: [] }],
  ] satisfies Array<[string, AuthContext]>)(
    "rejects %s platform access before repository reads",
    async (_label, authContext) => {
      const fixture = createFixture();
      const { BrandingEntitlementOrderQueryService } = await import(
        "./branding-entitlement-order-query"
      );
      const service = new BrandingEntitlementOrderQueryService({
        repository: { list: fixture.list, findDetail: fixture.findDetail },
        accessPolicy: fixture,
      });

      await expect(service.listPlatform(authContext, {
        page: 1,
        pageSize: 20,
      })).rejects.toMatchObject({ statusCode: 403 });
      expect(fixture.list).not.toHaveBeenCalled();
    },
  );

  test("returns the complete safe platform list shape", async () => {
    const fixture = createFixture();
    const { BrandingEntitlementOrderQueryService } = await import(
      "./branding-entitlement-order-query"
    );
    const service = new BrandingEntitlementOrderQueryService({
      repository: { list: fixture.list, findDetail: fixture.findDetail },
      accessPolicy: fixture,
    });

    const result = await service.listPlatform(platformAuth, {
      page: 1,
      pageSize: 20,
    });

    expect(result.list[0]).toEqual({
      id: LEGACY_ID,
      tenant_id: TENANT_ID,
      order_no: legacyRow.order_no,
      product_code: legacyRow.product_code,
      product_name: legacyRow.product_name,
      amount_fen: 100,
      term_years: 1,
      status: "paid",
      payment_channel: "legacy_direct",
      payment_platform: "unknown",
      payment_status: "succeeded",
      fulfillment_status: "granted",
      refund_status: "none",
      payment_expires_at: legacyRow.payment_expires_at,
      paid_at: legacyRow.paid_at,
      closed_at: null,
      failure_code: null,
      created_at: legacyRow.created_at,
      updated_at: legacyRow.updated_at,
      tenant: { id: TENANT_ID, name: "测试租户", slug: "test-tenant" },
    });
    expect(JSON.stringify(result)).not.toContain("sensitive-legacy-openid");
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  test("returns the complete safe virtual platform detail shape", async () => {
    const fixture = createFixture();
    const { BrandingEntitlementOrderQueryService } = await import(
      "./branding-entitlement-order-query"
    );
    const service = new BrandingEntitlementOrderQueryService({
      repository: { list: fixture.list, findDetail: fixture.findDetail },
      accessPolicy: fixture,
    });

    const result = await service.getPlatform(platformAuth, VIRTUAL_ID);

    expect(result).toMatchObject({
      order: {
        id: VIRTUAL_ID,
        payment_channel: "wechat_virtual",
        payment_platform: "ios",
        payment_status: "succeeded",
        fulfillment_status: "granted",
        refund_status: "none",
        out_trade_no: "BV202607310001",
        environment: "production",
        settlement_channel: "wechat",
        provider_order_no: "provider-order",
        transaction_id: "transaction-id",
      },
      audit_summary: {
        source: "virtual_order",
        payment_status: "succeeded",
        fulfillment_status: "granted",
        refund_status: "none",
      },
    });
    expect(JSON.stringify(result)).not.toContain("sensitive-openid");
    expect(JSON.stringify(result)).not.toContain("secret_revision");
  });

  test("maps a missing platform detail to the stable 404", async () => {
    const fixture = createFixture({ detailResult: null });
    const { BrandingEntitlementOrderQueryService } = await import(
      "./branding-entitlement-order-query"
    );
    const service = new BrandingEntitlementOrderQueryService({
      repository: { list: fixture.list, findDetail: fixture.findDetail },
      accessPolicy: fixture,
    });

    await expect(service.getPlatform(platformAuth, VIRTUAL_ID)).rejects
      .toMatchObject({
        statusCode: 404,
        code: "BRANDING_ADDON_ORDER_NOT_FOUND",
      });
  });

  test("sanitizes platform detail repository failures", async () => {
    const fixture = createFixture({
      detailError: {
        message: "select payer_openid, secret_revision",
        details: "private database layout",
      },
    });
    const { BrandingEntitlementOrderQueryService } = await import(
      "./branding-entitlement-order-query"
    );
    const service = new BrandingEntitlementOrderQueryService({
      repository: { list: fixture.list, findDetail: fixture.findDetail },
      accessPolicy: fixture,
    });

    await expect(service.getPlatform(platformAuth, VIRTUAL_ID)).rejects
      .toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
        details: undefined,
      });
  });

  test("keeps the virtual audit summary in tenant detail responses", async () => {
    const fixture = createFixture();
    const { BrandingEntitlementOrderQueryService } = await import(
      "./branding-entitlement-order-query"
    );
    const service = new BrandingEntitlementOrderQueryService({
      repository: { list: fixture.list, findDetail: fixture.findDetail },
      accessPolicy: fixture,
    });

    const result = await service.getTenant(tenantAuth, VIRTUAL_ID);

    expect(result).toMatchObject({
      order: { id: VIRTUAL_ID, payment_channel: "wechat_virtual" },
      audit_summary: { source: "virtual_order" },
      server_time: expect.any(String),
    });
  });

  test("keeps virtual-only detail fields absent from legacy details", async () => {
    const fixture = createFixture();
    fixture.findDetail.mockImplementation(async () => ({
      payment_channel: "legacy_direct" as const,
      order: {
        ...legacyRow,
        out_trade_no: "BA202607310001WX",
        entitlement_code: "custom_support_branding",
        purchase_notes: "支付成功后自动开通一年",
        refund_policy: "支付成功后不支持退款",
        paid_amount_fen: 100,
        failure_message: null,
        entitlement_event_id: null,
        created_by: EMPLOYEE_ID,
        channel: "wechat_pay",
        transaction_id: "legacy-transaction-id",
      },
      entitlement: null,
      entitlement_event: null,
      audit: null,
      audit_summary: {
        source: "legacy_order" as const,
        payment_status: "succeeded" as const,
        fulfillment_status: "granted" as const,
        refund_status: "none" as const,
        failure_code: null,
        failure_message: null,
        updated_at: "2026-07-31T08:01:00.000Z",
      },
    }));
    const { BrandingEntitlementOrderQueryService } = await import(
      "./branding-entitlement-order-query"
    );
    const service = new BrandingEntitlementOrderQueryService({
      repository: { list: fixture.list, findDetail: fixture.findDetail },
      accessPolicy: fixture,
    });

    const result = await service.getPlatform(platformAuth, LEGACY_ID);

    expect(result.order.payment_channel).toBe("legacy_direct");
    expect(result.order).not.toHaveProperty("environment");
    expect(result.order).not.toHaveProperty("provider_order_no");
    expect(result.audit_summary.source).toBe("legacy_order");

    const tenantResult = await service.getTenant(tenantAuth, LEGACY_ID);
    expect(tenantResult).toMatchObject({
      order: { id: LEGACY_ID, payment_channel: "legacy_direct" },
      audit_summary: { source: "legacy_order" },
      server_time: expect.any(String),
    });
  });

  test("does not expose repository diagnostics", async () => {
    const fixture = createFixture();
    fixture.list.mockImplementation(async () => {
      throw {
        message: "select payer_openid, payment_config_id",
        details: "private database layout",
      };
    });
    const { BrandingEntitlementOrderQueryService } = await import(
      "./branding-entitlement-order-query"
    );
    const service = new BrandingEntitlementOrderQueryService({
      repository: { list: fixture.list, findDetail: fixture.findDetail },
      accessPolicy: fixture,
    });

    await expect(service.listTenant(tenantAuth, {
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: undefined,
    });
  });
});
