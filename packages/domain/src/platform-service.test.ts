import { describe, expect, test } from "bun:test";
import {
  PLATFORM_SERVICE_ACCEPTANCE_PREPARATION_STATUS_VALUES,
  PLATFORM_SERVICE_FULFILLMENT_RECORD_TYPE_VALUES,
  PLATFORM_SERVICE_PAYMENT_STATUS_VALUES,
  PLATFORM_SERVICE_STATUS_VALUES,
  PLATFORM_SERVICE_WORK_ORDER_ALLOWED_TRANSITIONS,
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

  test("defines fulfillment evidence record types", () => {
    expect(PLATFORM_SERVICE_FULFILLMENT_RECORD_TYPE_VALUES).toEqual([
      "environment_setup",
      "server_configuration",
      "onsite_training",
      "remote_training",
      "annual_operation",
      "acceptance_preparation",
      "rectification",
    ]);
  });

  test("defines acceptance preparation states for future customer confirmation", () => {
    expect(PLATFORM_SERVICE_ACCEPTANCE_PREPARATION_STATUS_VALUES).toEqual([
      "draft",
      "submitted",
      "accepted",
      "rejected",
      "cancelled",
    ]);
  });

  test("documents allowed work-order transitions", () => {
    expect(PLATFORM_SERVICE_WORK_ORDER_ALLOWED_TRANSITIONS).toContainEqual({
      from: "waiting_assignment",
      to: "configuring",
    });
    expect(PLATFORM_SERVICE_WORK_ORDER_ALLOWED_TRANSITIONS).toContainEqual({
      from: "awaiting_acceptance",
      to: "rectifying",
    });
    expect(PLATFORM_SERVICE_WORK_ORDER_ALLOWED_TRANSITIONS).not.toContainEqual({
      from: "active",
      to: "configuring",
    });
  });
});
