import { describe, expect, test } from "bun:test";

import {
  parsePlatformServicePaymentSmokeConfig,
  runPlatformServicePaymentSmoke,
  toPlatformServicePaymentSmokeLog,
} from "./platform-service-payment-smoke";

describe("platform service payment smoke config", () => {
  test("defaults to dry-run and requires separated tokens", () => {
    expect(parsePlatformServicePaymentSmokeConfig({
      API_BASE_URL: "https://api.example.com",
      PLATFORM_SERVICE_SMOKE_TENANT_TOKEN: "tenant-token",
      PLATFORM_SERVICE_SMOKE_PLATFORM_TOKEN: "platform-token",
    }, [])).toMatchObject({
      ok: true,
      config: { mode: "dry_run" },
    });

    expect(parsePlatformServicePaymentSmokeConfig({
      API_BASE_URL: "https://api.example.com",
      PLATFORM_SERVICE_SMOKE_TENANT_TOKEN: "same-token",
      PLATFORM_SERVICE_SMOKE_PLATFORM_TOKEN: "same-token",
    }, [])).toEqual({
      ok: false,
      errors: ["tenant and platform smoke tokens must differ"],
    });
  });

  test("supports order lookup without allowing invalid order ids", () => {
    expect(parsePlatformServicePaymentSmokeConfig({
      API_BASE_URL: "https://api.example.com",
      PLATFORM_SERVICE_SMOKE_TENANT_TOKEN: "tenant-token",
      PLATFORM_SERVICE_SMOKE_PLATFORM_TOKEN: "platform-token",
    }, ["--order-id", "10000000-0000-4000-8000-000000000001"]))
      .toMatchObject({
        ok: true,
        config: {
          mode: "order_lookup",
          orderId: "10000000-0000-4000-8000-000000000001",
        },
      });

    expect(parsePlatformServicePaymentSmokeConfig({
      API_BASE_URL: "https://api.example.com",
      PLATFORM_SERVICE_SMOKE_TENANT_TOKEN: "tenant-token",
      PLATFORM_SERVICE_SMOKE_PLATFORM_TOKEN: "platform-token",
    }, ["--order-id", "not-a-uuid"])).toEqual({
      ok: false,
      errors: ["--order-id must be a UUID"],
    });
  });
});

describe("platform service payment smoke execution", () => {
  test("dry-run checks routes and products without creating a payable order", async () => {
    const calls: Array<{ path: string; method: string; body: string }> = [];

    const result = await runPlatformServicePaymentSmoke({
      config: config(),
      fetchImpl: createFetch(calls),
    });

    expect(result).toMatchObject({
      ok: true,
      mode: "dry_run",
      readiness: {
        tenant_products: true,
        tenant_order_list: true,
        platform_products: true,
        create_order_schema_probe: true,
      },
    });
    expect(result.products.map((product) => product.code)).toEqual([
      "platform_service_1y",
      "platform_service_2y",
      "platform_service_3y",
    ]);
    expect(calls).toEqual([
      {
        path: "/billing/service-products?page=1&pageSize=20",
        method: "GET",
        body: "",
      },
      {
        path: "/billing/service-orders?page=1&pageSize=20",
        method: "GET",
        body: "",
      },
      {
        path: "/platform/billing/service-products?page=1&pageSize=20",
        method: "GET",
        body: "",
      },
      {
        path: "/billing/service-orders",
        method: "POST",
        body: "{}",
      },
    ]);
  });

  test("order lookup reads an existing order only", async () => {
    const calls: Array<{ path: string; method: string; body: string }> = [];

    const result = await runPlatformServicePaymentSmoke({
      config: {
        ...config(),
        mode: "order_lookup",
        orderId: "10000000-0000-4000-8000-000000000001",
      },
      fetchImpl: createFetch(calls),
    });

    expect(result).toMatchObject({
      ok: true,
      mode: "order_lookup",
      order: {
        id: "10000000-0000-4000-8000-000000000001",
        order_no: "TSO202608030001",
        payment_status: "paid",
        service_status: "waiting_assignment",
      },
    });
    expect(calls).toEqual([{
      path: "/billing/service-orders/10000000-0000-4000-8000-000000000001",
      method: "GET",
      body: "",
    }]);
  });

  test("console log contains only whitelisted smoke evidence", () => {
    const log = toPlatformServicePaymentSmokeLog({
      ok: true,
      mode: "dry_run",
      api_environment: {
        base_url: "https://api.example.com",
        host: "api.example.com",
      },
      readiness: {
        tenant_products: true,
        tenant_order_list: true,
        platform_products: true,
        create_order_schema_probe: true,
      },
      products: [{
        code: "platform_service_1y",
        title: "平台服务 1 年",
        term_years: 1,
        amount_fen: 980000,
        list_amount_fen: 980000,
        pricing_version: 1,
        terms_version: 1,
      }],
      order: null,
      request_ids: ["req-1"],
      payment_attempted: false,
      order_created: false,
    });

    const serialized = JSON.stringify(log);
    expect(serialized).toContain("platform_service_1y");
    expect(serialized).not.toMatch(/token|openid|prepay|paySign|nonceStr/i);
    expect(log).toEqual({
      ok: true,
      mode: "dry_run",
      api_environment: {
        base_url: "https://api.example.com",
        host: "api.example.com",
      },
      readiness: {
        tenant_products: true,
        tenant_order_list: true,
        platform_products: true,
        create_order_schema_probe: true,
      },
      products: [{
        code: "platform_service_1y",
        title: "平台服务 1 年",
        term_years: 1,
        amount_fen: 980000,
        list_amount_fen: 980000,
        pricing_version: 1,
        terms_version: 1,
      }],
      order: null,
      request_ids: ["req-1"],
      payment_attempted: false,
      order_created: false,
    });
  });
});

