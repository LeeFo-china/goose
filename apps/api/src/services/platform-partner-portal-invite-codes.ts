import type {
  PlatformPartnerInviteCodeCreateRecordInput,
  PlatformPartnerInviteCodeRecord,
} from "@/repositories/platform-partners";
import type {
  PlatformPartnerPortalRepositoryPort,
  PlatformPartnerRecord,
} from "@/repositories/platform-partner-portal";
import {
  buildDefaultPartnerInviteCode,
  buildPartnerInviteCampaignCode,
  buildPartnerInviteCodeScene,
  isPartnerInviteCodeAvailable,
} from "@/services/platform-partner-invite-code-utils";
import { systemSettingsService } from "@/services/system-settings";
import { wechatOpenLinkService } from "@/services/wechat-open-link";

const DEFAULT_PARTNER_ONBOARDING_PAGE = "pages/visitor/index";

export type PartnerInviteCodeQrcodeGenerator = (input: {
  scene: string;
}) => Promise<{ buffer: Buffer; contentType: "image/png" }>;

type DefaultInviteCodeInput = {
  partner: PlatformPartnerRecord;
  repository: Pick<
    PlatformPartnerPortalRepositoryPort,
    "listInviteCodes" | "createInviteCode"
  >;
  qrcodeGenerator: PartnerInviteCodeQrcodeGenerator;
};

export async function getDefaultPartnerInviteCode(input: DefaultInviteCodeInput) {
  const inviteCode = await getOrCreateDefaultInviteCode(input);
  const qrcode = await input.qrcodeGenerator({
    scene: buildPartnerInviteCodeScene(inviteCode.code),
  });

  return {
    invite_code: inviteCode.code,
    status: inviteCode.status,
    region_code: inviteCode.region_code,
    expires_at: inviteCode.expires_at,
    qr_code_content_type: qrcode.contentType,
    qr_code_image_base64: `data:${qrcode.contentType};base64,${
      qrcode.buffer.toString("base64")
    }`,
  };
}

export async function generatePartnerInviteCodeQrcode(input: {
  scene: string;
}) {
  const page = await systemSettingsService.getString(
    "WECHAT_PARTNER_ONBOARDING_PAGE",
    DEFAULT_PARTNER_ONBOARDING_PAGE,
  );
  const envVersion = wechatOpenLinkService.normalizeEnvVersion(
    await systemSettingsService.getString(
      "WECHAT_MINIPROGRAM_ENV_VERSION",
      "release",
    ),
  );
  const buffer = await wechatOpenLinkService.generateUnlimitedCode({
    page,
    scene: input.scene,
    envVersion,
  });

  return { buffer, contentType: "image/png" as const };
}

async function getOrCreateDefaultInviteCode(input: DefaultInviteCodeInput) {
  const existingInviteCode = await findAvailableInviteCode(input);
  if (existingInviteCode) return existingInviteCode;

  const code = buildDefaultPartnerInviteCode(input.partner);
  return input.repository.createInviteCode({
    partner_id: input.partner.id,
    code,
    region_code: input.partner.region_codes[0] ?? null,
    campaign_code: buildPartnerInviteCampaignCode(code),
    expires_at: null,
    created_by_employee_id: null,
  } satisfies PlatformPartnerInviteCodeCreateRecordInput);
}

async function findAvailableInviteCode(input: DefaultInviteCodeInput) {
  const inviteCodes = await input.repository.listInviteCodes(input.partner.id);
  return inviteCodes.find((inviteCode: PlatformPartnerInviteCodeRecord) =>
    isPartnerInviteCodeAvailable(inviteCode)
  ) ?? null;
}
