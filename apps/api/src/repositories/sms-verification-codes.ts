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

export type SmsRateLimitDimension =
  | "phone"
  | "request_ip"
  | "request_device";

export type SmsReservationResult =
  | { reserved: true; id: string; limitedDimension: null }
  | { reserved: false; id: null; limitedDimension: SmsRateLimitDimension };

type UntypedRpcClient = {
  rpc: (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class SmsVerificationCodeRepository {
  private adminClient = SupabaseDB.getAdminClient();
  private rpcClient: UntypedRpcClient;

  constructor(
    rpcClient = SupabaseDB.getAdminClient() as unknown as UntypedRpcClient,
  ) {
    this.rpcClient = rpcClient;
  }

  async reservePending(input: {
    phone: string;
    scene: SmsScene;
    code: string;
    expiredAt: string;
    since: string;
    requestIp: string | null;
    requestDevice?: string | null;
    requestIpLimit: number;
  }): Promise<SmsReservationResult> {
    const { data, error } = await this.rpcClient.rpc(
      "reserve_sms_verification_code",
      {
        p_phone: input.phone,
        p_scene: input.scene,
        p_code: input.code,
        p_expired_at: input.expiredAt,
        p_since: input.since,
        p_request_ip: input.requestIp,
        p_request_device: input.requestDevice ?? null,
        p_request_ip_limit: input.requestIpLimit,
      },
    );

    if (error) {
      throw Errors.dbError("预留验证码失败", error);
    }

    return this.parseReservationResult(data);
  }

  private parseReservationResult(data: unknown): SmsReservationResult {
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!row || typeof row !== "object") {
      throw this.invalidReservationResult();
    }

    const record = row as Record<string, unknown>;
    const reserved = record.reserved;
    const id = record.reservation_id;
    const limitedDimension = record.limited_dimension;
    if (
      reserved === true &&
      typeof id === "string" &&
      UUID_PATTERN.test(id) &&
      limitedDimension === null
    ) {
      return { reserved: true, id, limitedDimension: null };
    }
    if (
      reserved === false &&
      id === null &&
      isSmsRateLimitDimension(limitedDimension)
    ) {
      return {
        reserved: false,
        id: null,
        limitedDimension,
      };
    }

    throw this.invalidReservationResult();
  }

  private invalidReservationResult() {
    return Errors.dbError("预留验证码失败", {
      message: "reserve_sms_verification_code returned an invalid result",
    });
  }

  async deletePendingById(reservationId: string) {
    const { error } = await this.adminClient
      .from("sms_verification_codes")
      .delete()
      .eq("id", reservationId)
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

function isSmsRateLimitDimension(
  value: unknown,
): value is SmsRateLimitDimension {
  return (
    value === "phone" ||
    value === "request_ip" ||
    value === "request_device"
  );
}
