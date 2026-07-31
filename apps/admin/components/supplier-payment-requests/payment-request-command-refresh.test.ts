import { describe, expect, test } from "bun:test";

import { supplierPaymentCommandRefresh } from "./payment-request-command-refresh";

describe("付款命令刷新范围", () => {
  test("成功命令使全部相关读模型失效", () => {
    expect(supplierPaymentCommandRefresh()).toEqual({
      refreshPayables: true,
      refreshRequests: true,
      refreshRequestDetail: true,
      refreshPurchaseOrderSummary: true,
      refreshProjectFinance: true,
    });
  });
});
