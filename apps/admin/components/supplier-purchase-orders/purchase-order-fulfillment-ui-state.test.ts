import { describe, expect, test } from "bun:test";

import {
  beginFrozenCommand,
  canAbandonFrozenCommand,
  clearPersistedFrozenCommand,
  clearFrozenCommand,
  markFrozenCommandInFlight,
  markFrozenCommandUncertain,
  persistFrozenCommand,
  restoreFrozenCommand,
} from "./purchase-order-fulfillment-ui-state";

describe("采购履约冻结命令", () => {
  test("首次提交克隆并深冻结 payload 与 attempt", () => {
    const payload = {
      expected_fulfillment_version: 7,
      shipped_at: "2026-07-30T01:02:03.000Z",
      items: [{ purchase_order_item_id: "item-1", quantity: 2 }],
    };
    const attempt = {
      fingerprint: "shipment-fingerprint",
      idempotencyKey: "shipment-key",
      resourceId: "shipment-id",
    };

    const command = beginFrozenCommand(attempt, payload, "order-1");
    payload.expected_fulfillment_version = 8;
    payload.items[0]!.quantity = 9;
    attempt.idempotencyKey = "changed-key";

    expect(command.phase).toBe("in_flight");
    expect(command.payload).toEqual({
      expected_fulfillment_version: 7,
      shipped_at: "2026-07-30T01:02:03.000Z",
      items: [{ purchase_order_item_id: "item-1", quantity: 2 }],
    });
    expect(command.attempt.idempotencyKey).toBe("shipment-key");
    expect(Object.isFrozen(command)).toBe(true);
    expect(Object.isFrozen(command.payload)).toBe(true);
    expect(Object.isFrozen(command.payload.items)).toBe(true);
    expect(Object.isFrozen(command.payload.items[0])).toBe(true);
    expect(Object.isFrozen(command.attempt)).toBe(true);
  });

  test("只有 uncertain phase 可以放弃", () => {
    const command = beginFrozenCommand({
      fingerprint: "confirm-fingerprint",
      idempotencyKey: "confirm-key",
    }, {
      expected_version: 3,
      confirmed_at: "2026-07-30T02:03:04.000Z",
      remark: "原始备注",
    }, "order-1");

    expect(canAbandonFrozenCommand(command)).toBe(false);
    const uncertain = markFrozenCommandUncertain(command);
    expect(uncertain.phase).toBe("uncertain");
    expect(canAbandonFrozenCommand(uncertain)).toBe(true);
    expect(canAbandonFrozenCommand(clearFrozenCommand())).toBe(false);
  });

  test("不确定重试复用冻结的 payload、key、resource、时间和版本", () => {
    const draft = {
      expected_fulfillment_version: 11,
      received_at: "2026-07-30T03:04:05.000Z",
      items: [{ purchase_order_item_id: "item-1", accepted_quantity: 1 }],
    };
    let orderId = "order-1";
    const command = beginFrozenCommand({
      fingerprint: "receipt-fingerprint",
      idempotencyKey: "receipt-key",
      resourceId: "receipt-id",
    }, draft, orderId);
    const uncertain = markFrozenCommandUncertain(command);

    draft.expected_fulfillment_version = 12;
    draft.received_at = "2026-08-01T00:00:00.000Z";
    draft.items[0]!.accepted_quantity = 5;
    orderId = "order-2";
    const retry = markFrozenCommandInFlight(uncertain);

    expect(retry.payload).toBe(command.payload);
    expect(retry.attempt).toBe(command.attempt);
    expect(retry.attempt.idempotencyKey).toBe("receipt-key");
    expect(retry.attempt.resourceId).toBe("receipt-id");
    expect(retry.resourcePath).toBe("order-1");
    expect(retry.payload.expected_fulfillment_version).toBe(11);
    expect(retry.payload.received_at).toBe("2026-07-30T03:04:05.000Z");
    expect(retry.payload.items[0]!.accepted_quantity).toBe(1);
  });

  test("卸载后按订单与命令类型恢复，并把 in-flight 保守标为 uncertain", () => {
    const storage = new FakeStorage();
    const command = beginFrozenCommand({
      fingerprint: "shipment-fingerprint",
      idempotencyKey: "shipment-key",
      resourceId: "shipment-id",
    }, {
      id: "shipment-id",
      shipment_no: "SHIP-001",
      expected_fulfillment_version: 4,
      shipped_at: "2026-07-30T04:05:06.000Z",
      items: [{ purchase_order_item_id: "item-1", quantity: 1 }],
    }, "order-1");

    persistFrozenCommand(storage, "shipment", command);
    const restored = restoreFrozenCommand(
      storage,
      "order-1",
      "shipment",
    );

    expect(restored?.phase).toBe("uncertain");
    expect(restored?.payload).toEqual(command.payload);
    expect(restored?.attempt).toEqual(command.attempt);
    expect(restored?.resourcePath).toBe("order-1");
    expect(Object.isFrozen(restored?.payload)).toBe(true);
    expect(restoreFrozenCommand(storage, "order-2", "shipment")).toBeNull();
    expect(restoreFrozenCommand(storage, "order-1", "receipt")).toBeNull();
  });

  test("成功、确定失败或明确放弃后清理，损坏数据 fail-closed", () => {
    const storage = new FakeStorage();
    const command = beginFrozenCommand({
      fingerprint: "confirm-fingerprint",
      idempotencyKey: "confirm-key",
    }, {
      expected_version: 5,
      confirmed_at: "2026-07-30T05:06:07.000Z",
    }, "order-1");
    persistFrozenCommand(storage, "confirm", command);
    clearPersistedFrozenCommand(storage, "order-1", "confirm");
    expect(restoreFrozenCommand(storage, "order-1", "confirm")).toBeNull();

    storage.setItem(
      "purchase-order-fulfillment:confirm:order-1",
      "{broken-json",
    );
    expect(restoreFrozenCommand(storage, "order-1", "confirm")).toBeNull();
    expect(storage.length).toBe(0);

    storage.setItem(
      "purchase-order-fulfillment:shipment:order-1",
      JSON.stringify({
        schemaVersion: 1,
        kind: "shipment",
        phase: "uncertain",
        resourcePath: "order-1",
        attempt: {
          fingerprint: "bad",
          idempotencyKey: "bad",
          resourceId: "shipment-id",
        },
        payload: {},
      }),
    );
    expect(restoreFrozenCommand(storage, "order-1", "shipment")).toBeNull();
    expect(storage.length).toBe(0);
  });
});

class FakeStorage {
  private readonly records = new Map<string, string>();
  get length() {
    return this.records.size;
  }
  getItem(key: string) {
    return this.records.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.records.set(key, value);
  }
  removeItem(key: string) {
    this.records.delete(key);
  }
}
