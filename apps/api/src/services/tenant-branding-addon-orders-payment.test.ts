import { describe, expect, test } from "bun:test";

import {
  authContext,
  entitlement,
  NOW,
  ORDER_ID,
  order,
  OTHER_TENANT_ID,
  TENANT_ID,
  createDependencies,
} from "./tenant-branding-addon-orders.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

async function createService(
  dependencies = createDependencies(),
) {
  const { TenantBrandingAddonOrderService } = await import(
    "./tenant-branding-addon-orders"
  );
  return {
    service: new TenantBrandingAddonOrderService({
      ...dependencies,
      tradeNoFactory: () => "BA202607280001",
      nowFactory: () => new Date(NOW),
    }),
    dependencies,
  };
}

describe("TenantBrandingAddonOrderService payment requests", () => {
  test("rejects a payment request bound to another authenticated OpenID", async () => {
    const fixture = await createService();

    await expect(
      fixture.service.createPaymentRequest(
        authContext,
        ORDER_ID,
        "another-openid",
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_ORDER_PAYER_MISMATCH",
    });
    expect(fixture.dependencies.wechatPayGateway.createMiniProgramPaymentRequest)
      .not.toHaveBeenCalled();
  });

  test("re-signs an existing prepay only after tenant, status, expiry and guard checks", async () => {
    const fixture = await createService();

    await expect(
      fixture.service.createPaymentRequest(
        authContext,
        ORDER_ID,
        order.payer_openid,
      ),
    ).resolves.toMatchObject({
      order: {
        id: ORDER_ID,
        payment_action: { enabled: true, disabled_reason: null },
      },
      payment_request: { package: "prepay_id=prepay-1" },
      server_time: NOW.toISOString(),
    });
    expect(
      fixture.dependencies.orderRepository.findInternalTenantOrderById,
    ).toHaveBeenCalledWith({ tenantId: TENANT_ID, orderId: ORDER_ID });
    expect(fixture.dependencies.wechatPayGateway.createJsapiPrepay)
      .not.toHaveBeenCalled();
    expect(fixture.dependencies.wechatPayGateway.createMiniProgramPaymentRequest)
      .toHaveBeenCalled();
  });

  test("safely rebuilds a missing prepay with the immutable order snapshot", async () => {
    const pendingWithoutPrepay = { ...order, prepay_id: null };
    const dependencies = createDependencies({ order: pendingWithoutPrepay });
    dependencies.orderRepository.markPrepayCreated.mockResolvedValue({
      ...pendingWithoutPrepay,
      prepay_id: "prepay-rebuilt",
    });
    dependencies.wechatPayGateway.createJsapiPrepay.mockResolvedValue({
      prepayId: "prepay-rebuilt",
      paymentRequest: {
        timeStamp: "1785204000",
        nonceStr: "nonce",
        package: "prepay_id=prepay-rebuilt",
        signType: "RSA",
        paySign: "pay-sign",
      },
    });
    const fixture = await createService(dependencies);

    const result = await fixture.service.createPaymentRequest(
      authContext,
      ORDER_ID,
      order.payer_openid,
    );

    expect(dependencies.wechatPayGateway.createJsapiPrepay)
      .toHaveBeenCalledWith(expect.objectContaining({
        order: {
          out_trade_no: order.out_trade_no,
          amount: 0.01,
          payer_openid: order.payer_openid,
          payment_expires_at: order.payment_expires_at,
        },
        description: order.product_name,
      }));
    expect(dependencies.orderRepository.markPrepayCreated)
      .toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        orderId: ORDER_ID,
        prepayId: "prepay-rebuilt",
        now: NOW,
      });
    expect(result.payment_request.package).toBe("prepay_id=prepay-rebuilt");
  });

  test.each([
    ["paid", "BRANDING_ADDON_ORDER_NOT_PENDING"],
    ["closed", "BRANDING_ADDON_ORDER_NOT_PENDING"],
    ["failed", "BRANDING_ADDON_ORDER_NOT_PENDING"],
  ] as const)(
    "rejects %s before loading payment configuration",
    async (status, code) => {
      const dependencies = createDependencies({
        order: { ...order, status },
      });
      const fixture = await createService(dependencies);

      await expect(
        fixture.service.createPaymentRequest(
          authContext,
          ORDER_ID,
          order.payer_openid,
        ),
      ).rejects.toMatchObject({ statusCode: 409, code });
      expect(dependencies.paymentConfigRepository.findWechatPayConfigById)
        .not.toHaveBeenCalled();
    },
  );

  test("rejects an expired pending order before payment configuration access", async () => {
    const dependencies = createDependencies({
      order: {
        ...order,
        payment_expires_at: "2026-07-28T02:00:00.000Z",
      },
    });
    const fixture = await createService(dependencies);

    await expect(
      fixture.service.createPaymentRequest(
        authContext,
        ORDER_ID,
        order.payer_openid,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_ORDER_EXPIRED",
    });
    expect(dependencies.paymentConfigRepository.findWechatPayConfigById)
      .not.toHaveBeenCalled();
  });

  test("returns tenant-scoped not found for a foreign order", async () => {
    const dependencies = createDependencies({ order: null });
    const fixture = await createService(dependencies);

    await expect(
      fixture.service.createPaymentRequest(
        { ...authContext, tenantId: OTHER_TENANT_ID },
        ORDER_ID,
        order.payer_openid,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "BRANDING_ADDON_ORDER_NOT_FOUND",
    });
  });

  test("rejects a payment config guard or merchant snapshot mismatch", async () => {
    const dependencies = createDependencies();
    dependencies.paymentConfigRepository.findWechatPayConfigById
      .mockResolvedValue({
        ...(await dependencies.paymentConfigRepository.findWechatPayConfig()),
        recharge_guard_version: 4,
      });
    const fixture = await createService(dependencies);

    await expect(
      fixture.service.createPaymentRequest(
        authContext,
        ORDER_ID,
        order.payer_openid,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_ORDER_PAYMENT_CONFIG_CHANGED",
    });
    expect(dependencies.wechatPayGateway.createMiniProgramPaymentRequest)
      .not.toHaveBeenCalled();
  });
});

