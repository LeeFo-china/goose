import { Errors } from "@/errors/error-factory";
import {
  platformPartnerPortalRepository,
  type PlatformPartnerMemberRecord,
  type PlatformPartnerPortalRepositoryPort,
} from "@/repositories/platform-partner-portal";
import { assertUsablePlatformPartnerMember } from "@/services/platform-partner-portal-binding";
import { PLATFORM_PARTNER_ROLE } from "@/services/platform-partner-portal-auth-payloads";
import type { JwtPayload } from "@/utils/jwt";

export type PlatformPartnerIdentity = {
  userId: string;
  partnerId: string;
  memberId: string;
  member: PlatformPartnerMemberRecord;
};

type PartnerIdentityRepository = Pick<
  PlatformPartnerPortalRepositoryPort,
  "findMemberByAuthUserId"
>;

export async function requireCurrentPlatformPartnerMember(
  user?: JwtPayload,
  repository: PartnerIdentityRepository = platformPartnerPortalRepository,
): Promise<PlatformPartnerIdentity> {
  const partnerId = typeof user?.partner_id === "string"
    ? user.partner_id.trim()
    : "";
  const userId = typeof user?.sub === "string" ? user.sub.trim() : "";
  if (
    !partnerId ||
    !userId ||
    user?.token_type !== "platform_partner" ||
    !Array.isArray(user.roles) ||
    !user.roles.includes(PLATFORM_PARTNER_ROLE)
  ) {
    throw partnerAuthRequiredError();
  }

  const member = await repository.findMemberByAuthUserId(userId);
  if (!member || member.partner_id !== partnerId) {
    throw partnerAuthRequiredError();
  }
  assertUsablePlatformPartnerMember(member);
  return { userId, partnerId, memberId: member.id, member };
}

function partnerAuthRequiredError() {
  return Errors.business(
    403,
    "无城市合伙人访问权限",
    "PARTNER_AUTH_REQUIRED",
  );
}