function config() {
  return {
    baseUrl: "https://api.example.com",
    tenantToken: "tenant-token",
    platformToken: "platform-token",
    mode: "dry_run" as const,
    orderId: null,
  };
}

function createFetch(calls: Array<{ path: string; method: string; body: string }>) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = `${url.pathname}${url.search}`;
    const method = String(init?.method ?? "GET");
    const body = String(init?.body ?? "");
    calls.push({ path, method, body });

    if (path === "/billing/service-products?page=1&pageSize=20") {
      return jsonResponse(200, {
        data: {
          list: [
            product("platform_service_1y", 1, 980000, 980000),
            product("platform_service_2y", 2, 1568000, 1960000),
            product("platform_service_3y", 3, 2058000, 2940000),
          ],
          pagination: { page: 1, pageSize: 20, total: 3, totalPages: 1 },
        },
        requestId: "req-products",
      });
    }

    if (path === "/billing/service-orders?page=1&pageSize=20") {
      return jsonResponse(200, {
        data: {
          list: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        },
        requestId: "req-orders",
      });
    }

    if (path === "/platform/billing/service-products?page=1&pageSize=20") {
      return jsonResponse(200, {
        data: {
          list: [{ id: "product-1", code: "platform_service_1y" }],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
        requestId: "req-platform-products",
      });
    }

    if (path === "/billing/service-orders" && method === "POST") {
      return jsonResponse(400, {
        code: "VALIDATION_ERROR",
        requestId: "req-schema-probe",
      });
    }

    if (
      path === "/billing/service-orders/10000000-0000-4000-8000-000000000001"
    ) {
      return jsonResponse(200, {
        data: {
          order: {
            id: "10000000-0000-4000-8000-000000000001",
            order_no: "TSO202608030001",
            product_code: "platform_service_1y",
            term_years: 1,
            amount_fen: 980000,
            payment_status: "paid",
            service_status: "waiting_assignment",
            display_stage: "waiting_assignment",
            payment_expires_at: "2026-08-03T12:05:00.000Z",
            paid_at: "2026-08-03T12:01:00.000Z",
            terms_version: 1,
            version: 2,
          },
          server_time: "2026-08-03T12:02:00.000Z",
        },
        requestId: "req-order",
      });
    }

    return jsonResponse(404, {
      code: "NOT_FOUND",
      requestId: "req-404",
    });
  };
}

function product(
  code: string,
  termYears: number,
  amountFen: number,
  listAmountFen: number,
) {
  return {
    code,
    title: `平台服务 ${termYears} 年`,
    term_years: termYears,
    amount_fen: amountFen,
    list_amount_fen: listAmountFen,
    pricing_version: 1,
    terms_version: 1,
  };
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      "x-request-id": String(payload.requestId ?? "req-test"),
    },
  });
}
