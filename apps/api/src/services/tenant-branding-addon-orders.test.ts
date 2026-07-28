import { describe, expect, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";
import {
  authContext,
  EMPLOYEE_ID,
  IDEMPOTENCY_KEY,
  NOW,
  ORDER_ID,
  order,
  product,
  TENANT_ID,
  createDependencies,
} from "./tenant-branding-addon-orders.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const createInput = {
  product_code: "custom_support_branding_annual" as const,
  payer_openid: "openid-from-login",
  idempotency_key: IDEMPOTENCY_KEY,
};

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

describe("TenantBrandingAddonOrderService purchase access", () => {
  test.each([
    ["missing tenant", { ...authContext, tenantId: null }],
    ["missing employee", { ...authContext, employeeId: null }],
    ["ordinary employee", { ...authContext, roleCodes: [] }],
    ["missing purchase permission", {
      ...authContext,
      permissions: authContext.permissions.filter(
        ({ code }) => code !== "brand.entitlement.purchase",
      ),
    }],
  ] satisfies Array<[string, AuthContext]>)(
    "rejects %s before querying purchase state",
    async (_label, context) => {
      const fixture = await createService();

      await expect(
        fixture.service.createOrder(context, createInput),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(
        fixture.dependencies.entitlementRepository.findByCode,
      ).not.toHaveBeenCalled();
      expect(fixture.dependencies.orderRepository.createOrder)
        .not.toHaveBeenCalled();
    },
  );

  test("uses only the authenticated tenant and treats payer_openid as payer data", async () => {
    const fixture = await createService();

    await fixture.service.createOrder(authContext, createInput);

    expect(fixture.dependencies.orderRepository.createOrder)
      .toHaveBeenCalledWith(expect.objectContaining({
        tenant_id: TENANT_ID,
        created_by: EMPLOYEE_ID,
        payer_openid: "openid-from-login",
      }));
  });

  test.each([
    ["suspended", "BRANDING_ENTITLEMENT_SUSPENDED"],
    ["revoked", "BRANDING_ENTITLEMENT_REVOKED"],
  ] as const)(
    "rejects a %s entitlement before idempotency or inserts",
    async (status, code) => {
      const dependencies = createDependencies({
        entitlement: {
          ...orderEntitlement(),
          status,
        },
      });
      const fixture = await createService(dependencies);

      await expect(
        fixture.service.createOrder(authContext, createInput),
      ).rejects.toMatchObject({ statusCode: 409, code });
      expect(dependencies.orderRepository.findByIdempotencyKey)
        .not.toHaveBeenCalled();
      expect(dependencies.orderRepository.createOrder).not.toHaveBeenCalled();
    },
  );
});

describe("TenantBrandingAddonOrderService create and replay", () => {
  test("creates a snapshot order after payment config preflight and post-insert guard check", async () => {
    const fixture = await createService();

    const result = await fixture.service.createOrder(authContext, createInput);

    expect(fixture.dependencies.orderRepository.createOrder)
      .toHaveBeenCalledWith({
        tenant_id: TENANT_ID,
        order_no: "BA202607280001",
        out_trade_no: "BA202607280001",
        idempotency_key: IDEMPOTENCY_KEY,
        product_id: product.id,
        product_code: product.code,
        entitlement_code: product.entitlement_code,
        product_name: product.name,
        amount_fen: 1,
        term_years: 1,
        purchase_notes: product.purchase_notes,
        refund_policy: "数字权益支付成功并开通后不支持退款",
        status: "pending",
        channel: "wechat_pay",
        payer_openid: "openid-from-login",
        payment_config_id: "77777777-7777-4777-8777-777777777777",
        expected_guard_version: 3,
        payment_mchid: "1900000001",
        payment_appid: "wx-platform-app",
        payment_expires_at: "2026-07-28T02:05:00.000Z",
        created_by: EMPLOYEE_ID,
        metadata: { product_version: 2 },
      });
    expect(
      fixture.dependencies.paymentConfigRepository.findWechatPayConfig,
    ).toHaveBeenCalledTimes(1);
    expect(
      fixture.dependencies.paymentConfigRepository.findWechatPayConfigById,
    ).toHaveBeenCalledWith("77777777-7777-4777-8777-777777777777");
    expect(fixture.dependencies.secretBundleService.load)
      .toHaveBeenCalledTimes(2);
    expect(fixture.dependencies.wechatPayGateway.createJsapiPrepay)
      .toHaveBeenCalledWith(expect.objectContaining({
        order: {
          out_trade_no: "BA202607280001",
          amount: 0.01,
          payer_openid: "openid-from-login",
          payment_expires_at: "2026-07-28T02:05:00.000Z",
        },
        description: product.name,
      }));
    expect(result).toMatchObject({
      idempotent: false,
      reused_pending: false,
      server_time: NOW.toISOString(),
      order: {
        id: ORDER_ID,
        amount_fen: 1,
        expires_at: "2026-07-28T02:05:00.000Z",
      },
      payment_request: { package: "prepay_id=prepay-1" },
    });
  });

  test("returns the same order for the same idempotency key", async () => {
    const dependencies = createDependencies();
    dependencies.orderRepository.findByIdempotencyKey.mockResolvedValue(order);
    const fixture = await createService(dependencies);

    const result = await fixture.service.createOrder(authContext, createInput);

    expect(result).toMatchObject({
      idempotent: true,
      reused_pending: false,
      order: { id: ORDER_ID },
    });
    expect(dependencies.orderRepository.createOrder).not.toHaveBeenCalled();
    expect(dependencies.wechatPayGateway.createMiniProgramPaymentRequest)
      .toHaveBeenCalled();
  });

  test("rejects an idempotency replay bound to another payer", async () => {
    const dependencies = createDependencies();
    dependencies.orderRepository.findByIdempotencyKey.mockResolvedValue(order);
    const fixture = await createService(dependencies);

    await expect(fixture.service.createOrder(authContext, {
      ...createInput,
      payer_openid: "another-openid",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_ORDER_PAYER_MISMATCH",
      details: undefined,
    });
    expect(dependencies.wechatPayGateway.createMiniProgramPaymentRequest)
      .not.toHaveBeenCalled();
    expect(dependencies.orderRepository.createOrder).not.toHaveBeenCalled();
  });

  test("reuses the existing tenant product pending order for a new key", async () => {
    const dependencies = createDependencies();
    dependencies.orderRepository.findPendingByTenantProduct
      .mockResolvedValue(order);
    const fixture = await createService(dependencies);

    const result = await fixture.service.createOrder(authContext, {
      ...createInput,
      idempotency_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    expect(result).toMatchObject({
      idempotent: false,
      reused_pending: true,
      order: { id: ORDER_ID },
    });
    expect(dependencies.orderRepository.createOrder).not.toHaveBeenCalled();
  });

  test("rejects an existing pending order bound to another payer", async () => {
    const dependencies = createDependencies();
    dependencies.orderRepository.findPendingByTenantProduct
      .mockResolvedValue(order);
    const fixture = await createService(dependencies);

    await expect(fixture.service.createOrder(authContext, {
      ...createInput,
      payer_openid: "another-openid",
      idempotency_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_ORDER_PAYER_MISMATCH",
    });
    expect(dependencies.wechatPayGateway.createMiniProgramPaymentRequest)
      .not.toHaveBeenCalled();
    expect(dependencies.orderRepository.createOrder).not.toHaveBeenCalled();
  });

  test("recovers a pending-order unique race without leaking repository details", async () => {
    const dependencies = createDependencies();
    dependencies.orderRepository.createOrder.mockRejectedValue(
      Object.assign(new Error("secret constraint"), {
        statusCode: 409,
        code: "BRANDING_ADDON_PENDING_ORDER_EXISTS",
      }),
    );
    dependencies.orderRepository.findPendingByTenantProduct
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(order);
    const fixture = await createService(dependencies);

    await expect(
      fixture.service.createOrder(authContext, createInput),
    ).resolves.toMatchObject({
      idempotent: false,
      reused_pending: true,
      order: { id: ORDER_ID },
    });
  });

  test("recovers an idempotency-key unique race as an idempotent replay", async () => {
    const dependencies = createDependencies();
    dependencies.orderRepository.createOrder.mockRejectedValue(
      Object.assign(new Error("secret constraint"), {
        statusCode: 409,
        code: "BRANDING_ADDON_IDEMPOTENCY_KEY_CONFLICT",
      }),
    );
    dependencies.orderRepository.findByIdempotencyKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(order);
    const fixture = await createService(dependencies);

    await expect(
      fixture.service.createOrder(authContext, createInput),
    ).resolves.toMatchObject({
      idempotent: true,
      reused_pending: false,
      order: { id: ORDER_ID },
    });
  });

  test.each([
    [
      "BRANDING_ADDON_IDEMPOTENCY_KEY_CONFLICT",
      "findByIdempotencyKey",
    ],
    [
      "BRANDING_ADDON_PENDING_ORDER_EXISTS",
      "findPendingByTenantProduct",
    ],
  ] as const)(
    "rejects a %s race when the recovered order belongs to another payer",
    async (conflictCode, lookup) => {
      const dependencies = createDependencies();
      dependencies.orderRepository.createOrder.mockRejectedValue(
        Object.assign(new Error("secret constraint"), {
          statusCode: 409,
          code: conflictCode,
        }),
      );
      dependencies.orderRepository[lookup]
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(order);
      const fixture = await createService(dependencies);

      await expect(fixture.service.createOrder(authContext, {
        ...createInput,
        payer_openid: "another-openid",
      })).rejects.toMatchObject({
        statusCode: 409,
        code: "BRANDING_ADDON_ORDER_PAYER_MISMATCH",
      });
      expect(dependencies.wechatPayGateway.createMiniProgramPaymentRequest)
        .not.toHaveBeenCalled();
    },
  );

  test("fails a prepay-free order when the post-insert payment guard changes", async () => {
    const dependencies = createDependencies();
    dependencies.paymentConfigRepository.findWechatPayConfigById
      .mockResolvedValue({
        ...(await dependencies.paymentConfigRepository.findWechatPayConfig()),
        recharge_guard_version: 4,
      });
    dependencies.orderRepository.markFailedBeforePrepay.mockResolvedValue({
      ...order,
      status: "failed",
      failure_code: "BRANDING_ADDON_ORDER_PAYMENT_CONFIG_CHANGED",
      failure_message: "支付配置或密钥版本在预下单前发生变化",
    });
    const fixture = await createService(dependencies);

    await expect(
      fixture.service.createOrder(authContext, createInput),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_ORDER_PAYMENT_CONFIG_CHANGED",
    });
    expect(dependencies.orderRepository.markFailedBeforePrepay)
      .toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        orderId: ORDER_ID,
        paymentConfigId: order.payment_config_id,
        expectedGuardVersion: order.expected_guard_version,
      });
    expect(dependencies.wechatPayGateway.createJsapiPrepay)
      .not.toHaveBeenCalled();
  });

  test("fails a prepay-free order when the post-insert secret revision changes", async () => {
    const dependencies = createDependencies();
    dependencies.secretBundleService.load
      .mockResolvedValueOnce({
        privateKeyPem: "private-key",
        apiV3Key: "12345678901234567890123456789012",
        wechatPayPublicKeyId: null,
        wechatPayPublicKeyPem: null,
        baseUrl: "https://api.mch.weixin.qq.com",
        revision: "bundle-revision-1",
      })
      .mockResolvedValueOnce({
        privateKeyPem: "private-key",
        apiV3Key: "12345678901234567890123456789012",
        wechatPayPublicKeyId: null,
        wechatPayPublicKeyPem: null,
        baseUrl: "https://api.mch.weixin.qq.com",
        revision: "bundle-revision-2",
      });
    const fixture = await createService(dependencies);

    await expect(
      fixture.service.createOrder(authContext, createInput),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_SECRET_BUNDLE_REVISION_MISMATCH",
    });
    expect(dependencies.orderRepository.markFailedBeforePrepay)
      .toHaveBeenCalledWith(expect.objectContaining({
        tenantId: TENANT_ID,
        orderId: ORDER_ID,
      }));
    expect(dependencies.wechatPayGateway.createJsapiPrepay)
      .not.toHaveBeenCalled();
  });

  test("keeps the original guard error when a concurrent prepay prevents failure transition", async () => {
    const dependencies = createDependencies();
    dependencies.paymentConfigRepository.findWechatPayConfigById
      .mockResolvedValue({
        ...(await dependencies.paymentConfigRepository.findWechatPayConfig()),
        recharge_guard_version: 4,
      });
    dependencies.orderRepository.markFailedBeforePrepay.mockResolvedValue(null);
    const fixture = await createService(dependencies);

    await expect(
      fixture.service.createOrder(authContext, createInput),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_ORDER_PAYMENT_CONFIG_CHANGED",
    });
    expect(dependencies.orderRepository.markFailedBeforePrepay)
      .toHaveBeenCalledTimes(1);
  });

  test("does not reuse an expired pending order for a new idempotency key", async () => {
    const dependencies = createDependencies();
    dependencies.orderRepository.findPendingByTenantProduct.mockResolvedValue({
      ...order,
      payment_expires_at: NOW.toISOString(),
    });
    const fixture = await createService(dependencies);

    await expect(
      fixture.service.createOrder(authContext, {
        ...createInput,
        idempotency_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_ORDER_EXPIRED",
    });
    expect(dependencies.orderRepository.createOrder).not.toHaveBeenCalled();
  });

  test.each([
    ["missing", null],
    ["disabled", { ...product, enabled: false }],
    ["unconfigured", { ...product, amount_fen: null }],
    ["non-positive", { ...product, amount_fen: 0 }],
  ] as const)(
    "rejects a %s product",
    async (_label, candidate) => {
      const fixture = await createService(
        createDependencies({ product: candidate }),
      );

      await expect(
        fixture.service.createOrder(authContext, createInput),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "BRANDING_ADDON_PRODUCT_NOT_FOUND",
      });
      expect(fixture.dependencies.orderRepository.createOrder)
        .not.toHaveBeenCalled();
    },
  );
});

function orderEntitlement() {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    tenant_id: TENANT_ID,
    entitlement_code: "custom_support_branding" as const,
    status: "active" as const,
    starts_at: "2026-07-28T00:00:00.000Z",
    expires_at: "2027-07-28T00:00:00.000Z",
    source_type: "manual_grant" as const,
    source_id: null,
    suspended_at: null,
    suspend_reason: null,
    version: 1,
    updated_by_employee_id: null,
    created_at: "2026-07-28T00:00:00.000Z",
    updated_at: "2026-07-28T00:00:00.000Z",
  };
}
