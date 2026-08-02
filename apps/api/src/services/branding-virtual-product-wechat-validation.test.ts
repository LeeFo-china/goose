import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import {
  BrandingVirtualProductWechatValidator,
  classifyWechatGoodsFailure,
} from "@/services/branding-virtual-product-wechat-validation";
import type {
  QueryVirtualGoodsPublishResult,
  QueryVirtualGoodsUploadResult,
} from "@/services/wechat-virtual-payment-gateway-contracts";


const successUpload = {
  requestId: "upload-request-id",
  environment: "production" as const,
  status: 3 as const,
  items: [{
    id: "branding-annual",
    name: "年度品牌权益",
    price: 9_900,
    remark: "年度数字权益",
    itemUrl: "https://cdn.example.test/branding.png",
    uploadStatus: 2 as const,
  }],
} satisfies QueryVirtualGoodsUploadResult;
const successPublish = {
  requestId: "publish-request-id",
  environment: "production" as const,
  status: 3 as const,
  items: [{ id: "branding-annual", publishStatus: 2 as const }],
} satisfies QueryVirtualGoodsPublishResult;

function createValidator(input: {
  upload?: QueryVirtualGoodsUploadResult;
  publish?: QueryVirtualGoodsPublishResult;
} = {}) {
  const getAccessToken = mock(async () => "access-token-sensitive");
  const queryUploadGoods = mock(async () => input.upload ?? successUpload);
  const queryPublishGoods = mock(async () => input.publish ?? successPublish);
  return {
    validator: new BrandingVirtualProductWechatValidator({
      accessTokenProvider: { getAccessToken },
      gateway: { queryUploadGoods, queryPublishGoods },
    }),
    getAccessToken,
    queryUploadGoods,
    queryPublishGoods,
  };
}

const validationInput = {
  environment: "production" as const,
  providerProductId: "branding-annual",
  expectedAmountFen: 9_900,
  appKey: "production-secret",
};

describe("BrandingVirtualProductWechatValidator", () => {
  test("confirms the fixed product only after the latest upload and publish tasks", async () => {
    const fixture = createValidator();

    await expect(fixture.validator.validate(validationInput)).resolves.toEqual({
      uploadRequestId: "upload-request-id",
      publishRequestId: "publish-request-id",
    });
    const signedInput = {
      accessToken: "access-token-sensitive",
      environment: "production",
      signingSecret: {
        environment: "production",
        appKey: "production-secret",
      },
    };
    expect(fixture.queryUploadGoods).toHaveBeenCalledWith(signedInput);
    expect(fixture.queryPublishGoods).toHaveBeenCalledWith(signedInput);
  });

  test.each([
    ["price mismatch", {
      ...successUpload,
      items: [{
        id: "branding-annual",
        name: "年度品牌权益",
        price: 8_800,
        remark: "年度数字权益",
        itemUrl: "https://cdn.example.test/branding.png",
        uploadStatus: 2 as const,
      }],
    }],
    ["failed latest task", { ...successUpload, status: 2 as const }],
    ["multiple goods", {
      ...successUpload,
      items: [...successUpload.items, {
        id: "another-product",
        name: "其他商品",
        price: 9_900,
        remark: "其他数字权益",
        itemUrl: "https://cdn.example.test/other.png",
        uploadStatus: 2 as const,
      }],
    }],
  ])("rejects an explicit latest upload %s under the fixed single-product boundary", async (
    _label,
    upload,
  ) => {
    const fixture = createValidator({ upload });

    await expect(fixture.validator.validate(validationInput)).rejects
      .toMatchObject({
        statusCode: 409,
        code: "BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_MISMATCH",
        details: { requestId: "upload-request-id" },
      });
    expect(fixture.queryPublishGoods).not.toHaveBeenCalled();
  });

  test("rejects a latest publish task that does not confirm the fixed product", async () => {
    const fixture = createValidator({
      publish: {
        ...successPublish,
        items: [{ id: "another-product", publishStatus: 2 }],
      },
    });

    await expect(fixture.validator.validate(validationInput)).rejects
      .toMatchObject({
        statusCode: 409,
        code: "BRANDING_VIRTUAL_PRODUCT_WECHAT_PUBLISH_MISMATCH",
        details: { requestId: "publish-request-id" },
      });
  });

  test.each([
    ["no-task", 0, "微信暂无最近批量上传任务可供校验"],
    ["running", 1, "微信最近一次批量上传任务仍在处理中，请稍后重试"],
  ] as const)(
    "reports upload %s task as unconfirmed",
    async (_label, status, message) => {
      const fixture = createValidator({
        upload: { ...successUpload, status, items: [] },
      });

      await expect(fixture.validator.validate(validationInput)).rejects
        .toMatchObject({
          statusCode: 409,
          code: "BRANDING_VIRTUAL_PRODUCT_WECHAT_TASK_PENDING",
          message,
          details: { requestId: "upload-request-id" },
        });
    },
  );

  test.each([
    ["no-task", 0, "微信暂无最近批量发布任务可供校验"],
    ["running", 1, "微信最近一次批量发布任务仍在处理中，请稍后重试"],
  ] as const)(
    "reports publish %s task as unconfirmed",
    async (_label, status, message) => {
      const fixture = createValidator({
        publish: { ...successPublish, status, items: [] },
      });

      await expect(fixture.validator.validate(validationInput)).rejects
        .toMatchObject({
          statusCode: 409,
          code: "BRANDING_VIRTUAL_PRODUCT_WECHAT_TASK_PENDING",
          message,
          details: { requestId: "publish-request-id" },
        });
    },
  );
});

