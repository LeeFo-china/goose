import { describe, expect, test } from "bun:test";

import {
  TENANT_SERVICE_ACCESS_MODE_VALUES,
  TENANT_SERVICE_ROUTE_ACCESS_VALUES,
} from "./platform-service-access";

describe("platform service access domain contract", () => {
  test("keeps service modes and route access values stable", () => {
    expect(TENANT_SERVICE_ACCESS_MODE_VALUES).toEqual([
      "paid",
      "paid_onboarding",
      "trial",
      "grace",
      "legacy",
      "service_blocked",
      "hard_blocked",
    ]);
    expect(TENANT_SERVICE_ROUTE_ACCESS_VALUES).toEqual([
      "session",
      "recovery",
      "read",
      "write",
      "public_or_callback",
    ]);
  });
});
