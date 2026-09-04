import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, test } from "bun:test";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("采购单列表履约状态", () => {
  test("一级列表用后端履约状态筛选和主状态展示", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({ success: true, data: emptyPurchaseOrderPage() });
    }) as typeof fetch;
    const { loadPurchaseOrders } = await import("./purchase-order-api");

    await loadPurchaseOrders(3, {
      keyword: "PO-20260904-00000075",
      fulfillmentStatus: "awaiting_receipt",
    });

    expect(String(calls[0]?.input)).toBe(
      "/api/backend/supplier-purchase-orders?page=3&pageSize=20&keyword=PO-20260904-00000075&fulfillmentStatus=awaiting_receipt",
    );

    const workspace = readSource("./purchase-order-workspace.tsx");
    const list = readSource("./purchase-order-list.tsx");
    const rules = readSource("./purchase-order-rules.ts");

    expect(workspace).toContain("fulfillmentStatusOptions");
    expect(workspace).toContain("setFulfillmentStatus");
    expect(workspace).toContain("fulfillmentStatus");
    expect(list).toContain("purchaseOrderPrimaryStatusMeta");
    expect(rules).toContain("purchaseOrderSecondaryStatusText");
    expect(rules).toContain("采购单");
    expect(rules).toContain("received_with_variance");
    expect(rules).toContain("待供应商确认");
    expect(rules).toContain("收货异常");
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function emptyPurchaseOrderPage() {
  return {
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  };
}
