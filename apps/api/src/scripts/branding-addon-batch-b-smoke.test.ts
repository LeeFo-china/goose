import { describe, expect, test } from "bun:test";

import {
  parseBrandingAddonBatchBSmokeConfig,
  redactBrandingAddonSmokeValue,
  runBrandingAddonBatchBSmoke,
  sanitizeBrandingAddonSmokeOutput,
} from "./branding-addon-batch-b-smoke";
import {
  assertExpectedEffectiveBranding,
} from "./branding-addon-batch-b-smoke-contracts";

const ADMIN_TOKEN = "admin-secret-token";
const ISOLATION_TOKEN = "isolation-secret-token";
const PLATFORM_TOKEN = "platform-secret-token";
const ORDER_ID = "10000000-0000-4000-8000-000000000001";
const PRODUCT_CODE = "custom_support_branding_annual";

describe("parseBrandingAddonBatchBSmokeConfig", () => {
  test("requires an explicit base URL and two isolated tenant tokens", () => {
    expect(parseBrandingAddonBatchBSmokeConfig({}, [])).toEqual({
      ok: false,
      errors: [
        "API_BASE_URL is required",
        "BRANDING_ADDON_SMOKE_ADMIN_TOKEN is required",
        "BRANDING_ADDON_SMOKE_ISOLATION_TOKEN is required",
      ],
    });
  });

  test("normalizes safe inputs and only enables the manual real-pay checklist by flag", () => {
    expect(parseBrandingAddonBatchBSmokeConfig({
      GOOES_API_BASE_URL: " https://api.example.com/ ",
      BRANDING_ADDON_SMOKE_ADMIN_TOKEN: ` ${ADMIN_TOKEN} `,
      BRANDING_ADDON_SMOKE_ISOLATION_TOKEN: ` ${ISOLATION_TOKEN} `,
      BRANDING_ADDON_SMOKE_PLATFORM_TOKEN: ` ${PLATFORM_TOKEN} `,
    }, ["--real-pay"])).toEqual({
      ok: true,
      config: {
        baseUrl: "https://api.example.com",
        adminToken: ADMIN_TOKEN,
        isolationToken: ISOLATION_TOKEN,
        platformToken: PLATFORM_TOKEN,
        realPayRequested: true,
      },
    });
  });

  test("rejects equal tenant tokens because they cannot prove isolation", () => {
    expect(parseBrandingAddonBatchBSmokeConfig({
      GOOES_API_BASE_URL: "https://api.example.com",
      BRANDING_ADDON_SMOKE_ADMIN_TOKEN: ADMIN_TOKEN,
      BRANDING_ADDON_SMOKE_ISOLATION_TOKEN: ADMIN_TOKEN,
    }, [])).toEqual({
      ok: false,
      errors: [
        "BRANDING_ADDON_SMOKE_ADMIN_TOKEN and BRANDING_ADDON_SMOKE_ISOLATION_TOKEN must differ",
      ],
    });
  });
});

describe("redactBrandingAddonSmokeValue", () => {
  test("removes credentials and payment identifiers while retaining contract evidence", () => {
    const serialized = JSON.stringify(redactBrandingAddonSmokeValue({
      order_no: "BA202607280001",
      token: ADMIN_TOKEN,
      message: `unexpected echo ${ADMIN_TOKEN}`,
      payer_openid: "openid-secret",
      transaction_id: "wechat-transaction",
      payment_request: {
        timeStamp: "123",
        nonceStr: "nonce-secret",
        package: "prepay_id=secret",
        signType: "RSA",
        paySign: "payment-signature",
      },
      nested: { api_v3_key: "api-v3-secret" },
    }, [ADMIN_TOKEN]));

    expect(serialized).toContain("BA202607280001");
    for (
      const secret of [
        ADMIN_TOKEN,
        "openid-secret",
        "wechat-transaction",
        "nonce-secret",
        "prepay_id=secret",
        "payment-signature",
        "api-v3-secret",
      ]
    ) {
      expect(serialized).not.toContain(secret);
    }
  });

  test("re-sanitizes final CLI output with all configured tokens", () => {
    const output = JSON.stringify(sanitizeBrandingAddonSmokeOutput({
      baseUrl: "https://api.example.com",
      adminToken: ADMIN_TOKEN,
      isolationToken: ISOLATION_TOKEN,
      platformToken: PLATFORM_TOKEN,
      realPayRequested: false,
    }, {
      message: `${ADMIN_TOKEN} ${ISOLATION_TOKEN} ${PLATFORM_TOKEN}`,
    }));

    for (const secret of [ADMIN_TOKEN, ISOLATION_TOKEN, PLATFORM_TOKEN]) {
      expect(output).not.toContain(secret);
    }
  });
});

