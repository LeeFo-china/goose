import { describe, expect, test } from "bun:test";

import {
  BRANDING_SMOKE_RESPONSE_MAX_BYTES,
  BRANDING_SMOKE_TIMEOUT_MS,
  assertExpectedSmokeResponse,
  createBrandingSmokeAbortSignal,
  formatSmokeMarker,
  normalizeBrandingApiBaseUrl,
  parseSmokeResponse,
  readBoundedResponseText,
  redactSensitiveText,
} from "./verify-branding-tenant-isolation";

const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.signature-value";
const SECRET_ENV_VALUE = "fixture-secret-value";
const FOREIGN_TENANT_ID = "00000000-0000-4000-8000-000000000002";
const FOREIGN_FILE_ID = "00000000-0000-4000-8000-000000000099";

describe("branding tenant isolation smoke helpers", () => {
  test("redacts Bearer/JWT/authorization and configured environment secrets", () => {
    const source = [
      `Authorization: Bearer ${JWT}`,
      `"authorization":"${JWT}"`,
      `token=${JWT}`,
      `secret=${SECRET_ENV_VALUE}`,
    ].join("\n");

    const redacted = redactSensitiveText(source, [SECRET_ENV_VALUE]);

    expect(redacted).not.toContain(JWT);
    expect(redacted).not.toContain(SECRET_ENV_VALUE);
    expect(redacted).not.toMatch(/Bearer\s+eyJ/);
    expect(redacted).toContain("Bearer [REDACTED]");
    expect(redacted).toContain("[REDACTED_JWT]");
  });

  test("parses the current success envelope without retaining a response body", () => {
    const parsed = parseSmokeResponse({
      status: 200,
      text: JSON.stringify({
        data: {
          source: "platform",
          tenant_id: null,
          display_name: "字节跳动",
          logo_url: "https://cdn.example.com/logo.png",
          support_text: "字节跳动",
          version: 1,
          updated_at: "2026-07-27T10:00:00.000Z",
        },
        message: "success",
      }),
    });

    expect(parsed.status).toBe(200);
    expect(parsed.code).toBeNull();
    expect(parsed.requestId).toBeNull();
    expect(parsed.message).toBe("success");
    expect(parsed.data).toEqual({
      source: "platform",
      tenant_id: null,
      display_name: "字节跳动",
      logo_url: "https://cdn.example.com/logo.png",
      support_text: "字节跳动",
      version: 1,
      updated_at: "2026-07-27T10:00:00.000Z",
    });
    expect(parsed).not.toHaveProperty("text");
    expect(parsed).not.toHaveProperty("body");
  });

  test("parses stable error code and camel/snake request IDs", () => {
    const camel = parseSmokeResponse({
      status: 403,
      text: JSON.stringify({
        success: false,
        message: "当前租户尚未开通自定义品牌权益",
        code: "BRANDING_ENTITLEMENT_REQUIRED",
        requestId: "request-camel",
      }),
    });
    const snake = parseSmokeResponse({
      status: 404,
      text: JSON.stringify({
        success: false,
        message: "品牌 Logo 文件不存在",
        code: "BRANDING_LOGO_FILE_NOT_FOUND",
        request_id: "request-snake",
      }),
    });

    expect(camel.code).toBe("BRANDING_ENTITLEMENT_REQUIRED");
    expect(camel.requestId).toBe("request-camel");
    expect(snake.code).toBe("BRANDING_LOGO_FILE_NOT_FOUND");
    expect(snake.requestId).toBe("request-snake");
  });

  test("rejects ambiguous envelopes and errors without a safe request ID", () => {
    expect(() =>
      parseSmokeResponse({
        status: 200,
        text: JSON.stringify({
          data: {},
          message: "success",
          success: false,
          code: "INJECTED",
          requestId: "request-1",
        }),
      })
    ).toThrow(/envelope/i);
    expect(() =>
      parseSmokeResponse({
        status: 403,
        text: JSON.stringify({
          data: null,
          success: false,
          message: "denied",
          code: "FORBIDDEN",
          requestId: "request-2",
        }),
      })
    ).toThrow(/envelope/i);

    const missingRequestId = parseSmokeResponse({
      status: 403,
      text: JSON.stringify({
        success: false,
        message: "denied",
        code: "FORBIDDEN",
      }),
    });
    expect(() =>
      assertExpectedSmokeResponse(missingRequestId, {
        status: 403,
        code: "FORBIDDEN",
      })
    ).toThrow(/request.?id/i);
  });

  test("asserts expected status and stable code", () => {
    const parsed = parseSmokeResponse({
      status: 403,
      text: JSON.stringify({
        success: false,
        message: "denied",
        code: "BRANDING_ENTITLEMENT_REQUIRED",
        requestId: "request-1",
      }),
    });

    expect(() =>
      assertExpectedSmokeResponse(parsed, {
        status: 403,
        code: "BRANDING_ENTITLEMENT_REQUIRED",
      })
    ).not.toThrow();
    expect(() =>
      assertExpectedSmokeResponse(parsed, {
        status: 404,
        code: "BRANDING_LOGO_FILE_NOT_FOUND",
      })
    ).toThrow(/expected HTTP 404/i);
  });

  test("fails closed when a response leaks a foreign tenant or file ID", () => {
    expect(() =>
      parseSmokeResponse({
        status: 200,
        text: JSON.stringify({
          data: {
            nested: {
              tenant_id: FOREIGN_TENANT_ID,
            },
          },
          message: "success",
        }),
        forbiddenValues: [FOREIGN_TENANT_ID],
      })
    ).toThrow(/foreign identifier/i);

    expect(() =>
      parseSmokeResponse({
        status: 404,
        text: JSON.stringify({
          success: false,
          code: "BRANDING_LOGO_FILE_NOT_FOUND",
          requestId: "request-2",
          details: { file_id: FOREIGN_FILE_ID },
        }),
        forbiddenValues: [FOREIGN_FILE_ID],
      })
    ).toThrow(/foreign identifier/i);
  });

  test("formats only the safe status/code/request_id smoke marker", () => {
    const parsed = parseSmokeResponse({
      status: 403,
      text: JSON.stringify({
        success: false,
        message: `Bearer ${JWT}`,
        code: "BRANDING_ENTITLEMENT_REQUIRED",
        requestId: `request-${SECRET_ENV_VALUE}`,
      }),
    });

    const marker = formatSmokeMarker(
      "tenant-without-entitlement",
      parsed,
      [SECRET_ENV_VALUE],
    );

    expect(marker).toBe(
      "[PASS] tenant-without-entitlement status=403 " +
        "code=BRANDING_ENTITLEMENT_REQUIRED request_id=request-[REDACTED]",
    );
    expect(marker).not.toContain(JWT);
    expect(marker).not.toContain(parsed.message ?? "");

    expect(
      formatSmokeMarker(
        "tenant-without-entitlement",
        parsed,
        [SECRET_ENV_VALUE],
        "FAIL",
      ),
    ).toBe(
      "[FAIL] tenant-without-entitlement status=403 " +
        "code=BRANDING_ENTITLEMENT_REQUIRED request_id=request-[REDACTED]",
    );
  });

  test("prevents control characters, ANSI, and oversized marker fields", () => {
    const marker = formatSmokeMarker(
      "label\r\nINJECTED\u001b[31m",
      {
        status: 500,
        code: `BAD\nCODE${"X".repeat(200)}`,
        requestId: "request\r\nforged",
        message: null,
        data: null,
        isSuccessEnvelope: false,
        isErrorEnvelope: true,
      },
      [],
      "FAIL",
    );

    expect(marker).toBe(
      "[FAIL] INVALID status=500 code=INVALID request_id=INVALID",
    );
    expect(marker).not.toMatch(/[\r\n\u001b]/);
  });

  test("allows remote HTTPS and loopback HTTP origins only", () => {
    expect(normalizeBrandingApiBaseUrl("https://api-dev.goodcms.cn"))
      .toBe("https://api-dev.goodcms.cn");
    expect(normalizeBrandingApiBaseUrl("http://127.0.0.1:3000"))
      .toBe("http://127.0.0.1:3000");
    expect(normalizeBrandingApiBaseUrl("http://localhost:3000"))
      .toBe("http://localhost:3000");
    expect(normalizeBrandingApiBaseUrl("http://[::1]:3000"))
      .toBe("http://[::1]:3000");

    for (const value of [
      "http://api-dev.goodcms.cn",
      "http://192.168.1.19:3000",
      "https://user:pass@api-dev.goodcms.cn",
      "https://api-dev.goodcms.cn/api",
      "https://api-dev.goodcms.cn?tenant_id=x",
    ]) {
      expect(() => normalizeBrandingApiBaseUrl(value)).toThrow();
    }
  });

  test("uses a fixed fifteen-second abort signal", () => {
    expect(BRANDING_SMOKE_TIMEOUT_MS).toBe(15_000);
    const signal = createBrandingSmokeAbortSignal();
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  test("rejects Content-Length above one MiB and cancels the body", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const response = new Response(body, {
      headers: {
        "content-length": String(BRANDING_SMOKE_RESPONSE_MAX_BYTES + 1),
      },
    });

    await expect(readBoundedResponseText(response)).rejects.toThrow(
      /too large/i,
    );
    expect(cancelled).toBe(true);
  });

  test("stream-limits response bodies even without Content-Length", async () => {
    let cancelled = false;
    const chunk = new Uint8Array(600 * 1024);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });

    await expect(
      readBoundedResponseText(new Response(body)),
    ).rejects.toThrow(/too large/i);
    expect(cancelled).toBe(true);
  });

  test("reads a bounded UTF-8 response body", async () => {
    const response = new Response('{"data":{},"message":"success"}', {
      headers: { "content-length": "31" },
    });

    expect(await readBoundedResponseText(response)).toBe(
      '{"data":{},"message":"success"}',
    );
  });
});
