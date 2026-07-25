import { AppError } from "@/errors/app-error";
import {
  type WechatPayApplymentEventInsert,
  type WechatPayApplymentRecord,
} from "@/repositories/wechat-pay-applyments";
import { isWechatApplymentNotFound } from "@/services/wechat-pay-applyment-submission-support";
import type { WechatPayApplymentStatusRepositoryPort } from "@/services/wechat-pay-applyments-types";

type RecoverMissingOfficialApplymentInput = {
  current: WechatPayApplymentRecord;
  employeeId: string;
  error: unknown;
  now: string;
  repository: WechatPayApplymentStatusRepositoryPort;
};

export function isRecoverableMissingOfficialApplyment(
  applyment: WechatPayApplymentRecord,
  error: unknown,
) {
  return applyment.status === "applying" &&
    !hasText(applyment.applyment_id) &&
    isWechatApplymentNotFound(error);
}

export async function recoverMissingOfficialApplyment(
  input: RecoverMissingOfficialApplymentInput,
) {
  const details = safeWechatErrorDetails(input.error);
  const requestId = hasText(details.requestId) ? details.requestId : null;
  const updated = await input.repository.updateApplyment({
    id: input.current.id,
    expectedStatus: input.current.status,
    expectedUpdatedAt: input.current.updated_at,
    patch: {
      status: "approved",
      submission_claimed_at: null,
      last_wechat_request_id: requestId,
      last_wechat_synced_at: input.now,
      updated_by_employee_id: input.employeeId,
    },
  });
  await input.repository.insertEvent({
    tenant_id: updated.tenant_id,
    applyment_id: updated.id,
    event_type: "wechat_applyment_missing_recovered",
    from_status: input.current.status,
    to_status: "approved",
    message: "微信侧未找到申请单，已恢复为可重新提交",
    operator_employee_id: input.employeeId,
    metadata: {
      business_code: input.current.applyment_business_code,
      ...(requestId ? { request_id: requestId } : {}),
      ...(hasText(details.wechatCode) ? { wechat_code: details.wechatCode } : {}),
      ...(hasText(details.wechatMessage) ? { wechat_message: details.wechatMessage } : {}),
    } as WechatPayApplymentEventInsert["metadata"],
  });
  return updated;
}

function safeWechatErrorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof AppError)) return {};
  const details = error.details;
  return details && typeof details === "object" && !Array.isArray(details)
    ? details as Record<string, unknown>
    : {};
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
