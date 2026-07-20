import { describe, expect, test } from "bun:test";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import {
  requireActiveRechargePaymentConfig,
  requirePostInsertRechargePaymentConfig,
} from "./billing-recharge-payment-config";

const config = {
  id: "platform-config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-platform-app",
  sub_app_id: null,
  encrypted_config_ref: "secret://platform/wechat-pay",
  secret_bundle_revision: null,
  serial_no: "SERIALNO",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  recharge_guard_version: 1,
  last_validated_at: "2026-07-20T12:00:00.000Z",
  risk_switches: {},
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-20T11:00:00.000Z",
  updated_at: "2026-07-20T12:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

describe("billing recharge secret bundle revision gate", () => {
  test("rejects a valid legacy profile before inserting an order", () => {
    expect(() => requireActiveRechargePaymentConfig(config)).toThrow(
      expect.objectContaining({
        statusCode: 409,
        code: "BILLING_RECHARGE_PAYMENT_CONFIG_MISSING",
      }),
    );
  });

  test("rechecks the revision before upstream prepay", () => {
    expect(() => requirePostInsertRechargePaymentConfig({
      config,
      expectedConfigId: config.id,
      expectedGuardVersion: config.recharge_guard_version,
    })).toThrow(expect.objectContaining({
      statusCode: 409,
      code: "BILLING_RECHARGE_PAYMENT_CONFIG_MISSING",
    }));
  });
});
