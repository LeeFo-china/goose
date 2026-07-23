import type { WechatPayApplymentRecord } from "@/repositories/wechat-pay-applyments";
import { sanitizeApplymentRecord } from "@/services/wechat-pay-applyment-draft";
import { loadWechatPayApplymentSubmissionReadiness } from "@/services/wechat-pay-applyment-platform-readiness";
import type {
  ApplymentDetailResult,
  WechatPayApplymentPreflightPort,
  WechatPayApplymentRepositoryPort,
} from "@/services/wechat-pay-applyments-types";

type TenantApplymentDetailInput = {
  applyment: WechatPayApplymentRecord | null;
  canEdit: boolean;
  repository: Pick<WechatPayApplymentRepositoryPort, "findEvents">;
  preflightService: WechatPayApplymentPreflightPort;
};

export async function buildTenantApplymentDetail(
  input: TenantApplymentDetailInput,
): Promise<ApplymentDetailResult> {
  if (!input.applyment) {
    return {
      applyment: null,
      events: [],
      can_edit: input.canEdit,
      can_submit: false,
      available_actions: [],
    };
  }

  const applyment = input.applyment;
  const [events, submissionReadiness] = await Promise.all([
    input.repository.findEvents({
      tenantId: applyment.tenant_id,
      applymentId: applyment.id,
    }),
    loadWechatPayApplymentSubmissionReadiness(
      input.preflightService,
      applyment,
    ),
  ]);
  return {
    applyment: sanitizeApplymentRecord(applyment),
    events,
    can_edit: input.canEdit,
    can_submit: input.canEdit && submissionReadiness.review_ready,
    available_actions: [],
    submission_readiness: submissionReadiness,
  };
}
