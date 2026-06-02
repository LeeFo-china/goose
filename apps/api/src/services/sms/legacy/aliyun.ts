import Dysmsapi20170525, { SendSmsRequest } from "@alicloud/dysmsapi20170525";
import { Config } from "@alicloud/openapi-client";
import Credential, { Config as CredentialConfig } from "@alicloud/credentials";
import { RuntimeOptions } from "@alicloud/tea-util";
import { requireSmsConfig } from "./config";
import { Errors, type SmsChannel, type SmsProviderResult } from "./shared";

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

export async function sendAliyunSms(input: {
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
      throw Errors.business(
        503,
        `阿里云短信发送失败: ${responseCode || "UNKNOWN"} ${response.body?.message || "未知错误"}`,
        "ALIYUN_SMS_SEND_FAILED",
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
      throw Errors.business(
        503,
        `${err.message || "阿里云短信发送异常"}，诊断信息：${recommend}`,
        "ALIYUN_SMS_SEND_FAILED",
      );
    }

    throw error;
  }
}
