import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import {
  parseBrandingAddonBatchBSmokeConfig,
  redactBrandingAddonSmokeValue,
  requestBrandingAddonSmokeJson,
} from "./branding-addon-batch-b-smoke-support";

const ADMIN_TOKEN = "admin-token-private";
const ISOLATION_TOKEN = "isolation-token-private";
const PLATFORM_TOKEN = "platform-token-private";
const SECRETS = [ADMIN_TOKEN, ISOLATION_TOKEN, PLATFORM_TOKEN] as const;

describe("branding add-on smoke base URL config", () => {
  const requiredTokens = {
    BRANDING_ADDON_SMOKE_ADMIN_TOKEN: ADMIN_TOKEN,
    BRANDING_ADDON_SMOKE_ISOLATION_TOKEN: ISOLATION_TOKEN,
  };

  test("uses API_BASE_URL as the primary explicit target", () => {
    expect(parseBrandingAddonBatchBSmokeConfig({
      API_BASE_URL: " https://api.example.com/ ",
      ...requiredTokens,
    }, [])).toMatchObject({
      ok: true,
      config: { baseUrl: "https://api.example.com" },
    });
  });

  test("allows the legacy URL only when the primary target is absent", () => {
    expect(parseBrandingAddonBatchBSmokeConfig({
      GOOES_API_BASE_URL: "https://legacy.example.com/",
      ...requiredTokens,
    }, [])).toMatchObject({
      ok: true,
      config: { baseUrl: "https://legacy.example.com" },
    });
  });

  test("rejects conflicting primary and legacy targets", () => {
    expect(parseBrandingAddonBatchBSmokeConfig({
      API_BASE_URL: "https://api.example.com",
      GOOES_API_BASE_URL: "https://other.example.com",
      ...requiredTokens,
    }, [])).toEqual({
      ok: false,
      errors: [
        "API_BASE_URL and GOOES_API_BASE_URL must match when both are set",
      ],
    });
  });

  test("names the primary variable when no target is configured", () => {
    expect(parseBrandingAddonBatchBSmokeConfig(requiredTokens, [])).toEqual({
      ok: false,
      errors: ["API_BASE_URL is required"],
    });
  });
});

describe("branding add-on smoke sanitizer", () => {
  test("redacts every configured token even when another identity response echoes it", () => {
    const output = JSON.stringify(redactBrandingAddonSmokeValue({
      admin_response: `echo ${ISOLATION_TOKEN} and ${PLATFORM_TOKEN}`,
      isolation_response: ADMIN_TOKEN,
      order_no: "BA202607280001",
    }, SECRETS));

    expect(output).toContain("BA202607280001");
    for (const secret of SECRETS) expect(output).not.toContain(secret);
  });

  test("bounds circular objects with a stable marker", () => {
    const circular: Record<string, unknown> = { order_no: "BA202607280001" };
    circular.self = circular;

    expect(redactBrandingAddonSmokeValue(circular, SECRETS)).toEqual({
      order_no: "BA202607280001",
      self: "[CIRCULAR]",
    });
  });
});

