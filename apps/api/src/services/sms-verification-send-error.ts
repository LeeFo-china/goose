import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";

/** Translate the provider's send-frequency rejection without exposing its diagnostics. */
export function toSmsVerificationSendError(error: unknown): AppError {
  if (
    error instanceof AppError &&
    error.code === "ALIYUN_SMS_SEND_FAILED" &&
    /\bisv\.BUSINESS_LIMIT_CONTROL\b/.test(error.message)
  ) {
    const dailyLimit = error.message.includes("天级");
    return Errors.business(
      429,
      dailyLimit
        ? "验证码发送已达短信服务每日上限，请等待限流恢复后再试"
        : "验证码发送已达短信服务频率上限，请稍后再试",
      "SMS_CODE_PROVIDER_RATE_LIMITED",
      { provider: "aliyun", limit_window: dailyLimit ? "day" : "unknown" },
    );
  }

  return Errors.dbError("发送验证码失败", error);
}
