import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type { SmsScene, SmsVerificationStatus } from "@gooes/domain";

export type SmsVerificationCodeRow = {
  id: string;
  phone: string;
  scene: SmsScene;
  code: string;
  status: SmsVerificationStatus;
  expired_at: string;
  verified_at: string | null;
  created_at: string;
  request_ip: string | null;
  request_device: string | null;
};

class SmsVerificationCodeRepository {
  private adminClient = SupabaseDB.getAdminClient();

  async findRecentByPhoneScene(input: {
    phone: string;
    scene: SmsScene;
    since: string;
  }) {
    const { data, error } = await this.adminClient
      .from("sms_verification_codes")
      .select("id, created_at")
      .eq("phone", input.phone)
      .eq("scene", input.scene)
      .gte("created_at", input.since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询验证码发送记录失败", error);
    }

    return (data || null) as { id: string; created_at: string } | null;
  }

  async countRecentByRequestIpScene(input: {
    requestIp: string;
    scene: SmsScene;
    since: string;
  }) {
    const { count, error } = await this.adminClient
      .from("sms_verification_codes")
      .select("id", { count: "exact", head: true })
      .eq("request_ip", input.requestIp)
      .eq("scene", input.scene)
      .gte("created_at", input.since);

    if (error) {
      throw Errors.dbError("查询验证码 IP 发送记录失败", error);
    }

    return count ?? 0;
  }

  async findRecentByRequestDeviceScene(input: {
    requestDevice: string;
    scene: SmsScene;
    since: string;
  }) {
    const { data, error } = await this.adminClient
      .from("sms_verification_codes")
      .select("id, created_at")
      .eq("request_device", input.requestDevice)
      .eq("scene", input.scene)
      .gte("created_at", input.since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询验证码设备发送记录失败", error);
    }

    return (data || null) as { id: string; created_at: string } | null;
  }

  async createPending(input: {
    phone: string;
    scene: SmsScene;
    code: string;
    expiredAt: string;
    requestIp: string | null;
    requestDevice?: string | null;
  }) {
    const { error } = await this.adminClient.from("sms_verification_codes").insert({
      phone: input.phone,
      scene: input.scene,
      code: input.code,
      status: "pending",
      expired_at: input.expiredAt,
      request_ip: input.requestIp,
      request_device: input.requestDevice ?? null,
    }).select("id");

    if (error) {
      throw Errors.dbError("保存验证码失败", error);
    }
  }

  async deletePendingByPhoneSceneCode(input: {
    phone: string;
    scene: SmsScene;
    code: string;
  }) {
    const { error } = await this.adminClient
      .from("sms_verification_codes")
      .delete()
      .eq("phone", input.phone)
      .eq("scene", input.scene)
      .eq("code", input.code)
      .eq("status", "pending")
      .select("id");

    if (error) {
      throw Errors.dbError("清理验证码失败", error);
    }
  }

  async findValidPending(input: {
    phone: string;
    scene: SmsScene;
    code: string;
    now: string;
  }) {
    const { data, error } = await this.adminClient
      .from("sms_verification_codes")
      .select("id, phone, scene, code, status, expired_at, verified_at, created_at, request_ip, request_device")
      .eq("phone", input.phone)
      .eq("scene", input.scene)
      .eq("code", input.code)
      .eq("status", "pending")
      .gt("expired_at", input.now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询验证码失败", error);
    }

    return (data || null) as SmsVerificationCodeRow | null;
  }

  async markVerified(id: string) {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await this.adminClient
        .from("sms_verification_codes")
        .update({
          status: "verified",
          verified_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (!error && data) {
        return;
      }

      if (!error && !data) {
        throw Errors.business(400, "验证码错误或已过期", "SMS_CODE_INVALID");
      }

      lastError = error;
      if (!this.isRetryableSupabaseError(error) || attempt === 2) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }

    throw Errors.dbError("更新验证码状态失败", lastError);
  }

  private isRetryableSupabaseError(error: unknown) {
    if (!error || typeof error !== "object") {
      return false;
    }

    const message = "message" in error && typeof error.message === "string"
      ? error.message
      : "";

    return (
      message.includes("TimeoutError") ||
      message.includes("timed out") ||
      message.includes("fetch failed") ||
      message.includes("network")
    );
  }
}

export const smsVerificationCodeRepository = new SmsVerificationCodeRepository();