describe("requestBrandingAddonSmokeJson timeout and evidence", () => {
  test("times out a request that never returns and aborts its signal", async () => {
    const signalRef: { current: AbortSignal | null } = { current: null };
    const pending = requestBrandingAddonSmokeJson({
      name: "request timeout",
      baseUrl: "https://api.example.com",
      path: "/slow",
      token: ADMIN_TOKEN,
      secretValues: SECRETS,
      timeoutMs: 10,
      fetchImpl: async (_url, init) => {
        signalRef.current = init?.signal as AbortSignal;
        return await new Promise<Response>(() => {});
      },
    });

    await expect(pending).rejects.toMatchObject({
      code: "BRANDING_ADDON_SMOKE_TIMEOUT",
      http_status: 0,
      request_id: null,
      response: {
        method: "GET",
        path: "/slow",
        phase: "request",
      },
    });
    expect(signalRef.current).toBeInstanceOf(AbortSignal);
    expect(signalRef.current?.aborted).toBe(true);
  });

  test("applies the same deadline to a hanging response body", async () => {
    const body = new ReadableStream<Uint8Array>({
      start() {
        // Intentionally never enqueue or close.
      },
    });

    await expect(requestBrandingAddonSmokeJson({
      name: "body timeout",
      baseUrl: "https://api.example.com",
      path: "/slow-body",
      token: ADMIN_TOKEN,
      secretValues: SECRETS,
      timeoutMs: 10,
      fetchImpl: async () =>
        new Response(body, {
          status: 200,
          headers: { "x-request-id": "req-body-timeout" },
        }),
    })).rejects.toMatchObject({
      code: "BRANDING_ADDON_SMOKE_TIMEOUT",
      http_status: 200,
      request_id: "req-body-timeout",
      response: {
        method: "GET",
        path: "/slow-body",
        phase: "response_body",
      },
    });
  });

  test("fingerprints invalid text without retaining unknown payment values", async () => {
    const dynamicPaySign = "dynamic-pay-sign-not-in-secret-list";
    const dynamicPrepayId = "wx-prepay-dynamic-123";
    const dynamicOpenid = "openid-dynamic-456";
    const invalidBody =
      `paySign=${dynamicPaySign}&prepay_id=${dynamicPrepayId}` +
      `&openid=${dynamicOpenid}&${"x".repeat(2_000)}`;

    let failure: {
      code?: string;
      http_status?: number;
      request_id?: string | null;
      response?: unknown;
    } = {};
    try {
      await requestBrandingAddonSmokeJson({
        name: "bad gateway",
        baseUrl: "https://api.example.com",
        path: "/invalid-json",
        token: ADMIN_TOKEN,
        secretValues: SECRETS,
        timeoutMs: 100,
        fetchImpl: async () =>
          new Response(invalidBody, {
            status: 502,
            headers: {
              "content-type": "text/plain",
              "x-request-id": "req-invalid-json",
            },
          }),
      });
    } catch (error) {
      failure = error as typeof failure;
    }

    expect(failure).toMatchObject({
      code: "BRANDING_ADDON_SMOKE_HTTP_ERROR",
      http_status: 502,
      request_id: "req-invalid-json",
    });
    expect(failure.response).toEqual({
      summary: "NON_JSON_RESPONSE",
      body_length: invalidBody.length,
      body_sha256: sha256(invalidBody),
    });
    const serialized = JSON.stringify(failure.response);
    for (
      const secret of [dynamicPaySign, dynamicPrepayId, dynamicOpenid]
    ) {
      expect(serialized).not.toContain(secret);
    }
    for (const field of ["paySign", "prepay_id", "openid"]) {
      expect(serialized).not.toContain(field);
    }
  });

  test("fingerprints oversized JSON without retaining its dynamic fields", async () => {
    const dynamicPaySign = "oversized-dynamic-pay-sign";
    const oversizedBody = JSON.stringify({
      data: { paySign: dynamicPaySign },
      padding: "x".repeat(300_000),
    });

    let failure: BrandingFailureLike = {};
    try {
      await requestBrandingAddonSmokeJson({
        name: "oversized",
        baseUrl: "https://api.example.com",
        path: "/oversized",
        token: ADMIN_TOKEN,
        secretValues: SECRETS,
        timeoutMs: 100,
        fetchImpl: async () =>
          new Response(oversizedBody, {
            status: 200,
            headers: { "x-request-id": "req-oversized" },
          }),
      });
    } catch (error) {
      failure = error as BrandingFailureLike;
    }

    expect(failure).toMatchObject({
      code: "BRANDING_ADDON_SMOKE_RESPONSE_INVALID",
      http_status: 200,
      request_id: "req-oversized",
      response: {
        summary: "RESPONSE_BODY_TOO_LARGE",
        body_length: oversizedBody.length,
        body_sha256: sha256(oversizedBody),
      },
    });
    const serialized = JSON.stringify(failure.response);
    expect(serialized).not.toContain(dynamicPaySign);
    expect(serialized).not.toContain("paySign");
  });

  test("reports a 200 response-envelope drift with its real HTTP evidence", async () => {
    const invalidEnvelope = JSON.stringify({ message: PLATFORM_TOKEN });
    await expect(requestBrandingAddonSmokeJson({
      name: "drift",
      baseUrl: "https://api.example.com",
      path: "/drift",
      token: ADMIN_TOKEN,
      secretValues: SECRETS,
      timeoutMs: 100,
      fetchImpl: async () =>
        new Response(invalidEnvelope, {
          status: 200,
          headers: { "request-id": "req-drift" },
        }),
    })).rejects.toMatchObject({
      code: "BRANDING_ADDON_SMOKE_RESPONSE_INVALID",
      http_status: 200,
      request_id: "req-drift",
      response: {
        summary: "INVALID_RESPONSE_ENVELOPE",
        body_length: invalidEnvelope.length,
        body_sha256: sha256(invalidEnvelope),
      },
    });
  });
});

type BrandingFailureLike = {
  code?: string;
  http_status?: number;
  request_id?: string | null;
  response?: unknown;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
