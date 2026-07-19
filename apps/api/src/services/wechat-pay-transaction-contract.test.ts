import { describe, expect, test } from "bun:test";

import {
  buildWechatPayTransactionExpectedBinding,
  convertWechatPayTransactionCallbackResource,
  convertWechatPayTransactionQueryPayload,
  parseAndAssertWechatPayTransactionCallback,
  parseAndAssertWechatPayTransactionQuery,
  type WechatPayTransactionExpectedBinding,
} from "@/services/wechat-pay-transaction-contract";

const directExpected = {
  merchantMode: "direct_merchant",
  merchantId: "1900000109",
  outTradeNo: "TC202607190001",
  amountFen: 100,
  transactionId: null,
} satisfies WechatPayTransactionExpectedBinding;

const partnerExpected = {
  merchantMode: "service_provider_sub_merchant",
  merchantId: "1900000200",
  subMerchantId: "1900000300",
  outTradeNo: "TC202607190002",
  amountFen: 200,
  transactionId: "4200000000002",
} satisfies WechatPayTransactionExpectedBinding;

const directSuccess = {
  mchid: directExpected.merchantId,
  out_trade_no: directExpected.outTradeNo,
  transaction_id: "4200000000001",
  trade_state: "SUCCESS",
  success_time: "2026-07-19T10:01:02+08:00",
  amount: { total: 100, currency: "CNY", payer_total: 100 },
};

const partnerSuccess = {
  sp_mchid: partnerExpected.merchantId,
  sub_mchid: partnerExpected.subMerchantId,
  out_trade_no: partnerExpected.outTradeNo,
  transaction_id: partnerExpected.transactionId,
  trade_state: "SUCCESS",
  success_time: "2026-07-19T10:02:03+08:00",
  amount: { total: 200, currency: "CNY" },
};

const mismatchCode = "BILLING_RECHARGE_WECHAT_TRANSACTION_MISMATCH";

describe("buildWechatPayTransactionExpectedBinding", () => {
  test("builds exact direct and partner merchant bindings", () => {
    const common = {
      outTradeNo: "TC1",
      amountFen: 100,
      transactionId: null,
    };
    expect(buildWechatPayTransactionExpectedBinding({
      merchantMode: "direct_merchant",
      merchantId: "mch-direct",
      subMerchantId: null,
      ...common,
    })).toEqual({
      merchantMode: "direct_merchant",
      merchantId: "mch-direct",
      ...common,
    });
    expect(buildWechatPayTransactionExpectedBinding({
      merchantMode: "service_provider_sub_merchant",
      merchantId: "mch-provider",
      subMerchantId: "mch-sub",
      ...common,
    })).toEqual({
      merchantMode: "service_provider_sub_merchant",
      merchantId: "mch-provider",
      subMerchantId: "mch-sub",
      ...common,
    });
  });

  test("rejects an incomplete local merchant binding", () => {
    expect(() => buildWechatPayTransactionExpectedBinding({
      merchantMode: "service_provider_sub_merchant",
      merchantId: "mch-provider",
      subMerchantId: null,
      outTradeNo: "TC1",
      amountFen: 100,
      transactionId: null,
    })).toThrow(expect.objectContaining({
      code: "BILLING_RECHARGE_WECHAT_TRANSACTION_BINDING_INVALID",
    }));
  });
});

describe("WeChat payment transaction source converters", () => {
  test("query converter exposes only the transaction contract whitelist", () => {
    expect(convertWechatPayTransactionQueryPayload({
      ...directSuccess,
      attach: "must-not-leak",
      payer: { openid: "must-not-leak" },
      amount: { ...directSuccess.amount, discount_refund: 99 },
    }, "request-id-1")).toEqual({
      mchid: directExpected.merchantId,
      sp_mchid: undefined,
      sub_mchid: undefined,
      out_trade_no: directExpected.outTradeNo,
      transaction_id: "4200000000001",
      trade_state: "SUCCESS",
      success_time: "2026-07-19T10:01:02+08:00",
      amount: { total: 100, currency: "CNY" },
      requestId: "request-id-1",
    });
  });

  test("callback converter exposes the same domain whitelist", () => {
    expect(convertWechatPayTransactionCallbackResource({
      ...partnerSuccess,
      attach: "must-not-leak",
    })).toEqual({
      mchid: undefined,
      sp_mchid: partnerExpected.merchantId,
      sub_mchid: partnerExpected.subMerchantId,
      out_trade_no: partnerExpected.outTradeNo,
      transaction_id: partnerExpected.transactionId,
      trade_state: "SUCCESS",
      success_time: "2026-07-19T10:02:03+08:00",
      amount: { total: 200, currency: "CNY" },
    });
  });
});

