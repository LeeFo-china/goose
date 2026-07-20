import { describe, expect, test } from "bun:test";
import {
  activeConfig,
  pendingOrder,
  projectId,
  receivablePlanId,
  workflowTaskId,
} from "./wechat-pay-orders.test-helpers";
import {
  assertWechatPayConfigReadyForOrder,
  assertWechatPayPendingOrderRetryMatches,
  requireWechatPayPayerOpenid,
} from "./wechat-pay-order-retry";

const request = {
  project_id: projectId,
  receivable_plan_id: receivablePlanId,
  workflow_task_id: workflowTaskId,
  amount: 8000,
  payer_openid: "o-test-openid",
};
const order = { ...pendingOrder, payer_openid: request.payer_openid };
const readyConfig = {
  ...activeConfig,
  encrypted_config_ref: "env://WECHAT_PAY_TEST",
  serial_no: "TEST-SERIAL",
  notify_url: "https://api.example.com/pay/wechat/callback",
};

describe("wechat pay pending order retry", () => {
  test("normalizes payer openid and rejects blank values", () => {
    expect(requireWechatPayPayerOpenid("  o-test-openid  ")).toBe(
      "o-test-openid",
    );
    expect(() => requireWechatPayPayerOpenid("   ")).toThrow();
  });

  test("accepts an exact retry of the existing pending order", () => {
    expect(() => assertWechatPayPendingOrderRetryMatches({
      config: activeConfig,
      order,
      request,
    })).not.toThrow();
  });

  test("rejects retry parameters that would change the payment", () => {
    expect(() => assertWechatPayPendingOrderRetryMatches({
      config: activeConfig,
      order,
      request: { ...request, amount: 7999, payer_openid: "o-other" },
    })).toThrow(expect.objectContaining({
      code: "WECHAT_PAY_ORDER_IDEMPOTENCY_CONFLICT",
      details: expect.objectContaining({
        conflicts: ["amount", "payer_openid"],
      }),
    }));
  });

  test("rejects retry through a different payment config", () => {
    expect(() => assertWechatPayPendingOrderRetryMatches({
      config: { ...activeConfig, id: "77777777-7777-4777-8777-777777777777" },
      order,
      request,
    })).toThrow(expect.objectContaining({
      code: "WECHAT_PAY_ORDER_CONFIG_MISMATCH",
    }));
  });

  test("requires signing callback and project payment channel before insert", () => {
    const incompleteConfig = {
      ...readyConfig,
      encrypted_config_ref: null,
      serial_no: null,
      notify_url: null,
    };
    expect(() => assertWechatPayConfigReadyForOrder(incompleteConfig)).toThrow(
      expect.objectContaining({
        code: "WECHAT_PAY_CONFIG_INCOMPLETE",
        details: expect.objectContaining({
          missing_fields: ["encrypted_config_ref", "serial_no", "notify_url"],
        }),
      }),
    );
    expect(() => assertWechatPayConfigReadyForOrder({
      ...readyConfig,
      enabled_channels: [],
    })).toThrow(expect.objectContaining({
      code: "WECHAT_PAY_CHANNEL_NOT_ENABLED",
    }));
  });

  test("accepts a ready service provider app config without sub app id", () => {
    expect(() => assertWechatPayConfigReadyForOrder({
      ...readyConfig,
      merchant_mode: "service_provider_sub_merchant",
      sub_merchant_id: "sub-merchant-mchid",
      sub_app_id: null,
      applyment_state: "opened",
      appid_binding_state: "bound",
    })).not.toThrow();
  });

  test.each(["unchecked", "invalid"] as const)(
    "rejects a tenant payment config with %s validation before prepay",
    (validationStatus) => {
      expect(() => assertWechatPayConfigReadyForOrder({
        ...readyConfig,
        validation_status: validationStatus,
      })).toThrow(expect.objectContaining({
        statusCode: 409,
        code: "WECHAT_PAY_CONFIG_NOT_VALIDATED",
      }));
    },
  );
});