describe("classifyWechatGoodsFailure", () => {
  test.each([
    "WECHAT_VIRTUAL_PAYMENT_UPSTREAM_REJECTED",
    "WECHAT_VIRTUAL_PAYMENT_HTTP_ERROR",
  ])("classifies an explicit WeChat %s as confirmed invalid", (code) => {
    const failure = classifyWechatGoodsFailure(Errors.business(
      502,
      "微信拒绝请求",
      code,
      {
        requestId: "safe-request-id",
        wechatErrcode: 268490003,
        errmsg: "must-not-leak",
      },
    ));

    expect(failure).toMatchObject({
      confirmedInvalid: true,
      error: {
        statusCode: 409,
        code: "BRANDING_VIRTUAL_PRODUCT_WECHAT_QUERY_REJECTED",
        details: {
          requestId: "safe-request-id",
          wechatErrcode: 268490003,
        },
      },
    });
    expect(JSON.stringify(failure)).not.toContain("must-not-leak");
  });

  test.each(
    [
      "WECHAT_VIRTUAL_PAYMENT_UPSTREAM_REJECTED",
      "WECHAT_VIRTUAL_PAYMENT_HTTP_ERROR",
    ].flatMap((gatewayCode) =>
      [-1, 268490002, 268490011, 268490012, 268490015].map((wechatErrcode) => [
        `${gatewayCode}:${wechatErrcode}`,
        gatewayCode,
        wechatErrcode,
      ] as const)
    ),
  )("keeps transient %s unconfirmed", (_label, gatewayCode, wechatErrcode) => {
    const failure = classifyWechatGoodsFailure(Errors.business(
      502,
      "微信暂时拒绝请求",
      gatewayCode,
      {
        requestId: "safe-request-id",
        wechatErrcode,
        errmsg: "must-not-leak",
      },
    ));

    expect(failure).toMatchObject({
      confirmedInvalid: false,
      error: {
        code: gatewayCode,
        details: { requestId: "safe-request-id", wechatErrcode },
      },
    });
    expect(JSON.stringify(failure)).not.toContain("must-not-leak");
  });

  test("keeps an unknown WeChat rejection unconfirmed", () => {
    const failure = classifyWechatGoodsFailure(Errors.business(
      502,
      "微信拒绝请求",
      "WECHAT_VIRTUAL_PAYMENT_UPSTREAM_REJECTED",
      { requestId: "safe-request-id", wechatErrcode: 268499999 },
    ));

    expect(failure.confirmedInvalid).toBe(false);
    expect(failure.error).toMatchObject({
      code: "WECHAT_VIRTUAL_PAYMENT_UPSTREAM_REJECTED",
      details: { requestId: "safe-request-id", wechatErrcode: 268499999 },
    });
  });

  test("keeps an invalid response unconfirmed and strips unsafe details", () => {
    const failure = classifyWechatGoodsFailure(Errors.business(
      502,
      "微信应答格式不正确",
      "WECHAT_VIRTUAL_PAYMENT_RESPONSE_INVALID",
      { requestId: "unsafe request id", token: "must-not-leak" },
    ));

    expect(failure).toMatchObject({
      confirmedInvalid: false,
      error: {
        code: "WECHAT_VIRTUAL_PAYMENT_RESPONSE_INVALID",
        details: { requestId: null, wechatErrcode: null },
      },
    });
    expect(JSON.stringify(failure)).not.toContain("must-not-leak");
  });
});
