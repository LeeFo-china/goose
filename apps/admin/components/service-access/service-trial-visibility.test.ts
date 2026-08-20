import { describe, expect, test } from "bun:test";

import { shouldRenderServiceTrialSection } from "./service-trial-api";

describe("shouldRenderServiceTrialSection", () => {
  test("never renders tenant trial fallback for a hard-blocked account", () => {
    expect(shouldRenderServiceTrialSection({
      accessStatus: "hard_blocked",
      hasEnteredRecovery: true,
      unavailable: false,
    })).toBe(false);
  });

  test("keeps trial recovery visible for recoverable blocked accounts", () => {
    expect(shouldRenderServiceTrialSection({
      accessStatus: "service_blocked",
      hasEnteredRecovery: false,
      unavailable: false,
    })).toBe(true);
  });
});
