import { describe, expect, test } from "bun:test";

import {
  fulfillmentActions,
  receiptRemaining,
  shipmentRemaining,
  toReceiptPayload,
  toShipmentPayload,
  validateReceiptLines,
  validateShipmentLines,
} from "./purchase-order-fulfillment-rules";

const ITEM_ID = "60000000-0000-4000-8000-000000000001";
const OTHER_ITEM_ID = "60000000-0000-4000-8000-000000000002";

const itemFulfillment = {
  tenant_id: "60000000-0000-4000-8000-000000000003",
  supplier_purchase_order_fulfillment_id:
    "60000000-0000-4000-8000-000000000004",
  supplier_purchase_order_item_id: ITEM_ID,
  ordered_quantity: "10.0001",
  shipped_quantity: "3.1001",
  received_quantity: "1.0001",
  accepted_quantity: "1.0001",
  rejected_quantity: "0",
  accepted_subtotal_amount: "10.00",
  accepted_tax_amount: "1.30",
  accepted_total_amount: "11.30",
  updated_at: "2026-07-30T04:00:00.000Z",
};

describe("采购履约动作", () => {
  test("未确认时提供确认动作，已确认但无累计行时保守禁用操作", () => {
    expect(fulfillmentActions({
      fulfillment: null,
      item_fulfillments: [],
    }, true, "submitted")).toEqual(["confirm"]);
    expect(fulfillmentActions(
      fulfillmentDetail("confirmed", []),
      true,
      "submitted",
    )).toEqual([]);
  });

  test("按同一累计行的真实剩余量提供发货或收货动作", () => {
    expect(fulfillmentActions(
      fulfillmentDetail("partially_received", [{
        ordered_quantity: "10",
        shipped_quantity: "10",
        received_quantity: "5",
      }]),
      true,
      "submitted",
    )).toEqual(["receive"]);
    expect(fulfillmentActions(
      fulfillmentDetail("partially_received", [{
        ordered_quantity: "10",
        shipped_quantity: "5",
        received_quantity: "5",
      }]),
      true,
      "submitted",
    )).toEqual(["ship"]);
  });

  test("不同累计行分别存在可发和可收数量时同时提供两个动作", () => {
    expect(fulfillmentActions(
      fulfillmentDetail("partially_received", [
        {
          ordered_quantity: "10",
          shipped_quantity: "5",
          received_quantity: "5",
        },
        {
          ordered_quantity: "10",
          shipped_quantity: "10",
          received_quantity: "5",
        },
      ]),
      true,
      "submitted",
    )).toEqual(["ship", "receive"]);
  });

  test.each([
    ["received", "10", "5", "5"],
    ["received_with_variance", "10", "5", "5"],
    ["cancelled", "10", "5", "5"],
  ] as const)("终态 %s 不再提供动作", (status, ordered, shipped, received) => {
    expect(fulfillmentActions(
      fulfillmentDetail(status, [{
        ordered_quantity: ordered,
        shipped_quantity: shipped,
        received_quantity: received,
      }]),
      true,
      "submitted",
    )).toEqual([]);
  });

  test("无管理权限或采购单不是已提交时不提供动作", () => {
    expect(
      fulfillmentActions(
        fulfillmentDetail("confirmed"),
        false,
        "submitted",
      ),
    ).toEqual([]);
    expect(
      fulfillmentActions(fulfillmentDetail("confirmed"), true, "draft"),
    ).toEqual([]);
    expect(
      fulfillmentActions(fulfillmentDetail("confirmed"), true, "cancelled"),
    ).toEqual([]);
  });
});

describe("采购履约剩余量", () => {
  test("使用四位定点小数计算发货和收货剩余量", () => {
    expect(shipmentRemaining(itemFulfillment)).toBe("6.9");
    expect(receiptRemaining(itemFulfillment)).toBe("2.1");
  });

  test("服务端累计量异常超过上限时把剩余量钳制为零", () => {
    expect(shipmentRemaining({
      ...itemFulfillment,
      ordered_quantity: "0.1",
      shipped_quantity: "0.1001",
    })).toBe("0");
    expect(receiptRemaining({
      ...itemFulfillment,
      shipped_quantity: "0.1",
      received_quantity: "0.1001",
    })).toBe("0");
  });
});

