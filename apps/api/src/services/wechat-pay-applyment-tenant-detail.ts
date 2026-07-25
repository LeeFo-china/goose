import type { WechatPayApplymentRecord } from "@/repositories/wechat-pay-applyments";
import {
  loadApplymentSensitiveDraftPayload,
  type ApplymentSensitivePayloadRepositoryPort,
} from "@/services/wechat-pay-applyment-content-validation";
import { sanitizeApplymentRecord } from "@/services/wechat-pay-applyment-draft";
import type {
  ApplymentDetailResult,
  WechatPayApplymentAvailableAction,
  WechatPayApplymentRepositoryPort,
  WechatPayApplymentTenantReviewReadinessPort,
} from "@/services/wechat-pay-applyments-types";
import type {
  WechatPaySettlementRuleListResult,
} from "@/services/wechat-pay-settlement-rules";

type TenantApplymentDetailInput = {
  applyment: WechatPayApplymentRecord | null;
  canEdit: boolean;
  repository:
    & Pick<WechatPayApplymentRepositoryPort, "findEvents">
    & ApplymentSensitivePayloadRepositoryPort;
  encryptionRootSecret: string | null | undefined;
  tenantReadinessService: WechatPayApplymentTenantReviewReadinessPort;
  settlementRules?: WechatPaySettlementRuleListResult;
};

const EMPTY_SETTLEMENT_RULES: WechatPaySettlementRuleListResult = {
  list: [],
  pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
};

const TENANT_SIGN_URL_RAW_STATES = new Set([
  "APPLYMENT_STATE_AUDITING",
  "APPLYMENT_STATE_REJECTED",
  "APPLYMENT_STATE_TO_BE_CONFIRMED",
  "APPLYMENT_STATE_TO_BE_SIGNED",
]);

export async function buildTenantApplymentDetail(
  input: TenantApplymentDetailInput,
): Promise<ApplymentDetailResult> {
  const settlementRules = input.settlementRules ?? EMPTY_SETTLEMENT_RULES;
  if (!input.applyment) {
    return {
      applyment: null,
      events: [],
      can_edit: input.canEdit,
      can_submit: false,
      available_actions: [],
      settlement_rules: settlementRules,
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
    available_actions: getTenantWechatPayApplymentAvailableActions(applyment),
    submission_readiness: submissionReadiness,
    settlement_rules: settlementRules,
  };
}

function getTenantWechatPayApplymentAvailableActions(
  applyment: WechatPayApplymentRecord,
): WechatPayApplymentAvailableAction[] {
  if (!canOpenTenantSignUrl(applyment)) return [];
  return [{
    key: "open_sign_url",
    label: "打开签约链接",
    url: applyment.sign_url ?? undefined,
  }];
}

function canOpenTenantSignUrl(applyment: WechatPayApplymentRecord) {
  return hasText(applyment.sign_url) &&
    TENANT_SIGN_URL_RAW_STATES.has(applyment.wechat_applyment_state_raw ?? "");
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
