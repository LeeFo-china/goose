import { createHash, createHmac } from "node:crypto";
import { getRequiredSecretConfig, mapTencentApiError } from "./errors";
import {
  API_VERSION,
  DEFAULT_ENDPOINT,
  ErrorCodes,
  Errors,
  SERVICE,
  systemSettingsService,
  type TencentApiResponse,
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

function normalizeEndpoint(value: string) {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "") ||
    DEFAULT_ENDPOINT;
}

async function getConfig() {
  const [secretId, secretKey, region, endpoint] = await Promise.all([
    getRequiredSecretConfig("TENCENTCLOUD_SECRET_ID"),
    getRequiredSecretConfig("TENCENTCLOUD_SECRET_KEY"),
    systemSettingsService.getString("TENCENT_IOT_VIDEO_REGION", "ap-guangzhou"),
    systemSettingsService.getString("TENCENT_IOT_VIDEO_ENDPOINT", DEFAULT_ENDPOINT),
  ]);

  return {
    secretId,
    secretKey,
    region,
    endpoint: normalizeEndpoint(endpoint),
  };
}

export async function request<T>(
  action: string,
  payload: Record<string, unknown>,
): Promise<T & { RequestId?: string }> {
  const config = await getConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const date = formatUtcDate(timestamp);
  const body = JSON.stringify(payload);
  const canonicalHeaders = [
    "content-type:application/json; charset=utf-8",
    `host:${config.endpoint}`,
    `x-tc-action:${action.toLowerCase()}`,
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
  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const secretDate = hmac(`TC3${config.secretKey}`, date);
  const secretService = hmac(secretDate, SERVICE);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = hmacHex(secretSigning, stringToSign);
  const authorization = `TC3-HMAC-SHA256 Credential=${config.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  let response: Response;
  try {
    response = await fetch(`https://${config.endpoint}`, {
      method: "POST",
      headers: {
        "Authorization": authorization,
        "Content-Type": "application/json; charset=utf-8",
        "Host": config.endpoint,
        "X-TC-Action": action,
        "X-TC-Version": API_VERSION,
        "X-TC-Timestamp": String(timestamp),
        "X-TC-Region": config.region,
      },
      body,
    });
  } catch (error) {
    throw Errors.business(
      503,
      "腾讯云监控服务暂时不可用",
      ErrorCodes.TENCENT_IOT_VIDEO_API_ERROR,
      error instanceof Error ? { message: error.message } : undefined,
    );
  }

  const result = await response.json().catch(() => ({})) as TencentApiResponse<T>;
  const apiResponse = result.Response;
  if (!response.ok || apiResponse?.Error || !apiResponse) {
    throw mapTencentApiError(
      apiResponse?.Error,
      ErrorCodes.TENCENT_IOT_VIDEO_API_ERROR,
    );
  }

  return apiResponse;
}
