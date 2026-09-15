export type PhoneNumberCallbackEvent = {
  detail?: {
    code?: string;
    errMsg?: string;
    errno?: number;
    encryptedData?: string;
    iv?: string;
  };
};

type PhoneNumberCallbackResult = { code: string; error?: never }
  | { code?: never; error: string };

export function resolvePhoneNumberCallback(
  event: PhoneNumberCallbackEvent,
): PhoneNumberCallbackResult {
  const detail = event.detail;
  const code = detail?.code?.trim();
  if (code) return { code };

  const message = detail?.errMsg?.toLowerCase() ?? "";
  if (message.includes("platform auth deny") || message.includes("no permission")) {
    return { error: "当前小程序未开通抖音手机号能力，请联系运营人员" };
  }
  if (message.includes("no phone number")) {
    return { error: "抖音账号未绑定手机号，请先在抖音绑定或使用短信验证码" };
  }
  if (message.includes("not login") || message.includes("invalid session")) {
    return { error: "抖音登录状态已失效，请重新进入小程序后重试" };
  }
  if (message.includes("auth deny")) {
    return { error: "已拒绝抖音手机号授权，也可以使用短信验证码" };
  }
  if (message.includes("internal error")) {
    return { error: "抖音手机号服务暂时异常，请稍后重试" };
  }

  const sdkVersion = readSdkVersion();
  if (detail?.encryptedData && detail.iv) {
    return { error: `抖音返回旧版手机号回调${versionSuffix(sdkVersion)}，请更新抖音后重试` };
  }
  if (sdkVersion && isOlderThan(sdkVersion, "3.51.0")) {
    return { error: `当前抖音基础库 ${sdkVersion} 未支持手机号令牌，请更新抖音后重试` };
  }
  const errorCode = Number.isInteger(detail?.errno) && detail?.errno !== 0
    ? `，错误码 ${detail?.errno}` : "";
  const prefix = message.includes(":ok") ? "授权弹窗已确认，但抖音" : "抖音";
  return {
    error: `${prefix}未返回手机号令牌${versionSuffix(sdkVersion)}${errorCode}；请联系运营检查应用密钥配置`,
  };
}

function readSdkVersion(): string {
  try {
    return typeof tt === "undefined" ? "" : tt.getSystemInfoSync().SDKVersion ?? "";
  } catch {
    return "";
  }
}

function versionSuffix(version: string): string {
  return version ? `（基础库 ${version}）` : "";
}

function isOlderThan(actual: string, required: string): boolean {
  const a = actual.split(".").map(Number);
  const b = required.split(".").map(Number);
  if (a.length < 2 || a.some((part) => !Number.isInteger(part))) return false;
  for (let index = 0; index < b.length; index += 1) {
    if ((a[index] ?? 0) !== b[index]) return (a[index] ?? 0) < b[index];
  }
  return false;
}
