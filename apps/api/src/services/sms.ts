import Dysmsapi20170525, { SendSmsRequest } from "@alicloud/dysmsapi20170525";
import { Config } from "@alicloud/openapi-client";
import Credential, { Config as CredentialConfig } from "@alicloud/credentials";
import { RuntimeOptions } from "@alicloud/tea-util";
import { systemSettingsService } from "@/services/system-settings";
import type { SmsScene } from "@gooes/domain";

type SmsProvider = "mock" | "disabled" | "aliyun";

let aliyunSmsClient: Dysmsapi20170525 | null = null;

async function getSmsProvider(): Promise<SmsProvider> {
  const provider = (await systemSettingsService.getString("SMS_PROVIDER", "mock"))
    .trim()
    .toLowerCase();

  if (provider === "mock" || provider === "disabled" || provider === "aliyun") {
    return provider;
  }

  return "mock";
}

async function requireSmsConfig(name: string) {
  const value = await systemSettingsService.getSecretString(name);

  if (!value) {
    throw new Error(`缺少短信配置: ${name}`);
  }

  return value;
}

async function getAliyunTemplateCode(scene: SmsScene) {
  if (scene === "bind_customer") {
    const value = await systemSettingsService.getString("ALIYUN_SMS_TEMPLATE_CODE_BIND_CUSTOMER");
    return value || await requireSmsConfig("ALIYUN_SMS_TEMPLATE_CODE_BIND_CUSTOMER");
  }

  if (scene === "admin_login") {
    const value = await systemSettingsService.getString("ALIYUN_SMS_TEMPLATE_CODE_ADMIN_LOGIN");
    return value ||
      await requireSmsConfig("ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE");
  }

  const value = await systemSettingsService.getString("ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE");
  return value || await requireSmsConfig("ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE");
}

async function getAliyunSmsClient() {
  if (aliyunSmsClient) {
    return aliyunSmsClient;
  }

  const accessKeyId = await requireSmsConfig("ALIBABA_CLOUD_ACCESS_KEY_ID");
  const accessKeySecret = await requireSmsConfig("ALIBABA_CLOUD_ACCESS_KEY_SECRET");
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
  aliyunSmsClient = new Dysmsapi20170525(config);

  return aliyunSmsClient;
}

async function sendAliyunSmsCode(phone: string, code: string, scene: SmsScene) {
  const client = await getAliyunSmsClient();
  const signName = await systemSettingsService.getString("ALIYUN_SMS_SIGN_NAME") ||
    await requireSmsConfig("ALIYUN_SMS_SIGN_NAME");
  const templateCode = await getAliyunTemplateCode(scene);

  const request = new SendSmsRequest({
    phoneNumbers: phone,
    signName,
    templateCode,
    templateParam: JSON.stringify({ code }),
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

export async function sendSmsCode(
  phone: string,
  code: string,
  scene: SmsScene,
): Promise<void> {
  const provider = await getSmsProvider();

  if (provider === "disabled") {
    throw new Error("短信服务未启用");
  }

  if (provider === "mock") {
    return;
  }

  if (provider === "aliyun") {
    await sendAliyunSmsCode(phone, code, scene);
  }
}
