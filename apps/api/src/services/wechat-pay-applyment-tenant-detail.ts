import type { WechatPayApplymentRecord } from "@/repositories/wechat-pay-applyments";
import {
  loadApplymentSensitiveDraftPayload,
  type ApplymentSensitivePayloadRepositoryPort,
} from "@/services/wechat-pay-applyment-content-validation";
import { sanitizeApplymentRecord } from "@/services/wechat-pay-applyment-draft";
import type {
  ApplymentDetailResult,
  WechatPayApplymentRepositoryPort,
  WechatPayApplymentTenantReviewReadinessPort,
} from "@/services/wechat-pay-applyments-types";

type TenantApplymentDetailInput = {
  applyment: WechatPayApplymentRecord | null;
  canEdit: boolean;
  repository:
    & Pick<WechatPayApplymentRepositoryPort, "findEvents">
    & ApplymentSensitivePayloadRepositoryPort;
  encryptionRootSecret: string | null | undefined;
  tenantReadinessService: WechatPayApplymentTenantReviewReadinessPort;
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
    input.tenantReadinessService.runForApplyment(applyment),
  ]);
  return {
    applyment: sanitizeApplymentRecord(
      await hydrateTenantSensitiveReviewFields({ ...input, applyment }),
    ),
    events,
    can_edit: input.canEdit,
    can_submit: input.canEdit && submissionReadiness.review_ready,
    available_actions: [],
    submission_readiness: submissionReadiness,
  };
}

async function hydrateTenantSensitiveReviewFields(
  input: TenantApplymentDetailInput & {
    applyment: WechatPayApplymentRecord;
  },
): Promise<WechatPayApplymentRecord> {
  if (!input.canEdit || !input.applyment.has_sensitive_payload) {
    return input.applyment;
  }
  const sensitive = await loadApplymentSensitiveDraftPayload({
    applyment: input.applyment,
    repository: input.repository,
    rootSecret: input.encryptionRootSecret,
  });
  return {
    ...input.applyment,
    identity_name: sensitive.identity_name ?? null,
    identity_number: sensitive.identity_number ?? null,
    identity_address: sensitive.identity_address ?? null,
    contact_identity_number: sensitive.contact_identity_number ?? null,
    contact_identity_address: sensitive.contact_identity_address ?? null,
    settlement_account_number: sensitive.bank_account_number ?? null,
  };
}
