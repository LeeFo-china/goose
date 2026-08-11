import { describe, expect, test } from "bun:test";

import {
  parsePendingOrderTrialAttribution,
  throwPendingOrderCreationError,
} from "./platform-service-order-trial-attribution";
import {
  RPC_IDS,
  rpcOrder,
} from "./platform-service-rpc-result-fixtures.test-helpers";

const sourceTrialId = "00000000-0000-4000-8000-000000000501";

describe("pending platform service order trial attribution boundary", () => {
  test("accepts only the tenant and trial source returned by the atomic RPC", () => {
    expect(parsePendingOrderTrialAttribution(
      rpcOrder({ source_trial_id: sourceTrialId }),
      { tenantId: RPC_IDS.tenant, sourceTrialId },
    )).toMatchObject({
      tenant_id: RPC_IDS.tenant,
      source_trial_id: sourceTrialId,
    });

    expect(() => parsePendingOrderTrialAttribution(
      rpcOrder({ tenant_id: RPC_IDS.product, source_trial_id: sourceTrialId }),
      { tenantId: RPC_IDS.tenant, sourceTrialId },
    )).toThrow(expect.objectContaining({ code: "DB_ERROR" }));
    expect(() => parsePendingOrderTrialAttribution(
      rpcOrder({ source_trial_id: null }),
      { tenantId: RPC_IDS.tenant, sourceTrialId },
    )).toThrow(expect.objectContaining({ code: "DB_ERROR" }));
  });

  test("requires an omitted trial source to remain null in the RPC result", () => {
    expect(parsePendingOrderTrialAttribution(rpcOrder(), {
      tenantId: RPC_IDS.tenant,
    })).toMatchObject({ source_trial_id: null });
  });

  test("maps the atomic same-tenant and open-order guard to a stable conflict", () => {
    expect(() => throwPendingOrderCreationError({
      code: "P0001",
      message: "SERVICE_TRIAL_ORDER_SOURCE_INVALID",
    })).toThrow(expect.objectContaining({
      statusCode: 409,
      code: "SERVICE_TRIAL_ORDER_SOURCE_INVALID",
    }));
  });

  test("keeps unrelated RPC failures as database errors", () => {
    expect(() => throwPendingOrderCreationError({
      code: "P0001",
      message: "SERVICE_PAYMENT_CONFIG_INVALID",
    })).toThrow(expect.objectContaining({ code: "DB_ERROR" }));
  });
});
