import { describe, expect, test } from "bun:test";
import {
  assertWechatRefundEventMatches,
  parseAndAssertWechatRefund,
  parseAndAssertWechatRefundCallback,
  type WechatRefundApiPayload,
  type WechatRefundCallbackExpectedBinding,
  type WechatRefundStatus,
} from "@/services/wechat-pay-refund-contract";

const expected = {
  outRefundNo: "TRR202607100800000001",
  wechatRefundId: null,
  transactionId: "4200000001",
  outTradeNo: "TC202607020001",
  refundAmountFen: 10000,
  totalAmountFen: 10000,
  currency: "CNY",
} as const;

const response = {
  out_refund_no: "TRR202607100800000001",
  refund_id: "5030000000202607150000000001",
  transaction_id: "4200000001",
  out_trade_no: "TC202607020001",
  status: "PROCESSING",
  amount: {
    refund: 10000,
    total: 10000,
    currency: "CNY",
  },
  requestId: "wechat-refund-request-id",
} satisfies WechatRefundApiPayload;

const mismatchCode = "BILLING_RECHARGE_WECHAT_REFUND_MISMATCH";

function withoutField(
  record: WechatRefundApiPayload,
  field: string,
): WechatRefundApiPayload {
  const copy: Record<string, unknown> = { ...record };
  delete copy[field];
  return copy as WechatRefundApiPayload;
}

function withAmount(
  amount: Record<string, unknown>,
): WechatRefundApiPayload {
  return { ...response, amount };
}

