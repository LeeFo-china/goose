import { createHash, createHmac } from "node:crypto";
import {
  normalizeEndpoint,
  readSmsConfig,
  requireSmsConfig,
} from "./config";
import {
  Errors,
  TENCENT_SMS_API_VERSION,
  TENCENT_SMS_DEFAULT_ENDPOINT,
  TENCENT_SMS_DEFAULT_REGION,
  TENCENT_SMS_SERVICE,
  type SmsChannel,
  type SmsProviderResult,
} from "./shared";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function formatUtcDate(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function normalizeTencentPhone(phone: string) {
  const normalized = phone.trim();
  return normalized.startsWith("+") ? normalized : `+86${normalized}`;
}

export async function sendTencentSms(input: {
  channel: SmsChannel;
  phone: string;
  templateId: string;
  templateParam: Record<string, string | number>;
}): Promise<SmsProviderResult> {
  const [secretId, secretKey, region, endpoint, sdkAppId, signName] =
    await Promise.all([
      requireSmsConfig(input.channel, "TENCENT_SMS_SECRET_ID"),
      requireSmsConfig(input.channel, "TENCENT_SMS_SECRET_KEY"),
      readSmsConfig(input.channel, "TENCENT_SMS_REGION", TENCENT_SMS_DEFAULT_REGION),
      readSmsConfig(input.channel, "TENCENT_SMS_ENDPOINT", TENCENT_SMS_DEFAULT_ENDPOINT),
      requireSmsConfig(input.channel, "TENCENT_SMS_SDK_APP_ID"),
      requireSmsConfig(input.channel, "TENCENT_SMS_SIGN_NAME"),
    ]);
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const timestamp = Math.floor(Date.now() / 1000);
  const date = formatUtcDate(timestamp);
  const body = JSON.stringify({
    PhoneNumberSet: [normalizeTencentPhone(input.phone)],
    SmsSdkAppId: sdkAppId,
    SignName: signName,
    TemplateId: input.templateId,
    TemplateParamSet: Object.values(input.templateParam).map(String),
  });
  const canonicalHeaders = [
    "content-type:application/json; charset=utf-8",
    `host:${normalizedEndpoint}`,
    `x-tc-action:${"SendSms".toLowerCase()}`,
    "",
  ].join("\n");
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256(body),
  ].join("\n");
  const credentialScope = `${date}/${TENCENT_SMS_SERVICE}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, TENCENT_SMS_SERVICE);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = hmacHex(secretSigning, stringToSign);
  const authorization =
    `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${normalizedEndpoint}`, {
    method: "POST",
    headers: {
      "Authorization": authorization,
      "Content-Type": "application/json; charset=utf-8",
      "Host": normalizedEndpoint,
      "X-TC-Action": "SendSms",
      "X-TC-Version": TENCENT_SMS_API_VERSION,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Region": region || TENCENT_SMS_DEFAULT_REGION,
    },
    body,
  });
  const result = await response.json().catch(() => ({})) as {
    Response?: {
      Error?: {
        Code?: string;
        Message?: string;
      };
      RequestId?: string;
      SendStatusSet?: Array<{
        Code?: string;
        Message?: string;
      }>;
    };
  };
  const apiError = result.Response?.Error;
  const sendStatus = result.Response?.SendStatusSet?.[0];
  if (!response.ok || apiError || sendStatus?.Code !== "Ok") {
    const code = apiError?.Code || sendStatus?.Code || "UNKNOWN";
    const message = apiError?.Message || sendStatus?.Message || "未知错误";
    throw Errors.business(
      503,
      `腾讯云短信发送失败: ${code} ${message}`,
      "TENCENT_SMS_SEND_FAILED",
    );
  }

  return {
    requestId: result.Response?.RequestId || null,
    providerCode: sendStatus?.Code || null,
    providerMessage: sendStatus?.Message || null,
  };
}
