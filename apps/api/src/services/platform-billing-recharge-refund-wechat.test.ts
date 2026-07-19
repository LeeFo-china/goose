import { describe, expect, test } from "bun:test";
import {
  toWechatQueriedRefundPayload,
  toWechatRequestedRefundPayload,
} from "@/services/platform-billing-recharge-refund-wechat";
import type {
  WechatPayRefundQueryResult,
  WechatPayRequestRefundResult,
} from "@/services/wechat-pay-gateway";

describe("refund response payload conversion", () => {
  test("uses known query fields when an untrusted response adds a raw object", () => {
    const refund = {
      out_refund_no: "TRR202607100800000001",
      refund_id: "5030000000202607150000000001",
      transaction_id: "4200000001",
      out_trade_no: "TC202607020001",
      status: "PROCESSING",
      success_time: "2026-07-19T10:01:02+08:00",
      amount: { refund: 10000, total: 10000, currency: "CNY" },
      requestId: "wechat-refund-query-request-id",
      raw: { out_refund_no: "UNTRUSTED-DECOY" },
    } satisfies WechatPayRefundQueryResult;

    const payload = toWechatQueriedRefundPayload(refund);
    expect(payload).toMatchObject({
      out_refund_no: "TRR202607100800000001",
      refund_id: "5030000000202607150000000001",
      transaction_id: "4200000001",
      out_trade_no: "TC202607020001",
      status: "PROCESSING",
      success_time: "2026-07-19T10:01:02+08:00",
      amount: { refund: 10000, total: 10000, currency: "CNY" },
      requestId: "wechat-refund-query-request-id",
    });
    expect(payload).not.toHaveProperty("raw");
  });

  test("uses the verified request payload with the trusted request id", () => {
    const refund = {
      out_refund_no: "TRR202607100800000001",
      refund_id: "5030000000202607150000000001",
      transaction_id: "4200000001",
      out_trade_no: "TC202607020001",
      status: "SUCCESS",
      success_time: "2026-07-19T10:01:02+08:00",
      amount: { refund: 10000, total: 10000, currency: "CNY" },
      requestId: "wechat-refund-request-id",
    } satisfies WechatPayRequestRefundResult;

    expect(toWechatRequestedRefundPayload(refund)).toEqual({
      out_refund_no: "TRR202607100800000001",
      refund_id: "5030000000202607150000000001",
      transaction_id: "4200000001",
      out_trade_no: "TC202607020001",
      status: "SUCCESS",
      success_time: "2026-07-19T10:01:02+08:00",
      amount: { refund: 10000, total: 10000, currency: "CNY" },
      requestId: "wechat-refund-request-id",
    });
  });
});
