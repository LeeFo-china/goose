import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Finance wechat pay orders page layout", () => {
  test("adds readonly orders page under wechat pay finance tab", () => {
    const pageSource = readSource(
      "../../app/(console)/finance/wechat-pay/orders/page.tsx",
    );

    expect(pageSource).toContain('activeTab="wechat-pay"');
    expect(pageSource).toContain("fetchWechatPayOrders");
    expect(pageSource).toContain("FinanceWechatPayOrdersTable");
    expect(pageSource).toContain("wechat-pay-orders-table-viewport");
  });

  test("orders page fetches paginated backend list with status filter", () => {
    const requestSource = readSource("./finance-wechat-pay-requests.ts");

    expect(requestSource).toContain("WechatPayOrderRecord");
    expect(requestSource).toContain("fetchWechatPayOrders");
    expect(requestSource).toContain("/finance/wechat-pay/orders?");
    expect(requestSource).toContain('appendOptionalParam(params, "status"');
  });

  test("orders table remains readonly and shows payment identifiers", () => {
    const tableSource = readSource("./finance-wechat-pay-orders-table.tsx");

    expect(tableSource).toContain("out_trade_no");
    expect(tableSource).toContain("transaction_id");
    expect(tableSource).toContain("receivable_plan");
    expect(tableSource).toContain("formatFinanceMoney");
    expect(tableSource).not.toContain("onClick");
    expect(tableSource).not.toContain("确认收款");
  });

  test("config page links to readonly order page", () => {
    const pageSource = readSource(
      "../../app/(console)/finance/wechat-pay/page.tsx",
    );

    expect(pageSource).toContain("/finance/wechat-pay/orders");
    expect(pageSource).toContain("支付订单");
  });
});