describe("TenantBrandingAddonOrderService reads and views", () => {
  test("reads the enabled product and exposes a stable purchase action", async () => {
    const fixture = await createService();

    await expect(fixture.service.getProduct(authContext)).resolves.toEqual({
      product: {
        code: "custom_support_branding_annual",
        entitlement_code: "custom_support_branding",
        name: "年度品牌技术支持",
        amount_fen: 1,
        term_years: 1,
        purchase_notes: "支付成功后自动开通或续期一年",
        refund_policy: "数字权益支付成功并开通后不支持退款",
        purchase_action: { enabled: true, disabled_reason: null },
      },
      server_time: NOW.toISOString(),
    });
  });

  test("disables product purchase for a suspended entitlement", async () => {
    const fixture = await createService(createDependencies({
      entitlement: { ...entitlement, status: "suspended" },
    }));

    await expect(fixture.service.getProduct(authContext)).resolves.toMatchObject({
      product: {
        purchase_action: {
          enabled: false,
          disabled_reason: "ENTITLEMENT_SUSPENDED",
        },
      },
    });
  });

  test("disables a pending order payment action while the entitlement is suspended", async () => {
    const fixture = await createService(createDependencies({
      entitlement: { ...entitlement, status: "suspended" },
    }));

    await expect(
      fixture.service.listOrders(authContext, { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      list: [{
        payment_action: {
          enabled: false,
          disabled_reason: "ENTITLEMENT_SUSPENDED",
        },
      }],
    });
  });

  test("requires read permission and scopes list pagination to auth tenant", async () => {
    const fixture = await createService(createDependencies({
      entitlement,
    }));

    const result = await fixture.service.listOrders(authContext, {
      page: 2,
      pageSize: 20,
      status: "paid",
      keyword: "BA2026",
    });

    expect(fixture.dependencies.orderRepository.listTenantOrders)
      .toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        page: 2,
        pageSize: 20,
        status: "paid",
        keyword: "BA2026",
      });
    expect(result).toMatchObject({
      server_time: NOW.toISOString(),
      list: [{
        id: ORDER_ID,
        order_no: order.order_no,
        status: "pending",
        amount_fen: 1,
        term_years: 1,
        paid_at: null,
        expires_at: order.payment_expires_at,
        payment_action: { enabled: true, disabled_reason: null },
        entitlement: {
          starts_at: entitlement.starts_at,
          expires_at: entitlement.expires_at,
          status: "active",
          source: "purchase",
          order_no: order.order_no,
        },
      }],
    });
    expect(JSON.stringify(result)).not.toContain("payer_openid");
    expect(JSON.stringify(result)).not.toContain("payment_config_id");
    expect(JSON.stringify(result)).not.toContain("metadata");
  });

  test("returns not found for cross-tenant detail and never queries an unscoped id", async () => {
    const dependencies = createDependencies({ order: null });
    const fixture = await createService(dependencies);

    await expect(
      fixture.service.getOrder(
        { ...authContext, tenantId: OTHER_TENANT_ID },
        ORDER_ID,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "BRANDING_ADDON_ORDER_NOT_FOUND",
    });
    expect(dependencies.orderRepository.findTenantOrderById)
      .toHaveBeenCalledWith({
        tenantId: OTHER_TENANT_ID,
        orderId: ORDER_ID,
      });
  });

  test("rejects order reads without the dedicated read permission", async () => {
    const fixture = await createService();
    const withoutRead = {
      ...authContext,
      permissions: authContext.permissions.filter(
        ({ code }) => code !== "brand.entitlement_order.read",
      ),
    };

    await expect(
      fixture.service.listOrders(withoutRead, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(fixture.dependencies.orderRepository.listTenantOrders)
      .not.toHaveBeenCalled();
  });
});
