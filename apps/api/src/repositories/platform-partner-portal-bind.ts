import { Errors } from "@/errors/error-factory";
import {
  MEMBER_SELECT,
  type PartnerPortalTable,
  type PlatformPartnerMemberRecord,
  type UntypedTable,
} from "@/repositories/platform-partner-portal-types";

type BindMemberAuthUserInput = {
  from: (table: PartnerPortalTable) => UntypedTable;
  findMemberById: (memberId: string) => Promise<PlatformPartnerMemberRecord | null>;
  memberId: string;
  authUserId: string;
};

export async function bindPlatformPartnerMemberAuthUser(
  input: BindMemberAuthUserInput,
): Promise<PlatformPartnerMemberRecord> {
  const { data, error } = await input.from("platform_partner_members")
    .update({
      auth_user_id: input.authUserId,
      status: "active",
    })
    .eq("id", input.memberId)
    .or(`auth_user_id.is.null,auth_user_id.eq.${input.authUserId}`)
    .select(MEMBER_SELECT)
    .maybeSingle();

  if (error) throw Errors.dbError("绑定合伙人成员失败", error);
  if (data) return data as PlatformPartnerMemberRecord;

  return resolveMemberBindMiss({
    member: await input.findMemberById(input.memberId),
    authUserId: input.authUserId,
  });
}

function resolveMemberBindMiss(input: {
  member: PlatformPartnerMemberRecord | null;
  authUserId: string;
}): PlatformPartnerMemberRecord {
  if (!input.member) {
    throw Errors.business(
      404,
      "未找到可绑定的合伙人成员",
      "PARTNER_MEMBER_NOT_FOUND",
    );
  }

  if (input.member.auth_user_id && input.member.auth_user_id !== input.authUserId) {
    throw Errors.business(
      409,
      "该合伙人成员已绑定其他微信",
      "PARTNER_MEMBER_ALREADY_BOUND",
    );
  }

  if (input.member.auth_user_id === input.authUserId && input.member.status === "active") {
    return input.member;
  }

  throw Errors.dbError("绑定合伙人成员失败", {
    message: "platform partner member bind update affected no rows",
  });
}
