import { createHash, createHmac } from "node:crypto";
import Dysmsapi20170525, { SendSmsRequest } from "@alicloud/dysmsapi20170525";
import { Config } from "@alicloud/openapi-client";
import Credential, { Config as CredentialConfig } from "@alicloud/credentials";
import { RuntimeOptions } from "@alicloud/tea-util";
import { smsSendLogRepository } from "@/repositories/sms-send-logs";
import { billingService } from "@/services/billing";
import { systemSettingsService } from "@/services/system-settings";
import type { SmsScene } from "@gooes/domain";

type SmsProvider = "mock" | "disabled" | "aliyun" | "tencent";
type SmsTemplatePurpose = SmsScene | "project_acceptance";
type SmsChannel = {
  provider: SmsProvider;
  tenantId?: string | null;
  strictTenantConfig: boolean;
  channelMode: "platform" | "tenant_aliyun" | "tenant_tencent";
};
type SmsProviderResult = {
  requestId?: string | null;
  providerCode?: string | null;
  providerMessage?: string | null;
};

const TENCENT_SMS_API_VERSION = "2021-01-11";
const TENCENT_SMS_SERVICE = "sms";
const TENCENT_SMS_DEFAULT_ENDPOINT = "sms.tencentcloudapi.com";
const TENCENT_SMS_DEFAULT_REGION = "ap-guangzhou";

function normalizeProvider(value: string): SmsProvider {
  const provider = value.trim().toLowerCase();
  if (
    provider === "mock" ||
    provider === "disabled" ||
    provider === "aliyun" ||
    provider === "tencent"
  ) {
    return provider;
  }

  return "mock";
}

function normalizeEndpoint(value: string) {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "") ||
    TENCENT_SMS_DEFAULT_ENDPOINT;
}

function getTemplateConfigKey(input: {
  provider: "aliyun" | "tencent";
  purpose: SmsTemplatePurpose;
}) {
  const prefix = input.provider === "aliyun"
    ? "ALIYUN_SMS_TEMPLATE_CODE"
    : "TENCENT_SMS_TEMPLATE_ID";

  if (input.purpose === "bind_customer") {
    return `${prefix}_BIND_CUSTOMER`;
  }

  if (input.purpose === "admin_login") {
    return `${prefix}_ADMIN_LOGIN`;
  }

  if (input.purpose === "project_acceptance") {
    return `${prefix}_PROJECT_ACCEPTANCE`;
  }

  return `${prefix}_BIND_EMPLOYEE`;
}

async function getSmsChannel(tenantId?: string | null): Promise<SmsChannel> {
  if (tenantId) {
    const mode = (await systemSettingsService.getTenantOverrideString(
      "SMS_CHANNEL_MODE",
      tenantId,
      "platform",
    )).trim();

    if (mode === "tenant_aliyun") {
      return {
        provider: "aliyun",
        tenantId,
        strictTenantConfig: true,
        channelMode: "tenant_aliyun",
      };
    }

    if (mode === "tenant_tencent") {
      return {
        provider: "tencent",
        tenantId,
        strictTenantConfig: true,
        channelMode: "tenant_tencent",
      };
    }
  }

  const provider = normalizeProvider(
    await systemSettingsService.getString("SMS_PROVIDER", "mock"),
  );
  return {
    provider,
    tenantId: tenantId || null,
    strictTenantConfig: false,
    channelMode: "platform",
  };
}

async function readSmsConfig(
  channel: SmsChannel,
  key: string,
  fallbackValue = "",
) {
  if (channel.strictTenantConfig) {
    return systemSettingsService.getTenantOverrideString(
      key,
      channel.tenantId,
      fallbackValue,
    );
  }

  return systemSettingsService.getSecretString(key, fallbackValue);
}

async function requireSmsConfig(channel: SmsChannel, key: string) {
  const value = await readSmsConfig(channel, key);

  if (!value) {
    throw new Error(
      channel.strictTenantConfig
        ? `租户短信配置不完整: ${key}`
        : `缺少短信配置: ${key}`,
    );
  }

  return value;
}

async function getAliyunTemplateCode(
  channel: SmsChannel,
  purpose: SmsTemplatePurpose,
) {
  const key = getTemplateConfigKey({ provider: "aliyun", purpose });
  const value = await readSmsConfig(channel, key);
  if (value) return value;

  if (purpose === "admin_login") {
    return requireSmsConfig(
      channel,
      getTemplateConfigKey({ provider: "aliyun", purpose: "bind_employee" }),
    );
  }

  return requireSmsConfig(channel, key);
}

