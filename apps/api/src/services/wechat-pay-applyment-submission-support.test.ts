import { describe, expect, test } from "bun:test";

import { AppError } from "@/errors/app-error";

import {
  isWechatApplymentNotFound,
  queryWechatApplymentIfExists,
  sanitizedApplymentErrorMetadata,
} from "./wechat-pay-applyment-submission-support";

const gatewayProfile = {
  merchantId: "1561816121",
  serialNo: "wechat-serial-no",
  privateKeyPem: "wechat-private-key",
  wechatPayPublicKeyId: "PUB_KEY_ID_00000000000000000000000000000000",
  wechatPayPublicKeyPem: "wechat-pay-public-key",
  baseUrl: "https://api.mch.weixin.qq.com",
};

function wechatQueryNotFoundByMessage() {
  return new AppError(
    502,
    "微信支付拒绝了进件请求",
    "WECHAT_PAY_APPLYMENT_REQUEST_REJECTED",
    {
      operation: "query",
      status: 400,
      wechatCode: "PARAM_ERROR",
      wechatMessage: "未能找到申请单",
    },
  );
}

describe("isWechatApplymentNotFound", () => {
  test("treats WeChat query PARAM_ERROR not found message as missing applyment", () => {
    expect(isWechatApplymentNotFound(wechatQueryNotFoundByMessage()))
      .toBe(true);
  });

  test("does not treat submit PARAM_ERROR not found message as missing applyment", () => {
    const error = new AppError(
      502,
      "微信支付拒绝了进件请求",
      "WECHAT_PAY_APPLYMENT_REQUEST_REJECTED",
      {
        operation: "submit",
        status: 400,
        wechatCode: "PARAM_ERROR",
        wechatMessage: "未能找到申请单",
      },
    );

    expect(isWechatApplymentNotFound(error)).toBe(false);
  });
});

describe("queryWechatApplymentIfExists", () => {
  test("returns null when WeChat query reports the business code has no applyment", async () => {
    const gateway = {
      queryByBusinessCode: async () => {
        throw wechatQueryNotFoundByMessage();
      },
    };

    await expect(queryWechatApplymentIfExists({
      gateway,
      profile: gatewayProfile,
      businessCode: "1561816121_WPA20260702141245VBO5CT",
    })).resolves.toBeNull();
  });
});

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