describe("发货 payload", () => {
  test("只发送采购行 ID 和数量，并规范化头字段", () => {
    const payload = toShipmentPayload({
      id: "60000000-0000-4000-8000-000000000005",
      expectedFulfillmentVersion: 2,
      shipmentNo: " SHIP-001 ",
      carrierName: " 顺丰 ",
      trackingNo: " ",
      shippedAt: "2026-07-30T05:00:00.000Z",
      remark: " 首批 ",
      lines: [{ purchaseOrderItemId: ITEM_ID, quantity: "2.1001" }],
    });

    expect(payload).toEqual({
      id: "60000000-0000-4000-8000-000000000005",
      expected_fulfillment_version: 2,
      shipment_no: "SHIP-001",
      carrier_name: "顺丰",
      tracking_no: null,
      shipped_at: "2026-07-30T05:00:00.000Z",
      remark: "首批",
      items: [{ purchase_order_item_id: ITEM_ID, quantity: 2.1001 }],
    });
    expect(payload.items[0]).toEqual({
      purchase_order_item_id: ITEM_ID,
      quantity: 2.1001,
    });
  });

  test("拒绝空行、重复行、非法精度、数据库越界和超剩余量", () => {
    expect(validateShipmentLines([], [itemFulfillment])).toEqual([
      { path: "items", message: "发货至少需要一个明细" },
    ]);
    expect(validateShipmentLines([
      { purchaseOrderItemId: ITEM_ID, quantity: "1" },
      { purchaseOrderItemId: ITEM_ID.toUpperCase(), quantity: "1" },
    ], [itemFulfillment])).toContainEqual({
      path: "items.1.purchase_order_item_id",
      message: "同一采购单明细不能重复添加",
    });
    expect(validateShipmentLines([
      { purchaseOrderItemId: ITEM_ID, quantity: "0" },
      { purchaseOrderItemId: OTHER_ITEM_ID, quantity: "1.00001" },
    ], [itemFulfillment])).toEqual(expect.arrayContaining([
      { path: "items.0.quantity", message: "履约数量必须大于 0" },
      {
        path: "items.1.quantity",
        message: "履约数量最多保留 4 位小数",
      },
    ]));
    expect(validateShipmentLines([
      {
        purchaseOrderItemId: ITEM_ID,
        quantity: "100000000000000",
      },
    ], [itemFulfillment])).toContainEqual({
      path: "items.0.quantity",
      message: "履约数量超过数据库上限",
    });
    expect(validateShipmentLines([
      {
        purchaseOrderItemId: ITEM_ID,
        quantity: "99999999999999.99",
      },
    ], [{
      ...itemFulfillment,
      ordered_quantity: "99999999999999.9999",
      shipped_quantity: "0",
    }])).toContainEqual({
      path: "items.0.quantity",
      message: "履约数量无法按 4 位小数安全提交",
    });
    expect(validateShipmentLines([
      { purchaseOrderItemId: ITEM_ID, quantity: "6.9001" },
    ], [itemFulfillment])).toContainEqual({
      path: "items.0.quantity",
      message: "发货数量不能超过剩余可发数量 6.9",
    });
  });

  test("限制单次发货为一至一百行", () => {
    const lines = Array.from({ length: 101 }, (_, index) => ({
      purchaseOrderItemId: `${index}`,
      quantity: "1",
    }));
    expect(validateShipmentLines(lines, [itemFulfillment])).toContainEqual({
      path: "items",
      message: "发货明细不能超过 100 行",
    });
  });
});