async function getAliyunSmsClient(channel: SmsChannel) {
  const accessKeyId = await requireSmsConfig(channel, "ALIBABA_CLOUD_ACCESS_KEY_ID");
  const accessKeySecret = await requireSmsConfig(channel, "ALIBABA_CLOUD_ACCESS_KEY_SECRET");
  const credentialsConfig = new CredentialConfig({
    type: "access_key",
    accessKeyId,
    accessKeySecret,
  });
  const credential = new Credential(credentialsConfig);

  const config = new Config({
    credential,
  });

  config.endpoint = "dysmsapi.aliyuncs.com";
  return new Dysmsapi20170525(config);
}

async function sendAliyunSms(input: {
  channel: SmsChannel;
  phone: string;
  templateCode: string;
  templateParam: Record<string, string | number>;
}): Promise<SmsProviderResult> {
  const client = await getAliyunSmsClient(input.channel);
  const signName = await requireSmsConfig(input.channel, "ALIYUN_SMS_SIGN_NAME");

  const request = new SendSmsRequest({
    phoneNumbers: input.phone,
    signName,
    templateCode: input.templateCode,
    templateParam: JSON.stringify(input.templateParam),
  });

  const runtime = new RuntimeOptions({
    connectTimeout: 5000,
    readTimeout: 5000,
    autoretry: false,
  });

  try {
    const response = await client.sendSmsWithOptions(request, runtime);
    const responseCode = response.body?.code;

    if (responseCode !== "OK") {
      throw new Error(
        `阿里云短信发送失败: ${responseCode || "UNKNOWN"} ${response.body?.message || "未知错误"}`,
      );
    }

    return {
      requestId: response.body?.requestId || null,
      providerCode: responseCode || null,
      providerMessage: response.body?.message || null,
    };
  } catch (error) {
    const err = error as {
      message?: string;
      data?: { Recommend?: string };
    };

    const recommend = err.data?.Recommend;
    if (recommend) {
      throw new Error(`${err.message || "阿里云短信发送异常"}，诊断信息：${recommend}`);
    }

    throw error;
  }
}

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

function maskPhone(phone: string) {
  const normalized = phone.trim();
  if (normalized.length < 7) return "***";
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function hashPhone(phone: string) {
  const salt = process.env.SMS_LOG_HASH_SALT || process.env.JWT_SECRET || "gooes_sms_log";
  return createHash("sha256")
    .update(`${phone.trim()}:${salt}`, "utf8")
    .digest("hex");
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code || "SMS_SEND_FAILED");
  }

  return "SMS_SEND_FAILED";
}

function isSmsChargeEnabled() {
  return String(process.env.SMS_CHARGE_ENABLED || "").toLowerCase() === "true";
}

async function assertSmsChargeAvailable(input: {
  channel: SmsChannel;
  purpose: SmsTemplatePurpose;
  templateCode?: string | null;
}) {
  if (!isSmsChargeEnabled() || !input.channel.tenantId) {
    return;
  }

  await billingService.assertSmsChargeAvailable({
    tenantId: input.channel.tenantId,
    smsCount: 1,
    purpose: input.purpose,
    provider: input.channel.provider,
    templateCode: input.templateCode,
  });
}

async function recordSmsBilling(input: {
  log: Awaited<ReturnType<typeof smsSendLogRepository.create>>;
  chargeEnabled: boolean;
}) {
  if (!input.log) return;

  const result = await billingService.recordSmsBilling({
    log: input.log,
    chargeEnabled: input.chargeEnabled,
  });

  if (result?.event) {
    await smsSendLogRepository.markBillingResult({
      id: input.log.id,
      billingEventId: result.event.id,
      billed: result.settled,
    });
  }
}

async function logSmsSend(input: {
  channel: SmsChannel;
  phone: string;
  purpose: SmsTemplatePurpose;
  templateCode?: string | null;
  status: "success" | "failure" | "mock" | "disabled";
  providerResult?: SmsProviderResult | null;
  error?: unknown;
  durationMs?: number | null;
  smsCount?: number;
}) {
  try {
    return await smsSendLogRepository.create({
      tenantId: input.channel.tenantId || null,
      provider: input.channel.provider,
      channelMode: input.channel.channelMode,
      purpose: input.purpose,
      templateCode: input.templateCode || null,
      phoneMasked: maskPhone(input.phone),
      phoneHash: hashPhone(input.phone),
      status: input.status,
      requestId: input.providerResult?.requestId || null,
      providerCode: input.providerResult?.providerCode || null,
      providerMessage: input.providerResult?.providerMessage || null,
      errorCode: input.error ? getErrorCode(input.error) : null,
      errorMessage: input.error instanceof Error ? input.error.message : null,
      smsCount: input.smsCount ?? (input.status === "mock" || input.status === "disabled" ? 0 : 1),
      deliveryStatus: input.status === "success"
        ? "submitted_success"
        : input.status === "failure"
          ? "submit_failed"
          : null,
      durationMs: input.durationMs ?? null,
      metadata: {
        strict_tenant_config: input.channel.strictTenantConfig,
      },
    });
  } catch {
    // 短信日志不能影响主业务链路。
    return null;
  }
}

