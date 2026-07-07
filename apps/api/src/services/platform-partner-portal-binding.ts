import { Errors } from "@/errors/error-factory";
import type {
  PlatformPartnerMemberRecord,
  PlatformPartnerPortalRepositoryPort,
} from "@/repositories/platform-partner-portal";

type BindWithoutSmsRepository = Pick<
  PlatformPartnerPortalRepositoryPort,
  "findBindableMemberByPhone" | "bindMemberAuthUser"
>;

export function assertUsablePlatformPartnerMember(
  member: PlatformPartnerMemberRecord,
  options: { allowPendingBind?: boolean } = {},
) {
  const isAllowedMemberStatus = member.status === "active" ||
    (options.allowPendingBind === true && member.status === "pending_bind");
  if (!isAllowedMemberStatus || !member.partner || member.partner.status !== "active") {
    throw Errors.business(
      403,
      "合伙人账号不可用",
      "PARTNER_ACCOUNT_DISABLED",
    );
  }
}

export async function bindPlatformPartnerMemberWithoutSmsCode(input: {
  repository: BindWithoutSmsRepository;
  phone: string;
  authUserId: string;
}) {
  const member = await input.repository.findBindableMemberByPhone(input.phone);
  if (!member) {
    throw Errors.business(
      404,
      "未找到可绑定的合伙人成员",
      "PARTNER_MEMBER_NOT_FOUND",
    );
  }

  assertUsablePlatformPartnerMember(member, { allowPendingBind: true });

  if (member.auth_user_id && member.auth_user_id !== input.authUserId) {
    throw Errors.business(
      409,
      "该合伙人成员已绑定其他微信",
      "PARTNER_MEMBER_ALREADY_BOUND",
    );
  }

  if (member.auth_user_id === input.authUserId && member.status === "active") {
    return member;
  }

  const boundMember = await input.repository.bindMemberAuthUser(
    member.id,
    input.authUserId,
  );
  assertUsablePlatformPartnerMember(boundMember);
  return boundMember;
}
