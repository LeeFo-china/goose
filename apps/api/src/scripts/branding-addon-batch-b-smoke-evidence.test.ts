import { describe, expect, test } from "bun:test";

import packageJson from "../../package.json";

import {
  BrandingAddonSmokeFailure,
  type FetchLike,
} from "./branding-addon-batch-b-smoke-support";
import { runBrandingAddonBatchBSmoke } from "./branding-addon-batch-b-smoke";

const ADMIN_TOKEN = "admin-contract-secret";
const ISOLATION_TOKEN = "isolation-contract-secret";
const ORDER_ID = "10000000-0000-4000-8000-000000000001";

describe("branding add-on smoke execution contract", () => {
  test("disables Bun implicit .env discovery in the package command", () => {
    expect(packageJson.scripts["branding:addon:batch-b-smoke"]).toBe(
      "bun --env-file=/dev/null src/scripts/branding-addon-batch-b-smoke.ts",
    );
  });
});

describe("branding add-on smoke business contract evidence", () => {
  test.each([
    [
      "paid order",
      {
        idempotent: false,
        reused_pending: false,
        order: pendingOrder({ status: "paid" }),
        payment_request: paymentRequest(),
      },
    ],
    [
      "invalid initial create flags",
      {
        idempotent: true,
        reused_pending: false,
        order: pendingOrder(),
        payment_request: paymentRequest(),
      },
    ],
  ])("preserves HTTP evidence for a 200 %s response", async (_name, createData) => {
    let failure: BrandingAddonSmokeFailure | null = null;
    try {
      await runBrandingAddonBatchBSmoke({
        config: {
          baseUrl: "https://api.example.com",
          adminToken: ADMIN_TOKEN,
          isolationToken: ISOLATION_TOKEN,
          platformToken: null,
          realPayRequested: false,
        },
        fetchImpl: createFetch(createData),
        uuidFactory: () => "20000000-0000-4000-8000-000000000002",
      });
    } catch (error) {
      failure = error as BrandingAddonSmokeFailure;
    }

    expect(failure).toBeInstanceOf(BrandingAddonSmokeFailure);
    expect(failure).toMatchObject({
      code: "BRANDING_ADDON_SMOKE_CONTRACT_INVALID",
      http_status: 200,
      request_id: "req-create-contract",
      response: {
        data: {
          idempotent: createData.idempotent,
          reused_pending: createData.reused_pending,
          order: createData.order,
        },
        requestId: "req-create-contract",
      },
    });
    const serialized = JSON.stringify(failure?.response);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain(ADMIN_TOKEN);
    expect(serialized).not.toContain(ISOLATION_TOKEN);
  });
});

function createFetch(
  createData: Record<string, unknown>,
): FetchLike {
  return async (url, init) => {
    const path = new URL(String(url)).pathname;
    const token = String(
      new Headers(init?.headers).get("authorization") ?? "",
    ).replace("Bearer ", "");
    if (path === "/tenant/branding/entitlement-product") {
      return jsonResponse({
        data: {
          product: {
            code: "custom_support_branding_annual",
            amount_fen: 1,
            term_years: 1,
            purchase_action: { enabled: true, disabled_reason: null },
          },
        },
      });
    }
    if (path === "/branding/effective") {
      const displayName = token === ADMIN_TOKEN ? "租户品牌" : "平台品牌";
      return jsonResponse({
        data: {
          source: token === ADMIN_TOKEN ? "tenant" : "platform",
          display_name: displayName,
          logo_url: "https://cdn.example.com/logo.png",
          support_text: displayName,
          version: 1,
        },
      });
    }
    return jsonResponse({
      data: createData,
      message: `${ADMIN_TOKEN} ${ISOLATION_TOKEN}`,
      requestId: "req-create-contract",
    });
  };
}

function pendingOrder(patch: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    order_no: "BA202607280001",
    product_code: "custom_support_branding_annual",
    product_name: "年度品牌权益",
    amount_fen: 1,
    term_years: 1,
    status: "pending",
    expires_at: "2026-07-28T00:05:00.000Z",
    created_at: "2026-07-28T00:00:00.000Z",
    ...patch,
  };
}

function paymentRequest() {
  return {
    timeStamp: "123",
    nonceStr: "nonce",
    package: "prepay_id=prepay",
    signType: "RSA",
    paySign: "signature",
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