async function getTencentTemplateId(
  channel: SmsChannel,
  purpose: SmsTemplatePurpose,
) {
  const key = getTemplateConfigKey({ provider: "tencent", purpose });
  const value = await readSmsConfig(channel, key);
  if (value) return value;

  if (purpose === "admin_login") {
    return requireSmsConfig(
      channel,
      getTemplateConfigKey({ provider: "tencent", purpose: "bind_employee" }),
    );
  }

  return requireSmsConfig(channel, key);
}

function normalizeTencentPhone(phone: string) {
  const normalized = phone.trim();
  return normalized.startsWith("+") ? normalized : `+86${normalized}`;
}

async function sendTencentSms(input: {
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
    throw new Error(`腾讯云短信发送失败: ${code} ${message}`);
  }

  return {
    requestId: result.Response?.RequestId || null,
    providerCode: sendStatus?.Code || null,
    providerMessage: sendStatus?.Message || null,
  };
}

async function sendByChannel(input: {
  channel: SmsChannel;
  phone: string;
  purpose: SmsTemplatePurpose;
  templateCode?: string;
  templateParam: Record<string, string | number>;
}) {
  const startedAt = Date.now();
  let templateCode = input.templateCode || null;
  let logged = false;

  const durationMs = () => Date.now() - startedAt;

  try {
    if (input.channel.provider === "disabled") {
      await logSmsSend({
        channel: input.channel,
        phone: input.phone,
        purpose: input.purpose,
        templateCode,
        status: "disabled",
        durationMs: durationMs(),
        smsCount: 0,
      });
      logged = true;
      throw new Error("短信服务未启用");
    }

    if (input.channel.provider === "mock") {
      await logSmsSend({
        channel: input.channel,
        phone: input.phone,
        purpose: input.purpose,
        templateCode,
        status: "mock",
        durationMs: durationMs(),
        smsCount: 0,
      });
      logged = true;
      return;
    }

    if (input.channel.provider === "aliyun") {
      templateCode = input.templateCode ||
        await getAliyunTemplateCode(input.channel, input.purpose);
      await assertSmsChargeAvailable({
        channel: input.channel,
        purpose: input.purpose,
        templateCode,
      });
      const providerResult = await sendAliyunSms({
        channel: input.channel,
        phone: input.phone,
        templateCode,
        templateParam: input.templateParam,
      });
      const log = await logSmsSend({
        channel: input.channel,
        phone: input.phone,
        purpose: input.purpose,
        templateCode,
        status: "success",
        providerResult,
        durationMs: durationMs(),
      });
      logged = true;
      await recordSmsBilling({
        log,
        chargeEnabled: isSmsChargeEnabled(),
      });
      return;
    }

    if (input.channel.provider === "tencent") {
      templateCode = await getTencentTemplateId(input.channel, input.purpose);
      await assertSmsChargeAvailable({
        channel: input.channel,
        purpose: input.purpose,
        templateCode,
      });
      const providerResult = await sendTencentSms({
        channel: input.channel,
        phone: input.phone,
        templateId: templateCode,
        templateParam: input.templateParam,
      });
      const log = await logSmsSend({
        channel: input.channel,
        phone: input.phone,
        purpose: input.purpose,
        templateCode,
        status: "success",
        providerResult,
        durationMs: durationMs(),
      });
      logged = true;
      await recordSmsBilling({
        log,
        chargeEnabled: isSmsChargeEnabled(),
      });
    }
  } catch (error) {
    if (!logged) {
      await logSmsSend({
        channel: input.channel,
        phone: input.phone,
        purpose: input.purpose,
        templateCode,
        status: "failure",
        error,
        durationMs: durationMs(),
        smsCount: 0,
      });
    }
    throw error;
  }
}

export async function sendSmsCode(
  phone: string,
  code: string,
  scene: SmsScene,
  options?: { tenantId?: string | null },
): Promise<void> {
  await sendByChannel({
    channel: await getSmsChannel(options?.tenantId),
    phone,
    purpose: scene,
    templateParam: { code },
  });
}

export async function sendSmsTemplate(input: {
  phone: string;
  templateCode?: string;
  templateParam: Record<string, string | number>;
  tenantId?: string | null;
  templatePurpose?: SmsTemplatePurpose;
}): Promise<void> {
  await sendByChannel({
    channel: await getSmsChannel(input.tenantId),
    phone: input.phone,
    purpose: input.templatePurpose || "project_acceptance",
    templateCode: input.templateCode,
    templateParam: input.templateParam,
  });
}
