import { describe, expect, test } from "bun:test";

import type { Inserts, Tables, Updates } from "./db";

describe("wechat pay database types", () => {
  test("exposes config, order, and notification fields", () => {
    const config = {} as Tables<"tenant_payment_configs">;
    const orderRow = {} as Tables<"wechat_payment_orders">;
    const notificationRow = {} as Tables<"wechat_payment_notifications">;
    const orderInsert: Inserts<"wechat_payment_orders"> = {
      amount: 100,
      out_trade_no: "WX202607010001",
      project_id: "00000000-0000-4000-8000-000000000001",
      tenant_id: "00000000-0000-4000-8000-000000000002",
    };
    const notificationUpdate: Updates<"wechat_payment_notifications"> = {
      error_message: null,
      processed: true,
    };

    const fields = [
      config.principal_type,
      config.merchant_name,
      config.applyment_state,
      config.appid_binding_state,
      config.validation_status,
      orderRow.metadata,
      orderInsert.amount,
      notificationRow.raw_payload,
      notificationUpdate.processed,
    ];

    expect(fields).toHaveLength(9);
  });
});
