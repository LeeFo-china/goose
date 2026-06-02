import { getSmsChannel } from "./legacy/config";
import { sendByChannel } from "./legacy/dispatcher";
import type { SmsScene, SmsTemplatePurpose } from "./legacy/shared";

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
