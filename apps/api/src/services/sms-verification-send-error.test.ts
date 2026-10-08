import { describe, expect, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import { toSmsVerificationSendError } from "./sms-verification-send-error";

describe("SMS verification provider errors", () => {
  test("redacts provider diagnostics and avoids promising an exact reset time", () => {
    const failure = Errors.business(503,
      "阿里云短信发送失败: isv.BUSINESS_LIMIT_CONTROL 触发天级流控Permits:10 Recommend: provider-diagnostic",
      "ALIYUN_SMS_SEND_FAILED");
    const result = toSmsVerificationSendError(failure);
    expect(result.statusCode).toBe(429);
    expect(result.message).toBe("验证码发送已达短信服务每日上限，请等待限流恢复后再试");
    expect(result.details).toEqual({ provider: "aliyun", limit_window: "day" });
    expect(JSON.stringify(result)).not.toContain("provider-diagnostic");
  });

  test("uses a generic frequency message when the provider does not identify a day limit", () => {
    const result = toSmsVerificationSendError(Errors.business(503,
      "阿里云短信发送失败: isv.BUSINESS_LIMIT_CONTROL 触发流控", "ALIYUN_SMS_SEND_FAILED"));
    expect(result).toMatchObject({
      statusCode: 429, code: "SMS_CODE_PROVIDER_RATE_LIMITED",
      message: "验证码发送已达短信服务频率上限，请稍后再试",
      details: { provider: "aliyun", limit_window: "unknown" },
    });
  });

  for (const failure of [
    Errors.business(503, "isv.INVALID_PARAMETERS", "ALIYUN_SMS_SEND_FAILED"),
    Errors.business(503, "isv.BUSINESS_LIMIT_CONTROL_OTHER", "ALIYUN_SMS_SEND_FAILED"),
    Errors.business(503, "isv.BUSINESS_LIMIT_CONTROL 天级", "OTHER_PROVIDER_FAILED"),
    new Error("isv.BUSINESS_LIMIT_CONTROL 天级"),
  ]) {
    test(`preserves unrelated send failure: ${failure.message}`, () => {
      expect(toSmsVerificationSendError(failure)).toMatchObject({
        statusCode: 500, code: "DB_ERROR", message: "发送验证码失败", details: failure,
      });
    });
  }
});
