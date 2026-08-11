import { describe, expect, test } from "bun:test";

import {
  PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES,
  PLATFORM_SERVICE_TRIAL_SOURCE_VALUES,
  PLATFORM_SERVICE_TRIAL_STATUS_VALUES,
  PLATFORM_SERVICE_TRIAL_TYPE_VALUES,
  PlatformServiceTrialScopeSchema,
} from "./platform-service-trial";

describe("platform service trial domain contract", () => {
  test("keeps trial lifecycle values stable", () => {
    expect(PLATFORM_SERVICE_TRIAL_STATUS_VALUES).toEqual([
      "pending_review",
      "scheduled",
      "active",
      "grace_period",
      "expired",
      "rejected",
      "withdrawn",
      "revoked",
      "converted",
    ]);
    expect(PLATFORM_SERVICE_TRIAL_SOURCE_VALUES).toEqual([
      "tenant_application",
      "platform_grant",
    ]);
    expect(PLATFORM_SERVICE_TRIAL_TYPE_VALUES).toEqual([
      "standard",
      "guided",
    ]);
  });

  test("keeps the v1 capability allow-list stable", () => {
    expect(PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES).toEqual([
      "core.projects",
      "core.customers",
      "core.employees",
      "core.workflows",
      "core.files",
      "core.notifications",
    ]);
  });

  test("accepts only a strict non-empty scope without duplicates", () => {
    expect(PlatformServiceTrialScopeSchema.parse({
      version: 1,
      capabilities: ["core.projects", "core.customers"],
    })).toEqual({
      version: 1,
      capabilities: ["core.projects", "core.customers"],
    });

    const invalidScopes = [
      { version: 1, capabilities: [] },
      { version: 1, capabilities: ["core.projects", "core.projects"] },
      { version: 1, capabilities: ["core.unknown"] },
      { version: 2, capabilities: ["core.projects"] },
      { version: 1, capabilities: ["core.projects"], unrestricted: true },
    ];

    for (const scope of invalidScopes) {
      expect(PlatformServiceTrialScopeSchema.safeParse(scope).success).toBe(false);
    }
  });
});
