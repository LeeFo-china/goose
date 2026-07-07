import { Errors } from "@/errors/error-factory";

const WECHAT_SCENE_MAX_LENGTH = 32;

type PartnerInviteCodeSource = {
  id: string;
  region_codes: string[];
};

type PartnerInviteCodeAvailability = {
  status: string;
  expires_at: string | null;
};

export function normalizePartnerInviteCode(code: string) {
  return code.trim().toUpperCase();
}

export function buildPartnerInviteCampaignCode(inviteCode: string) {
  return inviteCode.replace(/^CP-/, "PIC-");
}

export function buildDefaultPartnerInviteCode(partner: PartnerInviteCodeSource) {
  const region = partner.region_codes[0] ?? "all";
  const partnerSuffix = partner.id.replaceAll("-", "").slice(-12).toUpperCase();
  return `CP-${region}-${partnerSuffix}`;
}

export function isPartnerInviteCodeAvailable(
  inviteCode: PartnerInviteCodeAvailability,
  now = Date.now(),
) {
  return inviteCode.status === "active" &&
    (!inviteCode.expires_at || new Date(inviteCode.expires_at).getTime() > now);
}

export function buildPartnerInviteCodeScene(code: string) {
  const normalizedCode = normalizePartnerInviteCode(code);
  if (normalizedCode.length > WECHAT_SCENE_MAX_LENGTH) {
    throw Errors.business(
      400,
      "邀请码过长，无法生成小程序码",
      "PARTNER_INVITE_CODE_SCENE_TOO_LONG",
    );
  }

  return normalizedCode;
}
