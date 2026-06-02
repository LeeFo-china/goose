import {
  Errors,
  SupabaseDB,
  isPhoneLoginWithoutCodeEnabled,
  type SmsScene,
  type SmsVerificationCodeRow,
} from "./shared";

async function getValidVerificationCode(phone: string, scene: SmsScene, code: string) {
  const now = new Date().toISOString();
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("sms_verification_codes")
    .select("id, phone, scene, code, status, expired_at")
    .eq("phone", phone)
    .eq("scene", scene)
    .eq("code", code)
    .eq("status", "pending")
    .gt("expired_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<SmsVerificationCodeRow>();

  if (error) {
    throw Errors.dbError("查询验证码失败", error);
  }

  return data || null;
}

export async function markVerificationCodeVerified(id: string) {
  const { error } = await SupabaseDB.getAdminClient()
    .from("sms_verification_codes")
    .update({
      status: "verified",
      verified_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");

  if (error) {
    throw Errors.dbError("更新验证码状态失败", error);
  }
}

export async function verifyRebindCode(phone: string, code?: string | null) {
  if (isPhoneLoginWithoutCodeEnabled()) {
    return null;
  }

  const normalizedCode = code?.trim() || "";
  if (!normalizedCode) {
    throw Errors.badRequest("请输入验证码");
  }

  const record = await getValidVerificationCode(
    phone,
    "rebind_wechat",
    normalizedCode,
  );
  if (!record) {
    throw Errors.badRequest("验证码错误或已过期");
  }

  return record;
}
