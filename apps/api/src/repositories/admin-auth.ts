import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { SupabaseDB } from "@/utils/supabase";
import type { SmsScene, SmsVerificationStatus } from "@gooes/domain";

export type AdminAuthEmployeeRecord = {
  id: string;
  user_id: string | null;
  tenant_id: string | null;
  status: string | null;
  tenant_department_id: string | null;
  post_id: string | null;
  name: string | null;
  phone: string | null;
  avatar: string | null;
  tenant:
    | { id: string | null; name: string | null; slug: string | null; status: string | null }
    | Array<{ id: string | null; name: string | null; slug: string | null; status: string | null }>
    | null;
  tenant_department:
    | { id: string | null; alias_name: string | null; code: string | null }
    | Array<{ id: string | null; alias_name: string | null; code: string | null }>
    | null;
  post:
    | { name: string | null }
    | Array<{ name: string | null }>
    | null;
};

export type AdminAuthVerificationCodeRecord = {
  id: string;
  phone: string;
  scene: SmsScene;
  code: string;
  status: SmsVerificationStatus;
  expired_at: string;
  verified_at: string | null;
  created_at: string;
  request_ip: string | null;
};

type AuthUserRecord = {
  id: string;
  email?: string | null;
};

class AdminAuthRepository {
  private adminClient = SupabaseDB.getAdminClient();

  async findEmployeeByPhone(phone: string) {
    const { data, error } = await this.adminClient
      .from("employees")
      .select(`
        id,
        user_id,
        tenant_id,
        status,
        tenant_department_id,
        post_id,
        name,
        phone,
        avatar,
        tenant:tenants!employees_tenant_id_fkey(id, name, slug, status),
        tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code),
        post:posts!employees_post_id_fkey(name)
      `)
      .eq("phone", phone);

    if (error) {
      throw Errors.dbError("查询员工身份失败", error);
    }

    return (data || []) as AdminAuthEmployeeRecord[];
  }

  async findRecentVerificationCode(input: {
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

    return data as { id: string; created_at: string } | null;
  }

  async createVerificationCode(input: {
    phone: string;
    scene: SmsScene;
    code: string;
    expired_at: string;
    request_ip?: string | null;
  }) {
    const { error } = await this.adminClient
      .from("sms_verification_codes")
      .insert({
        phone: input.phone,
        scene: input.scene,
        code: input.code,
        status: "pending",
        expired_at: input.expired_at,
        request_ip: input.request_ip || null,
      })
      .select("id");

    if (error) {
      throw Errors.dbError("保存验证码失败", error);
    }
  }

  async deletePendingVerificationCode(input: {
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

  async findValidVerificationCode(input: {
    phone: string;
    scene: SmsScene;
    code: string;
    now: string;
  }) {
    const { data, error } = await this.adminClient
      .from("sms_verification_codes")
      .select("id, phone, scene, code, status, expired_at, verified_at, created_at, request_ip")
      .eq("phone", input.phone)
      .eq("scene", input.scene)
      .eq("code", input.code)
      .eq("status", "pending")
      .gt("expired_at", input.now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<AdminAuthVerificationCodeRecord>();

    if (error) {
      throw Errors.dbError("查询验证码失败", error);
    }

    return data;
  }

  async markVerificationCodeVerified(id: string) {
    const { data, error } = await this.adminClient
      .from("sms_verification_codes")
      .update({
        status: "verified",
        verified_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新验证码状态失败", error);
    }

    if (!data) {
      throw Errors.business(
        400,
        "验证码错误或已过期",
        ErrorCodes.ADMIN_AUTH_CODE_INVALID,
      );
    }
  }

  async findAdminAuthUserByEmail(email: string) {
    const { data, error } = await (this.adminClient as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    }).rpc("find_auth_user_by_email", {
      p_email: email,
    });

    if (error) {
      throw Errors.dbError("查询后台登录用户失败", error);
    }

    const rows = Array.isArray(data) ? (data as AuthUserRecord[]) : [];
    return rows[0] || null;
  }

  async createAdminAuthUser(input: {
    employeeId: string;
    phone: string;
    name?: string | null;
  }) {
    const email = `admin.${input.employeeId}@gooes.local`;
    const { data, error } = await this.adminClient.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
      phone: input.phone,
      phone_confirm: true,
      user_metadata: {
        employee_id: input.employeeId,
        name: input.name || null,
        source: "admin_web",
      },
    });

    if (!error && data.user) {
      return data.user.id;
    }

    const existing = await this.findAdminAuthUserByEmail(email);
    if (existing?.id) {
      return existing.id;
    }

    throw Errors.business(
      500,
      "创建后台登录用户失败",
      ErrorCodes.ADMIN_AUTH_USER_CREATE_FAILED,
      error ? { message: error.message, status: error.status, name: error.name } : undefined,
    );
  }

  async bindEmployeeAuthUser(input: {
    employeeId: string;
    authUserId: string;
  }) {
    const { error: cleanupError } = await this.adminClient
      .from("employees")
      .update({ user_id: null })
      .eq("user_id", input.authUserId)
      .neq("id", input.employeeId)
      .select("id");

    if (cleanupError) {
      throw Errors.dbError("清理历史员工绑定失败", cleanupError);
    }

    const { error } = await this.adminClient
      .from("employees")
      .update({ user_id: input.authUserId })
      .eq("id", input.employeeId)
      .select("id");

    if (error) {
      throw Errors.dbError("绑定员工后台账号失败", error);
    }
  }
}

export const adminAuthRepository = new AdminAuthRepository();
