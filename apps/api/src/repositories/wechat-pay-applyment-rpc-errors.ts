import { Errors } from "@/errors/error-factory";

type RpcError = { message?: string | null };

export function throwTenantApplymentDraftUpdateError(error: RpcError): never {
  const message = error.message ?? "";
  if (message.includes("WECHAT_PAY_APPLYMENT_NOT_FOUND")) {
    throw Errors.business(
      404,
      "微信支付开通申请不存在",
      "WECHAT_PAY_APPLYMENT_NOT_FOUND",
    );
  }
  if (message.includes("WECHAT_PAY_APPLYMENT_NOT_EDITABLE")) {
    throw Errors.business(
      409,
      "当前申请状态不能由租户修改",
      "WECHAT_PAY_APPLYMENT_NOT_EDITABLE",
    );
  }
  if (message.includes("WECHAT_PAY_APPLYMENT_DRAFT_UPDATE_INVALID")) {
    throw Errors.business(
      400,
      "微信支付开通申请草稿版本参数无效",
      "WECHAT_PAY_APPLYMENT_DRAFT_UPDATE_INVALID",
    );
  }
  throw Errors.dbError("更新微信支付开通申请草稿失败", error);
}

export function throwApplymentClaimError(error: RpcError): never {
  const message = error.message ?? "";
  if (message.includes("WECHAT_PAY_APPLYMENT_NOT_FOUND")) {
    throw Errors.business(
      404,
      "微信支付开通申请不存在",
      "WECHAT_PAY_APPLYMENT_NOT_FOUND",
    );
  }
  if (message.includes("WECHAT_PAY_APPLYMENT_SUBMISSION_IN_PROGRESS")) {
    throw Errors.business(
      409,
      "微信支付正式进件正在提交，请稍后重试",
      "WECHAT_PAY_APPLYMENT_SUBMISSION_IN_PROGRESS",
    );
  }
  if (message.includes("WECHAT_PAY_APPLYMENT_SUBMISSION_STATE_INVALID")) {
    throw Errors.business(
      409,
      "当前申请状态不能提交微信支付正式进件",
      "WECHAT_PAY_APPLYMENT_SUBMISSION_STATE_INVALID",
    );
  }
  if (message.includes("WECHAT_PAY_APPLYMENT_SUBMISSION_CLAIM_INVALID")) {
    throw Errors.business(
      400,
      "微信支付正式进件认领参数无效",
      "WECHAT_PAY_APPLYMENT_SUBMISSION_CLAIM_INVALID",
    );
  }
  throw Errors.dbError("认领微信支付正式进件任务失败", error);
}

export function throwApplymentActivationError(error: RpcError): never {
  const message = error.message ?? "";
  if (message.includes("WECHAT_PAY_APPLYMENT_NOT_FOUND")) {
    throw Errors.business(
      404,
      "微信支付开通申请不存在",
      "WECHAT_PAY_APPLYMENT_NOT_FOUND",
    );
  }
  if (message.includes("WECHAT_PAY_APPLYMENT_STATE_CHANGED")) {
    throw Errors.business(
      409,
      "微信支付开通申请状态已变化，请刷新后重试",
      "WECHAT_PAY_APPLYMENT_STATE_CHANGED",
    );
  }
  if (message.includes("WECHAT_PAY_APPLYMENT_NOT_ACTIVATABLE")) {
    throw Errors.business(
      409,
      "租户微信支付进件未开通或 AppID 未绑定",
      "WECHAT_PAY_APPLYMENT_NOT_ACTIVATABLE",
    );
  }
  if (message.includes("PLATFORM_PAYMENT_PROFILE_NOT_READY")) {
    throw Errors.business(
      409,
      "平台服务商支付配置尚未就绪",
      "PLATFORM_PAYMENT_PROFILE_NOT_READY",
    );
  }
  if (message.includes("WECHAT_PAY_APPLYMENT_ACTIVATION_INVALID")) {
    throw Errors.business(
      400,
      "微信支付配置激活参数无效",
      "WECHAT_PAY_APPLYMENT_ACTIVATION_INVALID",
    );
  }
  throw Errors.dbError("激活租户微信支付配置失败", error);
}

export function throwTenantApplymentSubmitError(error: RpcError): never {
  const message = error.message ?? "";
  if (message.includes("WECHAT_PAY_APPLYMENT_NOT_FOUND")) {
    throw Errors.business(
      404,
      "微信支付开通申请不存在",
      "WECHAT_PAY_APPLYMENT_NOT_FOUND",
    );
  }
  if (message.includes("WECHAT_PAY_APPLYMENT_IDEMPOTENCY_MISMATCH")) {
    throw Errors.business(
      409,
      "提交幂等键与申请不匹配",
      "WECHAT_PAY_APPLYMENT_IDEMPOTENCY_MISMATCH",
    );
  }
  if (message.includes("WECHAT_PAY_APPLYMENT_NOT_EDITABLE")) {
    throw Errors.business(
      409,
      "当前申请状态不能由租户提交",
      "WECHAT_PAY_APPLYMENT_NOT_EDITABLE",
    );
  }
  if (message.includes("WECHAT_PAY_APPLYMENT_STATE_CHANGED")) {
    throw Errors.business(
      409,
      "微信支付开通申请状态已变化，请刷新后重试",
      "WECHAT_PAY_APPLYMENT_STATE_CHANGED",
    );
  }
  if (message.includes("WECHAT_PAY_APPLYMENT_TENANT_SUBMIT_INVALID")) {
    throw Errors.business(
      400,
      "微信支付开通申请提交参数无效",
      "WECHAT_PAY_APPLYMENT_TENANT_SUBMIT_INVALID",
    );
  }
  throw Errors.dbError("提交微信支付开通申请失败", error);
}
