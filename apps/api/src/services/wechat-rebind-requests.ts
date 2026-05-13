import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  wechatRebindRequestRepository,
  type WechatRebindRequestRecord,
  type WechatTargetIdentityRecord,
} from "@/repositories/wechat-rebind-requests";
import type {
  ReviewWechatRebindRequestInput,
  WechatRebindRequestInput,
  WechatRebindRequestListQuery,
} from "@/schema/wechat";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { authorizationService } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { SupabaseDB } from "@/utils/supabase";
import { isPhoneLoginWithoutCodeEnabled } from "@/utils/auth/test-login";
import { isEmployeeOperableStatus, type SmsScene, type SmsVerificationStatus } from "@gooes/domain";

type SmsVerificationCodeRow = {
  id: string;
  phone: string;
  scene: SmsScene;
  code: string;
  status: SmsVerificationStatus;
  expired_at: string;
};

type JwtUserLike = {
  sub?: string | null;
  tenant_id?: string | null;
  customer_id?: string | null;
  employee_id?: string | null;
};

function maskPhone(phone: string) {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

function normalizeNullableText(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function buildAlreadyBoundError(targetRole: "customer" | "employee", target?: {
  tenant_id?: string | null;
  id?: string | null;
}) {
  return Errors.business(
    409,
    "该手机号已绑定其他微信账号，可提交换绑申请",
    ErrorCodes.WECHAT_ALREADY_BOUND,
    {
      can_request_rebind: true,
      target_role: targetRole,
      tenant_id: target?.tenant_id ?? null,
      customer_id: targetRole === "customer" ? target?.id ?? null : null,
      employee_id: targetRole === "employee" ? target?.id ?? null : null,
    },
  );
}

class WechatRebindRequestService {
  private async getValidVerificationCode(phone: string, scene: SmsScene, code: string) {
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

  private async markVerificationCodeVerified(id: string) {
    const { error } = await SupabaseDB.getAdminClient()
      .from("sms_verification_codes")
      .update({
        status: "verified",
        verified_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      throw Errors.dbError("更新验证码状态失败", error);
    }
  }

  private async verifyRebindCode(phone: string, code?: string | null) {
    if (isPhoneLoginWithoutCodeEnabled()) {
      return null;
    }

    const normalizedCode = code?.trim() || "";
    if (!normalizedCode) {
      throw Errors.badRequest("请输入验证码");
    }

    const record = await this.getValidVerificationCode(
      phone,
      "rebind_wechat",
      normalizedCode,
    );
    if (!record) {
      throw Errors.badRequest("验证码错误或已过期");
    }

    return record;
  }

  private assertTargetMatchesPhone(
    target: WechatTargetIdentityRecord | null,
    phone: string,
    targetRole: "customer" | "employee",
  ) {
    if (!target) {
      throw Errors.badRequest(targetRole === "customer"
        ? "客户档案不存在"
        : "员工档案不存在");
    }

    if (target.phone !== phone) {
      throw Errors.badRequest("手机号与目标身份不匹配");
    }
  }

  private assertTargetCanRequestRebind(
    target: WechatTargetIdentityRecord,
    authUserId: string,
    targetRole: "customer" | "employee",
  ) {
    if (!target.user_id) {
      throw Errors.badRequest("目标身份尚未绑定微信，无需提交换绑申请");
    }

    if (target.user_id === authUserId) {
      throw Errors.badRequest("目标身份已绑定当前微信，无需重复申请");
    }

    if (targetRole === "employee" && !isEmployeeOperableStatus(target.status)) {
      throw Errors.badRequest("目标员工账号已停用，无法申请换绑");
    }
  }

  private serializeRequest(record: WechatRebindRequestRecord) {
    return {
      id: record.id,
      tenant_id: record.tenant_id,
      target_role: record.target_role,
      target_customer_id: record.target_customer_id,
      target_employee_id: record.target_employee_id,
      phone_masked: maskPhone(record.phone),
      applicant_name: record.applicant_name,
      project_hint: record.project_hint,
      community_hint: record.community_hint,
      remark: record.remark,
      status: record.status,
      reviewer_employee_id: record.reviewer_employee_id,
      review_comment: record.review_comment,
      reviewed_at: record.reviewed_at,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }

  async assertCustomerCanBind(authUserId: string, target: {
    id?: string | null;
    tenant_id?: string | null;
    user_id?: string | null;
  }) {
    if (target.user_id && target.user_id !== authUserId) {
      throw buildAlreadyBoundError("customer", target);
    }
  }

  async assertEmployeeCanBind(authUserId: string, target: {
    id?: string | null;
    tenant_id?: string | null;
    user_id?: string | null;
  }) {
    if (target.user_id && target.user_id !== authUserId) {
      throw buildAlreadyBoundError("employee", target);
    }
  }

  async unbindCustomer(user: JwtUserLike) {
    if (!user.sub) {
      throw Errors.unauthorized("请先登录", ErrorCodes.UNAUTHORIZED);
    }

    if (!user.customer_id || !user.tenant_id) {
      throw Errors.business(
        403,
        "当前客户身份无效",
        ErrorCodes.CUSTOMER_CONTEXT_MISSING,
      );
    }

    const customer = await wechatRebindRequestRepository.unbindCustomer({
      customerId: user.customer_id,
      tenantId: user.tenant_id,
      authUserId: user.sub,
    });

    if (!customer) {
      throw Errors.business(
        409,
        "当前微信绑定关系已变化，请重新登录",
        ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
      );
    }

    authorizationService.invalidateAuthContext({ authUserId: user.sub });
    return { success: true, message: "微信绑定已解除" };
  }

  async unbindEmployee(user: JwtUserLike) {
    if (!user.sub) {
      throw Errors.unauthorized("请先登录", ErrorCodes.UNAUTHORIZED);
    }

    if (!user.employee_id || !user.tenant_id) {
      throw Errors.business(
        403,
        "当前员工身份无效",
        ErrorCodes.EMPLOYEE_CONTEXT_MISSING,
      );
    }

    const employee = await wechatRebindRequestRepository.unbindEmployee({
      employeeId: user.employee_id,
      tenantId: user.tenant_id,
      authUserId: user.sub,
    });

    if (!employee) {
      throw Errors.business(
        409,
        "当前微信绑定关系已变化，请重新登录",
        ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
      );
    }

    authorizationService.invalidateAuthContext({
      authUserId: user.sub,
      employeeId: user.employee_id,
    });
    return { success: true, message: "微信绑定已解除" };
  }

  async create(authUserId: string | null | undefined, input: WechatRebindRequestInput) {
    if (!authUserId) {
      throw Errors.unauthorized("请先登录", ErrorCodes.UNAUTHORIZED);
    }

    const verification = await this.verifyRebindCode(input.phone, input.code);
    const target = input.target_role === "customer"
      ? await wechatRebindRequestRepository.findCustomer(input.customer_id!, input.tenant_id)
      : await wechatRebindRequestRepository.findEmployee(input.employee_id!, input.tenant_id);

    this.assertTargetMatchesPhone(target, input.phone, input.target_role);
    this.assertTargetCanRequestRebind(target!, authUserId, input.target_role);

    const duplicate = await wechatRebindRequestRepository.findPendingDuplicate({
      phone: input.phone,
      targetRole: input.target_role,
      targetCustomerId: input.customer_id ?? null,
      targetEmployeeId: input.employee_id ?? null,
    });
    if (duplicate) {
      throw Errors.badRequest("该手机号已有待审核换绑申请，请勿重复提交");
    }

    const record = await wechatRebindRequestRepository.create({
      tenantId: input.tenant_id,
      targetRole: input.target_role,
      targetCustomerId: input.target_role === "customer" ? input.customer_id : null,
      targetEmployeeId: input.target_role === "employee" ? input.employee_id : null,
      phone: input.phone,
      oldAuthUserId: target!.user_id!,
      newAuthUserId: authUserId,
      applicantName: normalizeNullableText(input.applicant_name),
      projectHint: normalizeNullableText(input.project_hint),
      communityHint: normalizeNullableText(input.community_hint),
      remark: normalizeNullableText(input.remark),
    });

    if (verification) {
      await this.markVerificationCodeVerified(verification.id);
    }

    return {
      id: record.id,
      status: record.status,
      message: "换绑申请已提交，请等待工作人员审核",
    };
  }

  async list(authContext: AuthContext, query: WechatRebindRequestListQuery) {
    accessPolicyService.assertPermission(authContext, "customer.update");
    const tenantId = accessPolicyService.assertTenantContext(authContext);

    const data = await wechatRebindRequestRepository.list({
      tenantId,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      list: data.list.map((item) => this.serializeRequest(item)),
      pagination: data.pagination,
    };
  }

  private async getReviewTarget(record: WechatRebindRequestRecord) {
    if (!record.tenant_id) {
      throw Errors.badRequest("换绑申请缺少租户上下文");
    }

    return record.target_role === "customer"
      ? await wechatRebindRequestRepository.findCustomer(
        record.target_customer_id!,
        record.tenant_id,
      )
      : await wechatRebindRequestRepository.findEmployee(
        record.target_employee_id!,
        record.tenant_id,
      );
  }

  private assertReviewerCanReview(authContext: AuthContext, record: WechatRebindRequestRecord) {
    accessPolicyService.assertPermission(authContext, "customer.update");
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    if (record.tenant_id !== tenantId) {
      throw Errors.forbidden();
    }
  }

  async approve(
    authContext: AuthContext,
    id: string,
    input: ReviewWechatRebindRequestInput,
  ) {
    const record = await wechatRebindRequestRepository.findById(id);
    if (!record) {
      throw Errors.notFound("换绑申请不存在");
    }
    this.assertReviewerCanReview(authContext, record);
    if (record.status !== "pending") {
      throw Errors.badRequest("换绑申请已处理");
    }

    const target = await this.getReviewTarget(record);
    this.assertTargetMatchesPhone(target, record.phone, record.target_role);

    if (target?.user_id !== record.old_auth_user_id) {
      throw Errors.badRequest("目标身份绑定关系已变化，无法完成换绑");
    }

    if (record.target_role === "employee" && !isEmployeeOperableStatus(target?.status)) {
      throw Errors.badRequest("目标员工账号已停用，无法换绑");
    }

    const updatedTarget = record.target_role === "customer"
      ? await wechatRebindRequestRepository.updateCustomerUserId({
        customerId: record.target_customer_id!,
        tenantId: record.tenant_id!,
        phone: record.phone,
        oldAuthUserId: record.old_auth_user_id!,
        authUserId: record.new_auth_user_id,
      })
      : await wechatRebindRequestRepository.updateEmployeeUserId({
        employeeId: record.target_employee_id!,
        tenantId: record.tenant_id!,
        phone: record.phone,
        oldAuthUserId: record.old_auth_user_id!,
        authUserId: record.new_auth_user_id,
      });

    if (!updatedTarget) {
      throw Errors.badRequest("目标身份已变化，无法完成换绑");
    }

    const reviewed = await wechatRebindRequestRepository.review({
      id,
      status: "approved",
      reviewerEmployeeId: authContext.employeeId,
      comment: normalizeNullableText(input.comment),
    });
    if (!reviewed) {
      throw Errors.badRequest("换绑申请已处理");
    }

    authorizationService.invalidateAuthContext({ authUserId: record.old_auth_user_id });
    authorizationService.invalidateAuthContext({ authUserId: record.new_auth_user_id });
    await platformAuditLogService.recordBestEffort({
      action: "wechat_rebind_approve",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      targetTenantId: record.tenant_id,
      resourceType: "wechat_rebind_request",
      resourceId: record.id,
      resourceLabel: maskPhone(record.phone),
      summary: "审核通过微信换绑申请",
      metadata: {
        target_role: record.target_role,
        target_customer_id: record.target_customer_id,
        target_employee_id: record.target_employee_id,
      },
    });

    return this.serializeRequest(reviewed);
  }

  async reject(
    authContext: AuthContext,
    id: string,
    input: ReviewWechatRebindRequestInput,
  ) {
    const record = await wechatRebindRequestRepository.findById(id);
    if (!record) {
      throw Errors.notFound("换绑申请不存在");
    }
    this.assertReviewerCanReview(authContext, record);
    if (record.status !== "pending") {
      throw Errors.badRequest("换绑申请已处理");
    }

    const reviewed = await wechatRebindRequestRepository.review({
      id,
      status: "rejected",
      reviewerEmployeeId: authContext.employeeId,
      comment: normalizeNullableText(input.comment),
    });
    if (!reviewed) {
      throw Errors.badRequest("换绑申请已处理");
    }

    await platformAuditLogService.recordBestEffort({
      action: "wechat_rebind_reject",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      targetTenantId: record.tenant_id,
      resourceType: "wechat_rebind_request",
      resourceId: record.id,
      resourceLabel: maskPhone(record.phone),
      summary: "拒绝微信换绑申请",
      metadata: {
        target_role: record.target_role,
        target_customer_id: record.target_customer_id,
        target_employee_id: record.target_employee_id,
      },
    });

    return this.serializeRequest(reviewed);
  }
}

export const wechatRebindRequestService = new WechatRebindRequestService();
