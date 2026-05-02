import Dysmsapi20170525, { SendSmsRequest } from "@alicloud/dysmsapi20170525";
import { Config } from "@alicloud/openapi-client";
import Credential, { Config as CredentialConfig } from "@alicloud/credentials";
import { RuntimeOptions } from "@alicloud/tea-util";
import type { SmsScene } from "@gooes/domain";

type SmsProvider = "mock" | "disabled" | "aliyun";

let aliyunSmsClient: Dysmsapi20170525 | null = null;

function getSmsProvider(): SmsProvider {
  const provider = (process.env.SMS_PROVIDER || "mock").trim().toLowerCase();

  if (provider === "mock" || provider === "disabled" || provider === "aliyun") {
    return provider;
  }

  return "mock";
}

function requireSmsEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`缺少短信环境变量: ${name}`);
  }

  return value;
}

function getAliyunTemplateCode(scene: SmsScene) {
  if (scene === "bind_customer") {
    return requireSmsEnv("ALIYUN_SMS_TEMPLATE_CODE_BIND_CUSTOMER");
  }

  if (scene === "admin_login") {
    return process.env.ALIYUN_SMS_TEMPLATE_CODE_ADMIN_LOGIN?.trim() ||
      requireSmsEnv("ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE");
  }

  return requireSmsEnv("ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE");
}

function getAliyunSmsClient() {
  if (aliyunSmsClient) {
    return aliyunSmsClient;
  }

  const accessKeyId = requireSmsEnv("ALIBABA_CLOUD_ACCESS_KEY_ID");
  const accessKeySecret = requireSmsEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET");
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
  const client = getAliyunSmsClient();
  const signName = requireSmsEnv("ALIYUN_SMS_SIGN_NAME");
  const templateCode = getAliyunTemplateCode(scene);

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
  const provider = getSmsProvider();

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
