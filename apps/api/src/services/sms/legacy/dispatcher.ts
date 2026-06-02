import { sendAliyunSms } from "./aliyun";
import {
  getAliyunTemplateCode,
  getTencentTemplateId,
} from "./config";
import {
  assertSmsChargeAvailable,
  isSmsChargeEnabled,
  logSmsSend,
  recordSmsBilling,
} from "./logging-billing";
import { sendTencentSms } from "./tencent";
import { Errors, type SmsChannel, type SmsTemplatePurpose } from "./shared";

export async function sendByChannel(input: {
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
      throw Errors.business(503, "短信服务未启用", "SMS_DISABLED");
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
