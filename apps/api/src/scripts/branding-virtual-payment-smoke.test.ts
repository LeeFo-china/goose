import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  parseBrandingVirtualPaymentSmokeConfig,
  runBrandingVirtualPaymentSmoke,
  toBrandingVirtualPaymentSmokeLog,
} from "./branding-virtual-payment-smoke";

describe("branding virtual payment smoke safety contract", () => {
  test("never sends a real payment or refund", () => {
    const source = readFileSync(resolve(
      import.meta.dir,
      "branding-virtual-payment-smoke.ts",
    ), "utf8");

    expect(source).toContain("/tenant/branding/entitlement-product");
    expect(source).toContain(
      "/platform/branding/entitlement-orders?page=1&pageSize=20",
    );
    expect(source).toContain("/wechat/virtual-payment/events");
    expect(source).not.toContain("wx.requestVirtualPayment");
    expect(source).not.toContain("/xpay/refund_order");
  });

  test("keeps sandbox order creation behind an explicit opt-in", () => {
    const source = readFileSync(resolve(
      import.meta.dir,
      "branding-virtual-payment-smoke.ts",
    ), "utf8");

    expect(source).toContain("VIRTUAL_PAYMENT_SMOKE_ALLOW_SANDBOX_ORDER");
    expect(source).toContain("environment !== \"sandbox\"");
    expect(source).toContain("/tenant/branding/virtual-payment/orders");
  });
});

describe("branding virtual payment smoke execution", () => {
  test("is read-only by default while checking capability, schema and pagination", async () => {
    const calls: Array<{ path: string; method: string; body: string }> = [];
    const result = await runBrandingVirtualPaymentSmoke({
      config: config(),
      fetchImpl: createFetch(calls),
      uuidFactory: () => "11111111-1111-4111-8111-111111111111",
    });

    expect(result).toMatchObject({
      ok: true,
      mode: "read_only",
      payment_attempted: false,
      refund_attempted: false,
      sandbox_order: null,
    });
    expect(calls.filter(({ path }) =>
      path === "/tenant/branding/virtual-payment/orders"
    )).toHaveLength(5);
    expect(calls.map(({ body }) => body)).toContain(JSON.stringify({
      product_code: "custom_support_branding_annual",
      idempotency_key: "11111111-1111-4111-8111-111111111111",
      requested_platform: "android",
      amount_fen: 100,
    }));
    expect(calls.some(({ path }) => path.includes("payment-request"))).toBeFalse();
    expect(calls.some(({ path }) => path.includes("refund"))).toBeFalse();
  });

  test("fails before order creation when sandbox runtime is not confirmed", async () => {
    const calls: Array<{ path: string; method: string; body: string }> = [];

    const error = await runBrandingVirtualPaymentSmoke({
      config: { ...config(), allowSandboxOrder: true },
      fetchImpl: createFetch(calls),
    }).catch((caught) => caught);

    expect(error).toMatchObject({
      code: "VIRTUAL_PAYMENT_SMOKE_SANDBOX_RUNTIME_UNCONFIRMED",
      response: { order_created: false },
    });
    expect(calls.filter(({ path }) =>
      path === "/tenant/branding/virtual-payment/orders"
    )).toHaveLength(5);
  });

  test("creates only a server-confirmed sandbox order and hashes the trade number", async () => {
    const calls: Array<{ path: string; method: string; body: string }> = [];
    const result = await runBrandingVirtualPaymentSmoke({
      config: { ...config(), allowSandboxOrder: true },
      fetchImpl: createFetch(calls, {
        tenantEnvironment: "sandbox",
        sandboxOrderCreationSupported: true,
      }),
      uuidFactory: () => "11111111-1111-4111-8111-111111111111",
    });

    expect(result).toMatchObject({
      mode: "sandbox_order_created",
      sandbox_order: {
        id: "22222222-2222-4222-8222-222222222222",
        environment: "sandbox",
        payment_status: "pending",
      },
      payment_attempted: false,
      refund_attempted: false,
    });
    expect(JSON.stringify(result)).not.toContain("VIRTUAL-TRADE-NO-SECRET");
    expect(calls.filter(({ path }) =>
      path === "/tenant/branding/virtual-payment/orders"
    )).toHaveLength(6);
  });

  test("does not trust a sandbox environment without an explicit server capability", async () => {
    const calls: Array<{ path: string; method: string; body: string }> = [];
    const error = await runBrandingVirtualPaymentSmoke({
      config: { ...config(), allowSandboxOrder: true },
      fetchImpl: createFetch(calls, { tenantEnvironment: "sandbox" }),
    }).catch((caught) => caught);

    expect(error).toMatchObject({
      code: "VIRTUAL_PAYMENT_SMOKE_SANDBOX_RUNTIME_UNCONFIRMED",
      response: { order_created: false },
    });
    expect(calls.filter(({ path }) =>
      path === "/tenant/branding/virtual-payment/orders"
    )).toHaveLength(5);
  });

  test("rejects an auth-protected callback instead of treating it as reachable", async () => {
    const error = await runBrandingVirtualPaymentSmoke({
      config: config(),
      fetchImpl: createFetch([], { callbackStatus: 401 }),
    }).catch((caught) => caught);

    expect(error).toMatchObject({ http_status: 401 });
  });

  test("rejects malformed pagination totals", async () => {
    const error = await runBrandingVirtualPaymentSmoke({
      config: config(),
      fetchImpl: createFetch([], { invalidPagination: true }),
    }).catch((caught) => caught);

    expect(error).toMatchObject({ code: "BRANDING_ADDON_SMOKE_CONTRACT_INVALID" });
  });

  test("requires separate tenant and platform tokens", () => {
    expect(parseBrandingVirtualPaymentSmokeConfig({
      API_BASE_URL: "https://api.example.com",
      VIRTUAL_PAYMENT_SMOKE_TENANT_TOKEN: "same-token",
      VIRTUAL_PAYMENT_SMOKE_PLATFORM_TOKEN: "same-token",
    })).toEqual({
      ok: false,
      errors: ["tenant and platform smoke tokens must differ"],
    });
  });

  test("requires HTTPS except for explicit loopback development hosts", () => {
    const base = {
      VIRTUAL_PAYMENT_SMOKE_TENANT_TOKEN: "tenant-token",
      VIRTUAL_PAYMENT_SMOKE_PLATFORM_TOKEN: "platform-token",
    };
    expect(parseBrandingVirtualPaymentSmokeConfig({
      ...base,
      API_BASE_URL: "http://192.168.1.17:3000",
    })).toMatchObject({
      ok: false,
      errors: ["API_BASE_URL must use HTTPS unless it targets loopback"],
    });
    expect(parseBrandingVirtualPaymentSmokeConfig({
      ...base,
      API_BASE_URL: "http://127.0.0.1:3000",
    })).toMatchObject({ ok: true });
    expect(parseBrandingVirtualPaymentSmokeConfig({
      ...base,
      API_BASE_URL: "https://",
    })).toMatchObject({
      ok: false,
      errors: ["API_BASE_URL must be an absolute HTTP(S) URL"],
    });
  });

  test("keeps console evidence within the documented whitelist", () => {
    const log = toBrandingVirtualPaymentSmokeLog({
      ok: true,
      mode: "read_only",
      capability: "wx.requestVirtualPayment",
      purchase_mode: "maintenance",
      mappings: [{
        environment: "sandbox",
        status: "active",
        validation_status: "valid",
      }],
      checks: [{
        name: "secret diagnostic name",
        method: "GET",
        path: "/private/path",
        http_status: 200,
        code: null,
        request_id: "request-1",
      }],
      sandbox_order: null,
      payment_attempted: false,
      refund_attempted: false,
    });

    expect(log).toEqual({
      ok: true,
      mode: "read_only",
      request_ids: ["request-1"],
      mappings: [{
        environment: "sandbox",
        status: "active",
        validation_status: "valid",
      }],
      sandbox_order: null,
    });
  });
});

