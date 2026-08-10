import { describe, expect, test } from "bun:test";

import { getPlatformServiceRefundExecutionFeedback } from "./platform-service-order-rules";

describe("platform service refund execution feedback", () => {
  test("distinguishes verified SUCCESS from provider CLOSED", () => {
    expect(getPlatformServiceRefundExecutionFeedback({
      provider_status: "SUCCESS",
      refunded: true,
      access_terminated: true,
      retryable: false,
    })).toEqual({
      kind: "success",
      message: "微信退款成功，服务访问已终止",
    });
    expect(getPlatformServiceRefundExecutionFeedback({
      provider_status: "CLOSED",
      refunded: false,
      access_terminated: false,
      retryable: false,
    })).toEqual({
      kind: "warning",
      message: "微信退款已关闭，访问未终止，请重新发起退款申请",
    });
  });

  test("fails closed on a contradictory execution envelope", () => {
    expect(getPlatformServiceRefundExecutionFeedback({
      provider_status: "SUCCESS",
      refunded: false,
      access_terminated: false,
      retryable: false,
    })).toEqual({
      kind: "error",
      message: "退款执行结果不一致，请刷新后核查",
    });
  });
});
