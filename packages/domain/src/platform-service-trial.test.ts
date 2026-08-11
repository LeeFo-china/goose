import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import {
  PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES,
  PLATFORM_SERVICE_TRIAL_SOURCE_VALUES,
  PLATFORM_SERVICE_TRIAL_STATUS_VALUES,
  PLATFORM_SERVICE_TRIAL_TYPE_VALUES,
  PlatformServiceTrialScopeSchema,
} from "./platform-service-trial";

describe("platform service trial domain contract", () => {
  test("ships trial exports under an immutable post-1.14 package version", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version?: unknown };
    const versionParts = typeof packageJson.version === "string"
      ? packageJson.version.split(".").map(Number)
      : [];

    expect(versionParts).toHaveLength(3);
    expect(versionParts.every(Number.isSafeInteger)).toBe(true);
    expect(
      versionParts[0] > 1 ||
        (versionParts[0] === 1 && versionParts[1] >= 15),
    ).toBe(true);
  });

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
