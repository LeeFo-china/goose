import { createHash } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import type {
  PlatformPartnerMemberRecord,
  PlatformPartnerRecord,
} from "@/repositories/platform-partner-portal";
import type { JwtPayload } from "@/utils/jwt";

export const PLATFORM_PARTNER_ROLE = "platform_partner";

export type PartnerAuthMemberPayload = {
  id: string; partner_id: string; name: string; phone: string;
  role: PlatformPartnerMemberRecord["role"];
  status: PlatformPartnerMemberRecord["status"];
};

export type PartnerAuthLevelPayload = {
  id: string; code: string; name: string; status: string;
};

export type PartnerAuthPartnerPayload = {
  id: string; name: string;
  status: PlatformPartnerRecord["status"];
  region_codes: string[];
  level: { code: string; name: string } | null;
};

export type PartnerAuthResponse = {
  token: string; user_id: string;
  roles: [typeof PLATFORM_PARTNER_ROLE];
  mode: "platform_partner";
  authMode: "platform_partner";
  member: PartnerAuthMemberPayload;
  partner: PartnerAuthPartnerPayload;
  level: PartnerAuthLevelPayload | null;
};

export type PartnerAuthMeResponse = Omit<PartnerAuthResponse, "token">;

export type VisitorSessionSigner = (input: {
  openid: string;
  unionid?: string | null;
  visitorId: string;
}) => string;

export function serializeMember(member: PlatformPartnerMemberRecord): PartnerAuthMemberPayload {
  return { id: member.id, partner_id: member.partner_id, name: member.name, phone: member.phone, role: member.role, status: member.status };
}

export function serializePartner(partner: PlatformPartnerRecord): PartnerAuthPartnerPayload {
  return {
    id: partner.id,
    name: partner.name,
    status: partner.status,
    region_codes: partner.region_codes,
    level: partner.level
      ? {
        code: partner.level.code,
        name: partner.level.name,
      }
      : null,
  };
}

export function serializeLevel(partner: PlatformPartnerRecord): PartnerAuthLevelPayload | null {
  return partner.level
    ? { id: partner.level.id, code: partner.level.code, name: partner.level.name, status: partner.level.status }
    : null;
}

export function buildPartnerAuthResponse(input: {
  member: PlatformPartnerMemberRecord;
  userId: string;
  openid?: string;
  unionid?: string | null;
  tokenSigner: (payload: Omit<JwtPayload, "iat" | "exp">) => string;
}): PartnerAuthResponse {
  if (!input.member.partner) {
    throw Errors.business(
      403,
      "合伙人账号不可用",
      "PARTNER_ACCOUNT_DISABLED",
    );
  }

  const token = input.tokenSigner({
    sub: input.userId,
    token_type: "platform_partner",
    login_channel: "wechat",
    roles: [PLATFORM_PARTNER_ROLE],
    partner_id: input.member.partner_id,
    openid: input.openid,
    unionid: input.unionid ?? null,
  });

  return {
    token,
    user_id: input.userId,
    roles: [PLATFORM_PARTNER_ROLE],
    mode: "platform_partner",
    authMode: "platform_partner",
    member: serializeMember(input.member),
    partner: serializePartner(input.member.partner),
    level: serializeLevel(input.member.partner),
  };
}

export function buildPartnerVisitorAuthResponse(
  user: JwtPayload | undefined,
  visitorSessionSigner: VisitorSessionSigner,
) {
  const openid = typeof user?.openid === "string" ? user.openid.trim() : "";
  if (!openid) {
    throw Errors.business(403, "无城市合伙人访问权限", "PARTNER_AUTH_REQUIRED");
  }

  const visitorId = `wechat_visitor_${createHash("sha256").update(openid).digest("hex").slice(0, 32)}`;
  return {
    mode: "platform_visitor",
    authMode: "platform_visitor",
    token: visitorSessionSigner({
      openid,
      unionid: user?.unionid ?? null,
      visitorId,
    }),
    user_id: null,
    visitor_id: visitorId,
    roles: ["visitor"],
    is_new_user: false,
  };
}
