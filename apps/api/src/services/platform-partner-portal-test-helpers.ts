import type {
  PlatformPartnerInviteCodeCreateRecordInput,
  PlatformPartnerInviteCodeRecord,
} from "@/repositories/platform-partners";

export function createTestPartnerInviteCode(
  input: PlatformPartnerInviteCodeCreateRecordInput,
): PlatformPartnerInviteCodeRecord {
  return {
    id: "invite-code-id",
    partner_id: input.partner_id,
    code: input.code,
    region_code: input.region_code ?? null,
    campaign_code: input.campaign_code ?? null,
    status: "active",
    scan_count: 0,
    submitted_count: 0,
    approved_count: 0,
    expires_at: input.expires_at ?? null,
    created_by_employee_id: input.created_by_employee_id,
    created_at: "2026-07-07T00:00:00.000Z",
    updated_at: "2026-07-07T00:00:00.000Z",
  };
}

export async function withPhoneLoginWithoutCodeFlag<T>(
  value: string | undefined,
  callback: () => Promise<T>,
) {
  const previousFlag = process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE;
  if (value === undefined) {
    delete process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE;
  } else {
    process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE = value;
  }

  try {
    return await callback();
  } finally {
    if (previousFlag === undefined) {
      delete process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE;
    } else {
      process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE = previousFlag;
    }
  }
}