describe("parseAndAssertWechatPayTransactionQuery", () => {
  test("accepts a bound direct-merchant SUCCESS transaction", () => {
    expect(parseAndAssertWechatPayTransactionQuery(
      convertWechatPayTransactionQueryPayload(directSuccess, "direct-request-id"),
      directExpected,
    )).toEqual({
      merchantMode: "direct_merchant",
      merchantId: directExpected.merchantId,
      subMerchantId: null,
      outTradeNo: directExpected.outTradeNo,
      transactionId: "4200000000001",
      tradeState: "SUCCESS",
      successTime: "2026-07-19T10:01:02+08:00",
      amountFen: 100,
      currency: "CNY",
      requestId: "direct-request-id",
    });
  });

  test("accepts a bound partner SUCCESS transaction", () => {
    expect(parseAndAssertWechatPayTransactionQuery(
      convertWechatPayTransactionQueryPayload(partnerSuccess, "rid"),
      partnerExpected,
    )).toMatchObject({
      merchantMode: "service_provider_sub_merchant",
      merchantId: partnerExpected.merchantId,
      subMerchantId: partnerExpected.subMerchantId,
      transactionId: partnerExpected.transactionId,
      requestId: "rid",
    });
  });

  for (const tradeState of [
    "REFUND",
    "NOTPAY",
    "CLOSED",
    "REVOKED",
    "USERPAYING",
    "PAYERROR",
  ] as const) {
    test(`accepts documented non-success state ${tradeState}`, () => {
      expect(parseAndAssertWechatPayTransactionQuery(
        convertWechatPayTransactionQueryPayload({
          mchid: directExpected.merchantId,
          out_trade_no: directExpected.outTradeNo,
          trade_state: tradeState,
        }, "wechat-request-id"),
        directExpected,
      ).tradeState).toBe(tradeState);
    });
  }

  test.each([
    ["mchid", { mchid: "1900000199" }, directExpected],
    ["sp_mchid", { sp_mchid: "1900000299" }, partnerExpected],
    ["sub_mchid", { sub_mchid: "1900000399" }, partnerExpected],
    ["out_trade_no", { out_trade_no: "TC-OTHER" }, directExpected],
    ["transaction_id", {}, { ...partnerExpected, transactionId: "420-other" }],
    ["amount.total", { amount: { total: 101, currency: "CNY" } }, directExpected],
    ["amount.currency", { amount: { total: 100, currency: "USD" } }, directExpected],
  ] as const)("rejects a mismatched %s", (_field, override, expected) => {
    const source = expected.merchantMode === "direct_merchant"
      ? directSuccess
      : partnerSuccess;
    expect(() => parseAndAssertWechatPayTransactionQuery(
      convertWechatPayTransactionQueryPayload(
        { ...source, ...override },
        "wechat-request-id",
      ),
      expected,
    )).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test.each([
    ["mchid", { ...directSuccess, mchid: undefined }],
    ["out_trade_no", { ...directSuccess, out_trade_no: undefined }],
    ["trade_state", { ...directSuccess, trade_state: undefined }],
    ["transaction_id", { ...directSuccess, transaction_id: undefined }],
    ["amount.total", { ...directSuccess, amount: { currency: "CNY" } }],
    ["amount.currency", { ...directSuccess, amount: { total: 100 } }],
    ["success_time", { ...directSuccess, success_time: undefined }],
  ] as const)("rejects missing SUCCESS field %s", (_field, source) => {
    expect(() => parseAndAssertWechatPayTransactionQuery(
      convertWechatPayTransactionQueryPayload(source, "wechat-request-id"),
      directExpected,
    )).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test.each([
    ["transaction_id", { transaction_id: " transaction " }],
    ["trade_state", { trade_state: "PAID" }],
    ["success_time", { success_time: "2026-07-19 10:01:02" }],
    ["amount.total", { amount: { total: 1.5, currency: "CNY" } }],
    ["amount.total", { amount: { total: Number.MAX_SAFE_INTEGER + 1, currency: "CNY" } }],
  ] as const)("rejects invalid SUCCESS field %s", (_field, override) => {
    expect(() => parseAndAssertWechatPayTransactionQuery(
      convertWechatPayTransactionQueryPayload(
        { ...directSuccess, ...override },
        "wechat-request-id",
      ),
      directExpected,
    )).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects equal-amount replay from a different merchant and order", () => {
    expect(() => parseAndAssertWechatPayTransactionQuery(
      convertWechatPayTransactionQueryPayload({
        ...directSuccess,
        mchid: "1900000199",
        out_trade_no: "TC202607190099",
      }, "wechat-request-id"),
      directExpected,
    )).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test.each([undefined, null, "", " request-id "])(
    "rejects invalid query request id %s",
    (requestId) => {
      expect(() => parseAndAssertWechatPayTransactionQuery(
        {
          ...convertWechatPayTransactionQueryPayload(
            directSuccess,
            "valid-request-id",
          ),
          requestId,
        },
        directExpected,
      )).toThrow(expect.objectContaining({ code: mismatchCode }));
    },
  );
});

describe("parseAndAssertWechatPayTransactionCallback", () => {
  test("accepts only a bound TRANSACTION.SUCCESS event", () => {
    expect(parseAndAssertWechatPayTransactionCallback(
      "TRANSACTION.SUCCESS",
      convertWechatPayTransactionCallbackResource(partnerSuccess),
      partnerExpected,
    )).toMatchObject({ tradeState: "SUCCESS", amountFen: 200 });
  });

  test.each(["TRANSACTION.CLOSED", "", "REFUND.SUCCESS"])(
    "rejects callback event %s",
    (eventType) => {
      expect(() => parseAndAssertWechatPayTransactionCallback(
        eventType,
        convertWechatPayTransactionCallbackResource(partnerSuccess),
        partnerExpected,
      )).toThrow(expect.objectContaining({
        code: "BILLING_RECHARGE_WECHAT_TRANSACTION_EVENT_MISMATCH",
      }));
    },
  );

  test("rejects callback merchant replay before credit confirmation", () => {
    expect(() => parseAndAssertWechatPayTransactionCallback(
      "TRANSACTION.SUCCESS",
      convertWechatPayTransactionCallbackResource({
        ...partnerSuccess,
        sub_mchid: "1900000399",
      }),
      partnerExpected,
    )).toThrow(expect.objectContaining({ code: mismatchCode }));
  });
});
