import {
  ErrorCodes,
  Errors,
  isEmployeeOperableStatus,
  userIdentityService,
  type JwtUserLike,
  type WechatTargetIdentityRecord,
} from "./shared";

export function buildAlreadyBoundError(targetRole: "customer" | "employee", target?: {
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

export async function assertCustomerCanBind(authUserId: string, target: {
  id?: string | null;
  tenant_id?: string | null;
  user_id?: string | null;
}) {
  if (target.user_id && target.user_id !== authUserId) {
    throw buildAlreadyBoundError("customer", target);
  }
}

export async function assertEmployeeCanBind(authUserId: string, target: {
  id?: string | null;
  tenant_id?: string | null;
  user_id?: string | null;
}) {
  if (target.user_id && target.user_id !== authUserId) {
    throw buildAlreadyBoundError("employee", target);
  }
}

export function assertTargetMatchesPhone(
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

export function assertTargetCanRequestRebind(
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

export function assertWechatUnbindPrerequisites(user: JwtUserLike) {
  if (!user.openid) {
    throw Errors.business(
      409,
      "当前账号未绑定微信登录凭证",
      ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
    );
  }
}

export function assertHasPhoneRecovery(target: {
  phone?: string | null;
}) {
  if (!target.phone?.trim()) {
    throw Errors.business(
      409,
      "当前账号未绑定手机号，无法解绑唯一微信登录方式",
      ErrorCodes.UNBIND_FORBIDDEN,
    );
  }
}

export async function assertActiveWechatOauth(user: JwtUserLike) {
  if (!user.sub || !user.openid) {
    throw Errors.business(
      409,
      "当前账号未绑定微信登录凭证",
      ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
    );
  }

  const activeOauth = await userIdentityService.findActiveOauthIdentity({
    platform: "wechat_mini",
    openid: user.openid,
  });
  if (!activeOauth || activeOauth.user_id !== user.sub) {
    throw Errors.business(
      409,
      "当前微信绑定关系已变化，请重新登录",
      ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
    );
  }
}

export async function assertBusinessIdentityBelongsToUser(input: {
  userId: string;
  tenantId: string;
  identityType: "customer" | "employee";
  identityId: string;
}) {
  const hasActiveMembership = await userIdentityService.hasActiveBusinessMembership(input);
  if (hasActiveMembership) return;

  throw Errors.business(
    409,
    "当前微信绑定关系已变化，请重新登录",
    ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
  );
}