function config() {
  return {
    baseUrl: "https://api.example.com",
    tenantToken: "tenant-token",
    platformToken: "platform-token",
    allowSandboxOrder: false,
    requestedPlatform: "android" as const,
  };
}

function createFetch(
  calls: Array<{ path: string; method: string; body: string }>,
  options: {
    tenantEnvironment?: "sandbox";
    sandboxOrderCreationSupported?: boolean;
    callbackStatus?: 400 | 401;
    invalidPagination?: boolean;
  } = {},
) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = `${url.pathname}${url.search}`;
    const method = String(init?.method ?? "GET");
    const body = String(init?.body ?? "");
    calls.push({ path: url.pathname, method, body });

    if (path === "/tenant/branding/entitlement-product") {
      return jsonResponse(200, {
        data: {
          product: {
            capability: "wx.requestVirtualPayment",
            payment_channel: "wechat_virtual",
            purchase_mode: "maintenance",
            minimum_amount_fen: 100,
            ...(options.tenantEnvironment
              ? { environment: options.tenantEnvironment }
              : {}),
            ...(options.sandboxOrderCreationSupported
              ? { sandbox_order_creation_supported: true }
              : {}),
          },
        },
      });
    }
    if (path === "/platform/branding/entitlement-product") {
      return jsonResponse(200, {
        data: {
          product: { purchase_mode: "maintenance" },
          virtual_products: [
            {
              environment: "sandbox",
              status: "active",
              validation_status: "valid",
            },
            {
              environment: "production",
              status: "active",
              validation_status: "valid",
            },
          ],
        },
      });
    }
    if (url.pathname === "/tenant/branding/virtual-payment/orders") {
      const parsedBody = JSON.parse(body || "{}") as Record<string, unknown>;
      const keys = Object.keys(parsedBody).sort();
      const valid = parsedBody.product_code ===
          "custom_support_branding_annual" &&
        parsedBody.idempotency_key ===
          "11111111-1111-4111-8111-111111111111" &&
        parsedBody.requested_platform === "android" &&
        keys.join(",") ===
          "idempotency_key,product_code,requested_platform";
      if (!valid) {
        return jsonResponse(400, {
          code: "VALIDATION_ERROR",
          message: "参数校验失败",
          requestId: "request-schema",
        });
      }
      return jsonResponse(200, {
        data: {
          order: {
            id: "22222222-2222-4222-8222-222222222222",
            out_trade_no: "VIRTUAL-TRADE-NO-SECRET",
            environment: "sandbox",
            payment_status: "pending",
            fulfillment_status: "pending",
            refund_status: "none",
          },
        },
        requestId: "request-create",
      });
    }
    if (path.includes("/branding/entitlement-orders?page=1&pageSize=20")) {
      return jsonResponse(200, {
        data: {
          list: [],
          pagination: options.invalidPagination
            ? { page: 1, pageSize: 20, total: -1, totalPages: "zero" }
            : { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        },
      });
    }
    if (path === "/wechat/virtual-payment/events") {
      const status = options.callbackStatus ?? 400;
      return jsonResponse(status, {
        code: status === 400
          ? "WECHAT_VIRTUAL_MESSAGE_AUTH_INPUT_INVALID"
          : "UNAUTHORIZED",
        message: "invalid verification query",
        requestId: "request-callback",
      });
    }
    return jsonResponse(404, { code: "NOT_FOUND" });
  };
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