describe("收货 payload", () => {
  test("只发送采购行 ID、接受拒收数量和差异原因", () => {
    const payload = toReceiptPayload({
      id: "60000000-0000-4000-8000-000000000006",
      expectedFulfillmentVersion: 3,
      receiptNo: " RCV-001 ",
      receivedAt: "2026-07-30T06:00:00.000Z",
      remark: " 到货 ",
      lines: [{
        purchaseOrderItemId: ITEM_ID,
        acceptedQuantity: "1.5",
        rejectedQuantity: "0.5",
        varianceReason: " 外箱破损 ",
      }],
    });

    expect(payload).toEqual({
      id: "60000000-0000-4000-8000-000000000006",
      expected_fulfillment_version: 3,
      receipt_no: "RCV-001",
      received_at: "2026-07-30T06:00:00.000Z",
      remark: "到货",
      items: [{
        purchase_order_item_id: ITEM_ID,
        accepted_quantity: 1.5,
        rejected_quantity: 0.5,
        variance_reason: "外箱破损",
      }],
    });
  });

  test("校验收货数量、剩余量和差异原因", () => {
    expect(validateReceiptLines([
      {
        purchaseOrderItemId: ITEM_ID,
        acceptedQuantity: "0",
        rejectedQuantity: "0",
        varianceReason: null,
      },
      {
        purchaseOrderItemId: OTHER_ITEM_ID,
        acceptedQuantity: "1.00001",
        rejectedQuantity: "-1",
        varianceReason: null,
      },
    ], [itemFulfillment])).toEqual(expect.arrayContaining([
      { path: "items.0", message: "本次收货数量必须大于 0" },
      {
        path: "items.1.accepted_quantity",
        message: "履约数量最多保留 4 位小数",
      },
      {
        path: "items.1.rejected_quantity",
        message: "履约数量不能小于 0",
      },
    ]));
    expect(validateReceiptLines([{
      purchaseOrderItemId: ITEM_ID,
      acceptedQuantity: "2",
      rejectedQuantity: "0.1001",
      varianceReason: "破损",
    }], [itemFulfillment])).toContainEqual({
      path: "items.0",
      message: "收货数量不能超过剩余可收数量 2.1",
    });
    expect(validateReceiptLines([{
      purchaseOrderItemId: ITEM_ID,
      acceptedQuantity: "1",
      rejectedQuantity: "1",
      varianceReason: " ",
    }], [itemFulfillment])).toContainEqual({
      path: "items.0.variance_reason",
      message: "存在拒收数量时必须填写差异原因",
    });
    expect(validateReceiptLines([{
      purchaseOrderItemId: ITEM_ID,
      acceptedQuantity: "1",
      rejectedQuantity: "0",
      varianceReason: "不应提供",
    }], [itemFulfillment])).toContainEqual({
      path: "items.0.variance_reason",
      message: "无拒收数量时差异原因必须为空",
    });
    expect(validateReceiptLines([{
      purchaseOrderItemId: ITEM_ID,
      acceptedQuantity: "1",
      rejectedQuantity: "0",
      varianceReason: " ",
    }], [itemFulfillment])).toEqual([]);
  });

  test("收货行必须唯一且数量限制为一至一百行", () => {
    const duplicate = {
      purchaseOrderItemId: ITEM_ID,
      acceptedQuantity: "1",
      rejectedQuantity: "0",
      varianceReason: null,
    };
    expect(validateReceiptLines(
      [duplicate, { ...duplicate, purchaseOrderItemId: ITEM_ID.toUpperCase() }],
      [itemFulfillment],
    )).toContainEqual({
      path: "items.1.purchase_order_item_id",
      message: "同一采购单明细不能重复添加",
    });
    expect(validateReceiptLines(
      Array.from({ length: 101 }, (_, index) => ({
        ...duplicate,
        purchaseOrderItemId: `${index}`,
      })),
      [itemFulfillment],
    )).toContainEqual({
      path: "items",
      message: "收货明细不能超过 100 行",
    });
  });
});

function fulfillmentDetail(
  status:
    | "confirmed"
    | "partially_shipped"
    | "shipped"
    | "partially_received"
    | "received"
    | "received_with_variance"
    | "cancelled",
  quantities: {
    ordered_quantity: string;
    shipped_quantity: string;
    received_quantity: string;
  }[] = [{
    ordered_quantity: "10",
    shipped_quantity: "0",
    received_quantity: "0",
  }],
) {
  return {
    fulfillment: {
      id: "60000000-0000-4000-8000-000000000004",
      tenant_id: itemFulfillment.tenant_id,
      supplier_purchase_order_id:
        "60000000-0000-4000-8000-000000000005",
      status,
      confirmed_at: "2026-07-30T03:00:00.000Z",
      confirmed_by_employee_id:
        "60000000-0000-4000-8000-000000000006",
      confirmation_remark: null,
      version: 1,
      created_at: "2026-07-30T03:00:00.000Z",
      updated_at: "2026-07-30T03:00:00.000Z",
    },
    item_fulfillments: quantities.map((quantity, index) => ({
      ...itemFulfillment,
      ...quantity,
      supplier_purchase_order_item_id: index === 0
        ? ITEM_ID
        : OTHER_ITEM_ID,
    })),
  };
}
