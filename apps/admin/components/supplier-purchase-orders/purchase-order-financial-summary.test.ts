import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, test } from "bun:test";

import {
  failedFinancialSummaryState,
} from "./purchase-order-financial-summary-state";
import { createLatestRequestGuard } from "./purchase-order-fulfillment-ui-state";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("采购单财务摘要", () => {
  test("通过真实 backend client 加载编码后的采购单摘要", async () => {
    const api = await import("./purchase-order-api");
    const loadSummary = Reflect.get(
      api,
      "loadPurchaseOrderFinancialSummary",
    );
    const calls: string[] = [];
    globalThis.fetch = (async (input) => {
      calls.push(String(input));
      return jsonResponse({
        success: true,
        data: {
          purchase_order_id: "order/id ?",
          accepted_amount: "90.00",
          payable_amount: "90.00",
          reserved_request_amount: "40.00",
          paid_amount: "20.00",
          open_amount: "70.00",
          available_to_request_amount: "30.00",
        },
      });
    }) as typeof fetch;

    expect(typeof loadSummary).toBe("function");
    const result = await loadSummary("order/id ?");

    expect(calls).toEqual([
      "/api/backend/supplier-purchase-orders/order%2Fid%20%3F/financial-summary",
    ]);
    expect(result).toMatchObject({
      accepted_amount: "90.00",
      payable_amount: "90.00",
      reserved_request_amount: "40.00",
      paid_amount: "20.00",
      open_amount: "70.00",
    });
  });

  test("摘要组件展示五项闭环金额并覆盖加载和错误状态", () => {
    const source = readSource("./purchase-order-financial-summary.tsx");

    for (const label of [
      "合格收货",
      "已形成应付",
      "已申请未付",
      "已付",
      "未付应付",
    ]) {
      expect(source).toContain(label);
    }
    expect(source).toContain("PurchaseOrderFinancialSummaryProps");
    expect(source).toContain("<Skeleton");
    expect(source).toContain("<StatusAlert");
    expect(source).toContain("formatPurchaseMoney");
  });

  test("详情独立加载财务摘要并以权限和 latest guard 隔离", () => {
    const detail = readSource("./purchase-order-detail.tsx");
    const workspace = readSource("./purchase-order-workspace.tsx");

    expect(detail).toContain("canViewPurchaseOrders");
    expect(detail).toContain("loadPurchaseOrderFinancialSummary");
    expect(detail).toContain("financialSummaryRequestGuard");
    expect(detail).toContain(
      "setFinancialSummaryState(unloadedFinancialSummaryState)",
    );
    expect(detail).toContain("<PurchaseOrderFinancialSummary");
    expect(detail).toMatch(
      /canViewPurchaseOrders\s*\?\s*\(\s*<PurchaseOrderFinancialSummary/,
    );
    expect(workspace).toContain(
      "canViewPurchaseOrders={canViewPurchaseOrders}",
    );
  });

  test("旧采购单摘要请求不能覆盖最新采购单", () => {
    const guard = createLatestRequestGuard();
    const isFirstLatest = guard.start();
    const isSecondLatest = guard.start();
    let visibleOrderId: string | null = null;

    if (isFirstLatest()) visibleOrderId = "order-a";
    if (isSecondLatest()) visibleOrderId = "order-b";

    expect(visibleOrderId).toBe("order-b");
  });

  test("财务摘要失败状态不携带或覆盖基础详情错误", () => {
    const baseDetailState = {
      orderId: "order-a",
      error: null,
    };

    const financialState = failedFinancialSummaryState("摘要加载失败");

    expect(financialState).toEqual({
      summary: null,
      isLoading: false,
      error: "摘要加载失败",
    });
    expect(baseDetailState).toEqual({
      orderId: "order-a",
      error: null,
    });
    expect(financialState).not.toHaveProperty("orderId");
  });
});
