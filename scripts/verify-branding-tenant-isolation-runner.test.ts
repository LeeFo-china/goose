import { describe, expect, test } from "bun:test";

import {
  BRANDING_MUTATION_SENTINEL_VERSION,
  runBrandingTenantIsolationSmoke,
} from "./verify-branding-tenant-isolation";
import {
  BRANDING_ENTITLED_TENANT_FIXTURE_DISPLAY_NAME,
  BRANDING_PLATFORM_FIXTURE_DISPLAY_NAME,
} from "./verify-branding-tenant-isolation-contracts";

const WITH_TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WITHOUT_TENANT_ID = "10000000-0000-4000-8000-000000000002";
const FOREIGN_FILE_ID = "20000000-0000-4000-8000-000000000002";
const LOGO_FILE_ID = "20000000-0000-4000-8000-000000000001";
const TIMESTAMP = "2026-07-27T10:00:00.000Z";

function jwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" }))
    .toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload))
    .toString("base64url");
  return `${header}.${encodedPayload}.fixture-signature`;
}

const platformToken = jwt({ sub: "platform-user" });
const withToken = jwt({ sub: "with-user", tenant_id: WITH_TENANT_ID });
const withoutToken = jwt({
  sub: "without-user",
  tenant_id: WITHOUT_TENANT_ID,
});

const tenantProfile = {
  display_name: BRANDING_ENTITLED_TENANT_FIXTURE_DISPLAY_NAME,
  logo_file_id: LOGO_FILE_ID,
  logo_url: "https://cdn.example.com/logo.png",
  status: "published",
  version: 7,
  published_version: 7,
  has_unpublished_changes: false,
  published_at: TIMESTAMP,
  updated_at: TIMESTAMP,
};
const platformEffective = {
  source: "platform",
  tenant_id: null,
  display_name: BRANDING_PLATFORM_FIXTURE_DISPLAY_NAME,
  logo_url: "https://cdn.example.com/platform.png",
  support_text: `${BRANDING_PLATFORM_FIXTURE_DISPLAY_NAME}提供技术支持`,
  version: 3,
  updated_at: TIMESTAMP,
};
const platformProfile = {
  ...tenantProfile,
  display_name: BRANDING_PLATFORM_FIXTURE_DISPLAY_NAME,
  logo_url: "https://cdn.example.com/platform.png",
  version: 3,
  published_version: 3,
};
const tenantEffective = {
  ...platformEffective,
  source: "tenant",
  tenant_id: WITH_TENANT_ID,
  display_name: BRANDING_ENTITLED_TENANT_FIXTURE_DISPLAY_NAME,
  logo_url: "https://cdn.example.com/logo.png",
  support_text:
    `${BRANDING_ENTITLED_TENANT_FIXTURE_DISPLAY_NAME}提供技术支持`,
  version: 7,
};
const entitlementSummary = {
  code: "custom_support_branding",
  status: "active",
  expires_at: "2027-07-27T10:00:00.000Z",
  version: 1,
};
const fullEntitlement = {
  id: "30000000-0000-4000-8000-000000000001",
  tenant_id: WITH_TENANT_ID,
  code: "custom_support_branding",
  status: "active",
  starts_at: TIMESTAMP,
  expires_at: "2027-07-27T10:00:00.000Z",
  source_type: "manual_grant",
  source_id: null,
  suspended_at: null,
  suspend_reason: null,
  version: 1,
  updated_at: TIMESTAMP,
};

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function success(data: unknown): Response {
  return jsonResponse(200, { data, message: "success" });
}

function failure(status: number, code: string, requestId: string): Response {
  return jsonResponse(status, {
    success: false,
    message: "expected smoke rejection",
    code,
    requestId,
  });
}

describe("branding tenant isolation smoke runner", () => {
  test("uses non-persisting sentinel writes, timeout signals, and returns counts", async () => {
    const signals: AbortSignal[] = [];
    const patchBodies: Array<Record<string, unknown>> = [];
    const signal = new AbortController().signal;
    const fetchImpl = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      if (init?.signal instanceof AbortSignal) signals.push(init.signal);
      const url = new URL(String(input));
      const authorization = new Headers(init?.headers).get("authorization");
      const method = init?.method ?? "GET";

      if (method === "PATCH") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        patchBodies.push(body);
        return authorization === `Bearer ${withoutToken}`
          ? failure(403, "BRANDING_ENTITLEMENT_REQUIRED", "request-no-ent")
          : failure(404, "BRANDING_LOGO_FILE_NOT_FOUND", "request-foreign");
      }
      if (url.pathname === "/branding/effective") {
        return success(authorization === `Bearer ${withToken}`
          ? tenantEffective
          : platformEffective);
      }
      if (url.pathname === "/tenant/branding") {
        return success(authorization === `Bearer ${withToken}`
          ? {
            profile: tenantProfile,
            entitlement: entitlementSummary,
            can_customize: true,
            effective: tenantEffective,
          }
          : {
            profile: null,
            entitlement: null,
            can_customize: false,
            effective: platformEffective,
          });
      }
      if (url.pathname === "/platform/branding") {
        return authorization === `Bearer ${platformToken}`
          ? success({ profile: platformProfile, effective: platformEffective })
          : failure(403, "FORBIDDEN", "request-forbidden");
      }
      return success({
        list: [fullEntitlement],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });
    };
    const environment = {
      BRANDING_API_BASE_URL: "http://127.0.0.1:3000",
      BRANDING_PLATFORM_TOKEN: platformToken,
      BRANDING_TENANT_WITH_ENTITLEMENT_TOKEN: withToken,
      BRANDING_TENANT_WITHOUT_ENTITLEMENT_TOKEN: withoutToken,
      BRANDING_FOREIGN_FILE_ID: FOREIGN_FILE_ID,
    };
    const output: string[] = [];
    const previousExitCode = process.exitCode;
    process.exitCode = 73;

    try {
      const result = await runBrandingTenantIsolationSmoke(
        environment,
        (line) => output.push(line),
        {
          fetch: fetchImpl,
          createAbortSignal: () => signal,
        },
      );

      expect(result).toEqual({ passed: 11, failed: 0 });
      expect(process.exitCode).toBe(73);
      expect(signals).toHaveLength(11);
      expect(signals.every((value) => value === signal)).toBe(true);
      expect(patchBodies).toHaveLength(2);
      expect(patchBodies.every((body) =>
        body.version === BRANDING_MUTATION_SENTINEL_VERSION
      )).toBe(true);
      expect(patchBodies.every((body) =>
        body.logo_file_id === FOREIGN_FILE_ID
      )).toBe(true);
      expect(output.every((line) => !line.includes(withToken))).toBe(true);
    } finally {
      process.exitCode = previousExitCode ?? 0;
    }
  });
});
