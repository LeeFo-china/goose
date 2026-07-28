import { describe, expect, test } from "bun:test";

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

  test("preserves bounded sanitized invalid JSON evidence and header request ID", async () => {
    const longBody = `${ISOLATION_TOKEN}:${"x".repeat(2_000)}`;

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
          new Response(longBody, {
            status: 502,
            headers: { "x-request-id": "req-invalid-json" },
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
    const evidence = JSON.stringify(failure.response);
    expect(evidence).toContain("[TRUNCATED]");
    expect(evidence).not.toContain(ISOLATION_TOKEN);
    expect(evidence.length).toBeLessThan(1_500);
  });

  test("reports a 200 response-envelope drift with its real HTTP evidence", async () => {
    await expect(requestBrandingAddonSmokeJson({
      name: "drift",
      baseUrl: "https://api.example.com",
      path: "/drift",
      token: ADMIN_TOKEN,
      secretValues: SECRETS,
      timeoutMs: 100,
      fetchImpl: async () =>
        new Response(JSON.stringify({ message: PLATFORM_TOKEN }), {
          status: 200,
          headers: { "request-id": "req-drift" },
        }),
    })).rejects.toMatchObject({
      code: "BRANDING_ADDON_SMOKE_RESPONSE_INVALID",
      http_status: 200,
      request_id: "req-drift",
    });
  });
});
