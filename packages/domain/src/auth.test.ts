import { describe, expect, test } from "bun:test";

import { SMS_SCENE_VALUES, type SmsScene } from "./auth";

describe("tenant onboarding SMS scene", () => {
  test("exports the applicant-only scene without removing legacy scenes", () => {
    const scene: SmsScene = "tenant_onboarding_application";

    expect(SMS_SCENE_VALUES).toContain(scene);
    expect(SMS_SCENE_VALUES).toContain("partner_tenant_onboarding");
    expect(new Set(SMS_SCENE_VALUES).size).toBe(SMS_SCENE_VALUES.length);
  });
});