describe("assertExpectedEffectiveBranding", () => {
  test("requires the entitled tenant brand and the no-entitlement platform fallback", () => {
    const tenant = {
      source: "tenant",
      tenant_id: "tenant-a",
      display_name: "租户品牌",
      logo_url: "https://cdn.example.com/tenant.png",
      support_text: "租户品牌",
      version: 2,
    };
    const platform = {
      source: "platform",
      tenant_id: null,
      display_name: "平台品牌",
      logo_url: "https://cdn.example.com/platform.png",
      support_text: "平台品牌",
      version: 3,
    };

    expect(() =>
      assertExpectedEffectiveBranding(tenant, "tenant")
    ).not.toThrow();
    expect(() =>
      assertExpectedEffectiveBranding(platform, "platform")
    ).not.toThrow();
    expect(() =>
      assertExpectedEffectiveBranding(tenant, "platform")
    ).toThrow("effective branding source must be platform");
  });
});

describe("runBrandingAddonBatchBSmoke", () => {
  test("checks tenant isolation, pending reuse, payment contract and optional platform audit without paying", async () => {
    const calls: Array<{
      method: string;
      path: string;
      token: string;
      body: Record<string, unknown> | null;
    }> = [];
    let createCount = 0;

    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      const method = init?.method ?? "GET";
      const token = String(
        new Headers(init?.headers).get("authorization") ?? "",
      ).replace("Bearer ", "");
      const body = typeof init?.body === "string"
        ? JSON.parse(init.body) as Record<string, unknown>
        : null;
      calls.push({ method, path: `${parsed.pathname}${parsed.search}`, token, body });

      if (
        parsed.pathname ===
          `/tenant/branding/entitlement-orders/${ORDER_ID}` &&
        token === ISOLATION_TOKEN
      ) {
        return jsonResponse({
          success: false,
          message: "年度品牌权益订单不存在",
          code: "BRANDING_ADDON_ORDER_NOT_FOUND",
          requestId: "req-isolation",
        }, 404);
      }

      if (parsed.pathname === "/tenant/branding/entitlement-product") {
        return jsonResponse({
          data: {
            product: {
              code: PRODUCT_CODE,
              amount_fen: 1,
              term_years: 1,
              purchase_notes: "年度权益",
              refund_policy: "数字权益支付成功并开通后不支持退款",
              purchase_action: { enabled: true, disabled_reason: null },
            },
            server_time: "2026-07-28T00:00:00.000Z",
          },
          message: token === ADMIN_TOKEN
            ? `unexpected echo ${ISOLATION_TOKEN} ${PLATFORM_TOKEN}`
            : "success",
        });
      }

      if (parsed.pathname === "/branding/effective") {
        return jsonResponse({
          data: {
            source: token === ADMIN_TOKEN ? "tenant" : "platform",
            tenant_id: token === ADMIN_TOKEN ? "tenant-a" : null,
            display_name: token === ADMIN_TOKEN ? "租户品牌" : "平台品牌",
            logo_url: "https://cdn.example.com/logo.png",
            support_text: token === ADMIN_TOKEN ? "租户品牌" : "平台品牌",
            version: 2,
          },
          message: "success",
        });
      }

      if (
        parsed.pathname === "/tenant/branding/entitlement-orders" &&
        method === "POST"
      ) {
        createCount += 1;
        return jsonResponse({
          data: {
            idempotent: createCount === 2,
            reused_pending: createCount === 3,
            order: pendingOrder(),
            payment_request: paymentRequest(),
            server_time: "2026-07-28T00:00:00.000Z",
          },
          message: "success",
        });
      }

      if (
        parsed.pathname ===
          `/tenant/branding/entitlement-orders/${ORDER_ID}/payment-request`
      ) {
        return jsonResponse({
          data: {
            order: pendingOrder(),
            payment_request: paymentRequest(),
            server_time: "2026-07-28T00:00:00.000Z",
          },
          message: "success",
        });
      }

      if (
        parsed.pathname === `/tenant/branding/entitlement-orders/${ORDER_ID}`
      ) {
        return jsonResponse({
          data: {
            order: pendingOrder(),
            server_time: "2026-07-28T00:00:00.000Z",
          },
          message: "success",
        });
      }

      if (parsed.pathname === "/tenant/branding/entitlement-orders") {
        return jsonResponse({
          data: {
            list: [pendingOrder()],
            pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
            server_time: "2026-07-28T00:00:00.000Z",
          },
          message: "success",
        });
      }

      if (parsed.pathname === "/platform/branding/entitlement-product") {
        return jsonResponse({
          data: {
            product: {
              code: PRODUCT_CODE,
              amount_fen: 1,
              term_years: 1,
              enabled: true,
              version: 2,
            },
          },
          message: "success",
        });
      }

      if (parsed.pathname === "/platform/branding/entitlement-orders") {
        return jsonResponse({
          data: {
            list: [{ ...pendingOrder(), tenant_id: "tenant-a" }],
            pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          },
          message: "success",
        });
      }

      if (
        parsed.pathname ===
          `/platform/branding/entitlement-orders/${ORDER_ID}`
      ) {
        return jsonResponse({
          data: {
            order: { ...pendingOrder(), tenant_id: "tenant-a" },
            entitlement: null,
            entitlement_event: null,
            audit: null,
          },
          message: "success",
        });
      }

      return jsonResponse({
        success: false,
        code: "ROUTE_NOT_FOUND",
        requestId: "req-unexpected",
      }, 404);
    };

    const result = await runBrandingAddonBatchBSmoke({
      config: {
        baseUrl: "https://api.example.com",
        adminToken: ADMIN_TOKEN,
        isolationToken: ISOLATION_TOKEN,
        platformToken: PLATFORM_TOKEN,
        realPayRequested: false,
      },
      fetchImpl,
      uuidFactory: sequenceUuidFactory(),
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("api_only");
    expect(result.order_no).toBe("BA202607280001");
    expect(result.real_payment).toEqual({
      attempted: false,
      next_step:
        "在小程序开发构建中使用同一测试租户查询订单并调用 wx.requestPayment；支付结果最终以订单和权益接口为准。",
    });
    expect(result.checks.map((check) => check.name)).toEqual([
      "tenant product (admin)",
      "tenant product (isolation)",
      "batch A effective (admin)",
      "batch A effective (isolation)",
      "create pending order",
      "idempotency replay",
      "reuse pending order",
      "tenant order list",
      "tenant order detail",
      "cross-tenant order isolation",
      "payment request",
      "platform product",
      "platform order list",
      "platform order audit",
    ]);
    expect(result.checks.find((check) =>
      check.name === "cross-tenant order isolation"
    )).toMatchObject({
      http_status: 404,
      code: "BRANDING_ADDON_ORDER_NOT_FOUND",
      request_id: "req-isolation",
    });

    const createCalls = calls.filter((call) =>
      call.path === "/tenant/branding/entitlement-orders" &&
      call.method === "POST"
    );
    expect(createCalls).toHaveLength(3);
    expect(createCalls[0]?.body).toEqual({
      product_code: PRODUCT_CODE,
      idempotency_key: "00000000-0000-4000-8000-000000000001",
    });
    expect(createCalls[1]?.body).toEqual(createCalls[0]?.body);
    expect(createCalls[2]?.body).toEqual({
      product_code: PRODUCT_CODE,
      idempotency_key: "00000000-0000-4000-8000-000000000002",
    });
    expect(calls.some((call) => call.path.includes("callback"))).toBe(false);
    expect(calls.some((call) => call.path.includes("refund"))).toBe(false);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(ADMIN_TOKEN);
    expect(serialized).not.toContain(ISOLATION_TOKEN);
    expect(serialized).not.toContain(PLATFORM_TOKEN);
    expect(serialized).not.toContain("openid-secret");
    expect(serialized).not.toContain("pay-sign-secret");
  });

  test("reports an explicit precondition failure when the product is unavailable", async () => {
    await expect(runBrandingAddonBatchBSmoke({
      config: {
        baseUrl: "https://api.example.com",
        adminToken: ADMIN_TOKEN,
        isolationToken: ISOLATION_TOKEN,
        platformToken: null,
        realPayRequested: false,
      },
      fetchImpl: async () =>
        jsonResponse({
          success: false,
          message: "年度品牌权益商品不存在或未上架",
          code: "BRANDING_ADDON_PRODUCT_NOT_FOUND",
          requestId: "req-product",
        }, 404),
      uuidFactory: sequenceUuidFactory(),
    })).rejects.toMatchObject({
      code: "BRANDING_ADDON_SMOKE_PRECONDITION_PRODUCT_UNAVAILABLE",
      http_status: 404,
      request_id: "req-product",
    });
  });
});

function pendingOrder() {
  return {
    id: ORDER_ID,
    order_no: "BA202607280001",
    product_code: PRODUCT_CODE,
    product_name: "年度品牌权益",
    amount_fen: 1,
    term_years: 1,
    status: "pending",
    paid_at: null,
    expires_at: "2026-07-28T00:05:00.000Z",
    entitlement: null,
    payment_action: { enabled: true, disabled_reason: null },
    created_at: "2026-07-28T00:00:00.000Z",
    updated_at: "2026-07-28T00:00:00.000Z",
  };
}

function paymentRequest() {
  return {
    timeStamp: "123",
    nonceStr: "nonce-secret",
    package: "prepay_id=secret",
    signType: "RSA",
    paySign: "pay-sign-secret",
    payer_openid: "openid-secret",
  };
}

function sequenceUuidFactory() {
  let index = 0;
  return () => {
    index += 1;
    return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
