import { describe, expect, test } from "bun:test";

import { AppError } from "@/errors/app-error";

import { sanitizedApplymentErrorMetadata } from "./wechat-pay-applyment-submission-support";

describe("sanitizedApplymentErrorMetadata", () => {
  test("keeps safe WeChat rejection diagnostics for audit events", () => {
    const error = new AppError(
      502,
      "微信支付拒绝了进件请求",
      "WECHAT_PAY_APPLYMENT_REQUEST_REJECTED",
      {
        operation: "submit",
        requestId: "wechat-request-id",
        wechatCode: "PARAM_ERROR",
        wechatMessage: "参数错误：settlement_info.qualification_type 无效",
      },
    );

    expect(sanitizedApplymentErrorMetadata(error)).toEqual({
      error_code: "WECHAT_PAY_APPLYMENT_REQUEST_REJECTED",
      operation: "submit",
      request_id: "wechat-request-id",
      wechat_code: "PARAM_ERROR",
      wechat_message: "参数错误：settlement_info.qualification_type 无效",
    });
  });
});
