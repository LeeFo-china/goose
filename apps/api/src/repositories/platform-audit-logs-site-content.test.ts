import { beforeAll, describe, expect, test } from "bun:test";

import { PlatformAuditLogListQuerySchema } from "@/schema/platform-audit-logs";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let applyPlatformAuditLogFilters: typeof import("./platform-audit-logs").applyPlatformAuditLogFilters;

beforeAll(async () => {
  ({ applyPlatformAuditLogFilters } = await import("./platform-audit-logs"));
});

describe("platform audit site content lookup", () => {
  test("validates an exact resource UUID filter", () => {
    expect(PlatformAuditLogListQuerySchema.safeParse({
      resource_id: "11111111-1111-4111-8111-111111111111",
    }).success).toBe(true);
    expect(PlatformAuditLogListQuerySchema.safeParse({ resource_id: "not-a-uuid" }).success).toBe(false);
  });

  test("applies an exact resource_id database predicate", () => {
    const calls: unknown[][] = [];
    const request = {
      eq(column: string, value: unknown) {
        calls.push([column, value]);
        return this;
      },
      or() { return this; },
    };

    applyPlatformAuditLogFilters(request, {
      page: 1,
      pageSize: 20,
      resource_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(calls).toContainEqual(["resource_id", "11111111-1111-4111-8111-111111111111"]);
  });
});
