import { describe, expect, test } from "bun:test";

import {
  assertExpectedSmokeResponse,
  formatSmokeMarker,
  parseSmokeResponse,
  readPlatformListTargetTenantId,
  redactSensitiveText,
} from "./verify-branding-tenant-isolation";

const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.signature-value";
const SECRET_ENV_VALUE = "fixture-secret-value";
const FOREIGN_TENANT_ID = "00000000-0000-4000-8000-000000000002";
const FOREIGN_FILE_ID = "00000000-0000-4000-8000-000000000099";

function jwtWithTenantId(tenantId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" }))
    .toString("base64url");
  const payload = Buffer.from(JSON.stringify({ tenant_id: tenantId }))
    .toString("base64url");
  return `${header}.${payload}.fixture-signature`;
}

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
          support_text: "字节跳动提供技术支持",
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
      support_text: "字节跳动提供技术支持",
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

  test("accepts only a canonical lowercase tenant UUID as platform list target", () => {
    expect(
      readPlatformListTargetTenantId(
        jwtWithTenantId("00000000-0000-4000-8000-000000000001"),
      ),
    ).toBe("00000000-0000-4000-8000-000000000001");
    expect(() =>
      readPlatformListTargetTenantId(
        jwtWithTenantId("00000000-0000-4000-8000-00000000000A"),
      )
    ).toThrow(/tenant_id UUID claim/i);
    expect(() =>
      readPlatformListTargetTenantId(
        jwtWithTenantId("00000000-0000-0000-0000-000000000001"),
      )
    ).toThrow(/tenant_id UUID claim/i);
  });
});
