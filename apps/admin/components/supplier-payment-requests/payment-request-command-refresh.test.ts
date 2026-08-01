import { describe, expect, test } from "bun:test";

import {
  paymentRequestRefreshOutcome,
  supplierPaymentCommandRefresh,
} from "./payment-request-command-refresh";

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

  test("刷新成功才释放命令尝试并关闭对话框", () => {
    expect(paymentRequestRefreshOutcome({ id: "request-1" })).toEqual({
      status: "refreshed",
      latest: { id: "request-1" },
      releaseAttempt: true,
      closeDialogs: true,
      notifyChanged: true,
      refreshRequired: false,
    });
  });

  test("刷新失败保持命令尝试冻结并要求手动重试", () => {
    expect(paymentRequestRefreshOutcome(null)).toEqual({
      status: "failed",
      latest: null,
      releaseAttempt: false,
      closeDialogs: false,
      notifyChanged: false,
      refreshRequired: true,
    });
  });
});
