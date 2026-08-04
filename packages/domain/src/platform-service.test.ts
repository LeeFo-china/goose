import { describe, expect, test } from "bun:test";
import {
  PLATFORM_SERVICE_PAYMENT_STATUS_VALUES,
  PLATFORM_SERVICE_STATUS_VALUES,
} from "./platform-service";

describe("platform service contract", () => {
  test("keeps payment and service states separate", () => {
    expect(PLATFORM_SERVICE_PAYMENT_STATUS_VALUES).toContain("paid");
    expect(PLATFORM_SERVICE_STATUS_VALUES).toContain("waiting_assignment");
    expect(PLATFORM_SERVICE_STATUS_VALUES).not.toContain("paid");
  });

  test("does not export hard-coded product prices", async () => {
    const contract = await import("./platform-service");
    expect("PLATFORM_SERVICE_PRODUCT_PRESETS" in contract).toBe(false);
  });
});