describe("parseAndAssertWechatRefund", () => {
  test("retains a validated RFC3339 success time for SUCCESS", () => {
    expect(parseAndAssertWechatRefund({
      ...response,
      status: "SUCCESS",
      success_time: "2026-07-19T10:01:02+08:00",
    }, expected)).toMatchObject({
      status: "SUCCESS",
      successTime: "2026-07-19T10:01:02+08:00",
    });
  });

  test("rejects SUCCESS without its documented success time", () => {
    expect(() => parseAndAssertWechatRefund({
      ...response,
      status: "SUCCESS",
    }, expected)).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects SUCCESS with an invalid success time", () => {
    expect(() => parseAndAssertWechatRefund({
      ...response,
      status: "SUCCESS",
      success_time: "2026-07-19 10:01:02",
    }, expected)).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("does not expose a success time for a non-SUCCESS state", () => {
    expect(parseAndAssertWechatRefund({
      ...response,
      success_time: "2026-07-19T10:01:02+08:00",
    }, expected).successTime).toBeNull();
  });

  for (
    const status of ["PROCESSING", "CLOSED", "ABNORMAL"] as const
  ) {
    test(`accepts documented ${status} status and retains verified request id`, () => {
      expect(
        parseAndAssertWechatRefund({ ...response, status }, expected),
      ).toEqual({
        outRefundNo: "TRR202607100800000001",
        wechatRefundId: "5030000000202607150000000001",
        transactionId: "4200000001",
        outTradeNo: "TC202607020001",
        status,
        refundAmountFen: 10000,
        totalAmountFen: 10000,
        currency: "CNY",
        requestId: "wechat-refund-request-id",
        successTime: null,
      });
    });
  }

  test("accepts an explicit null verified request id", () => {
    expect(
      parseAndAssertWechatRefund({ ...response, requestId: null }, expected)
        .requestId,
    ).toBeNull();
  });

  test("rejects a missing out refund number", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        withoutField(response, "out_refund_no"),
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a different out refund number", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        { ...response, out_refund_no: "TRR-OTHER" },
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a missing WeChat refund id", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        withoutField(response, "refund_id"),
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a WeChat refund id that differs from the stored id", () => {
    expect(() =>
      parseAndAssertWechatRefund(response, {
        ...expected,
        wechatRefundId: "5030000000202607150000009999",
      })
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a missing transaction id", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        withoutField(response, "transaction_id"),
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a different transaction id", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        { ...response, transaction_id: "4200000002" },
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a missing out trade number", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        withoutField(response, "out_trade_no"),
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a different out trade number", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        { ...response, out_trade_no: "TC-OTHER" },
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a missing refund amount", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        withAmount({ total: 10000, currency: "CNY" }),
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a different refund amount", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        withAmount({ refund: 9999, total: 10000, currency: "CNY" }),
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a missing total amount", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        withAmount({ refund: 10000, currency: "CNY" }),
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a different total amount", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        withAmount({ refund: 10000, total: 9999, currency: "CNY" }),
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  for (const field of ["refund", "total"] as const) {
    for (
      const value of [
        0,
        -1,
        1.5,
        "10000",
        Number.MAX_SAFE_INTEGER + 1,
      ] as const
    ) {
      test(`rejects invalid ${field} amount ${String(value)}`, () => {
        const expectedField = field === "refund"
          ? "refundAmountFen"
          : "totalAmountFen";
        const matchingExpected = typeof value === "number"
          ? { ...expected, [expectedField]: value }
          : expected;

        expect(() =>
          parseAndAssertWechatRefund(
            withAmount({ ...response.amount, [field]: value }),
            matchingExpected,
          )
        ).toThrow(expect.objectContaining({ code: mismatchCode }));
      });
    }
  }

  test("rejects a missing amount currency", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        withAmount({ refund: 10000, total: 10000 }),
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a different amount currency", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        withAmount({ refund: 10000, total: 10000, currency: "USD" }),
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a non-string amount currency", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        withAmount({ refund: 10000, total: 10000, currency: 1 }),
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a missing refund status", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        withoutField(response, "status"),
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects an unsupported refund status", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        { ...response, status: "UNKNOWN" },
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a missing verified request id carrier", () => {
    expect(() =>
      parseAndAssertWechatRefund(
        withoutField(response, "requestId"),
        expected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("does not expose a rejected raw response or credentials in error details", () => {
    let thrown: unknown;
    try {
      parseAndAssertWechatRefund({
        ...response,
        out_refund_no: "TRR-OTHER",
        signature: "signature-secret",
        authorization: "authorization-secret",
        private_key: "private-key-secret",
        apiv3_key: "api-v3-secret",
      }, expected);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: mismatchCode });
    const details = JSON.stringify(
      (thrown as { details?: unknown }).details ?? null,
    );
    expect(details).not.toContain("signature-secret");
    expect(details).not.toContain("authorization-secret");
    expect(details).not.toContain("private-key-secret");
    expect(details).not.toContain("api-v3-secret");
  });
});

describe("parseAndAssertWechatRefundCallback", () => {
  const callbackPayload = {
    mchid: "1112582521",
    out_refund_no: "TRR202607100800000001",
    refund_id: "5030000000202607150000000001",
    transaction_id: "4200000001",
    out_trade_no: "TC202607020001",
    refund_status: "SUCCESS",
    success_time: "2026-07-10T08:05:00+08:00",
    amount: {
      refund: 10000,
      total: 10000,
      payer_refund: 10000,
      payer_total: 10000,
    },
  };
  const directExpected = {
    ...expected,
    merchantMode: "direct_merchant",
    merchantId: "1112582521",
  } satisfies WechatRefundCallbackExpectedBinding;
  const callbackResource = callbackPayload;

  test("validates a direct-merchant callback using refund_status", () => {
    expect(
      parseAndAssertWechatRefundCallback(callbackResource, directExpected),
    ).toEqual({
      outRefundNo: "TRR202607100800000001",
      wechatRefundId: "5030000000202607150000000001",
      transactionId: "4200000001",
      outTradeNo: "TC202607020001",
      status: "SUCCESS",
      refundAmountFen: 10000,
      totalAmountFen: 10000,
      currency: "CNY",
      requestId: null,
      successTime: "2026-07-10T08:05:00+08:00",
    });
  });

  test("rejects a SUCCESS callback without success_time", () => {
    const withoutSuccessTime = { ...callbackResource };
    delete (withoutSuccessTime as Partial<typeof callbackResource>).success_time;
    expect(() =>
      parseAndAssertWechatRefundCallback(withoutSuccessTime, directExpected)
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a SUCCESS callback with invalid success_time", () => {
    expect(() =>
      parseAndAssertWechatRefundCallback(
        { ...callbackResource, success_time: "not-rfc3339" },
        directExpected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a direct-merchant callback with a different mchid", () => {
    expect(() =>
      parseAndAssertWechatRefundCallback(
        { ...callbackResource, mchid: "1112582522" },
        directExpected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  const partnerExpected = {
    ...expected,
    merchantMode: "service_provider_sub_merchant",
    merchantId: "1561816121",
    subMerchantId: "1900000109",
  } satisfies WechatRefundCallbackExpectedBinding;
  const partnerResource = {
    out_refund_no: callbackPayload.out_refund_no,
    refund_id: callbackPayload.refund_id,
    transaction_id: callbackPayload.transaction_id,
    out_trade_no: callbackPayload.out_trade_no,
    refund_status: callbackPayload.refund_status,
    success_time: callbackPayload.success_time,
    amount: callbackPayload.amount,
    sp_mchid: "1561816121",
    sub_mchid: "1900000109",
  };

  test("validates a service-provider callback using both merchant ids", () => {
    expect(
      parseAndAssertWechatRefundCallback(partnerResource, partnerExpected),
    ).toMatchObject({ status: "SUCCESS", requestId: null });
  });

  test("rejects a service-provider callback with a different sp_mchid", () => {
    expect(() =>
      parseAndAssertWechatRefundCallback(
        { ...partnerResource, sp_mchid: "1561816122" },
        partnerExpected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects a service-provider callback with a different sub_mchid", () => {
    expect(() =>
      parseAndAssertWechatRefundCallback(
        { ...partnerResource, sub_mchid: "1900000110" },
        partnerExpected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });

  test("rejects an optional non-CNY callback currency", () => {
    expect(() =>
      parseAndAssertWechatRefundCallback(
        {
          ...callbackResource,
          amount: { ...callbackResource.amount, currency: "USD" },
        },
        directExpected,
      )
    ).toThrow(expect.objectContaining({ code: mismatchCode }));
  });
});

describe("assertWechatRefundEventMatches", () => {
  for (
    const [eventType, status] of [
      ["REFUND.SUCCESS", "SUCCESS"],
      ["REFUND.CLOSED", "CLOSED"],
      ["REFUND.ABNORMAL", "ABNORMAL"],
    ] as const
  ) {
    test(`accepts exact ${eventType} and ${status} pair`, () => {
      expect(() => assertWechatRefundEventMatches(eventType, status))
        .not.toThrow();
    });
  }

  test("rejects a contradictory refund event and status pair", () => {
    expect(() => assertWechatRefundEventMatches("REFUND.SUCCESS", "CLOSED"))
      .toThrow(expect.objectContaining({
        code: "BILLING_RECHARGE_WECHAT_REFUND_EVENT_MISMATCH",
      }));
  });

  test("rejects an unsupported refund event", () => {
    expect(() => assertWechatRefundEventMatches("REFUND.PROCESSING", "SUCCESS"))
      .toThrow(expect.objectContaining({
        code: "BILLING_RECHARGE_WECHAT_REFUND_EVENT_MISMATCH",
      }));
  });

  test("rejects PROCESSING because it has no terminal callback event", () => {
    expect(() => assertWechatRefundEventMatches("REFUND.SUCCESS", "PROCESSING"))
      .toThrow(expect.objectContaining({
        code: "BILLING_RECHARGE_WECHAT_REFUND_EVENT_MISMATCH",
      }));
  });

  test("rejects an unsupported runtime refund status", () => {
    expect(() =>
      assertWechatRefundEventMatches(
        "REFUND.SUCCESS",
        "UNKNOWN" as WechatRefundStatus,
      )
    ).toThrow(expect.objectContaining({
      code: "BILLING_RECHARGE_WECHAT_REFUND_EVENT_MISMATCH",
    }));
  });
});
