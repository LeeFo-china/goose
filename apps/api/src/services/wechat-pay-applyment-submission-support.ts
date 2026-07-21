import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import type { WechatPayApplymentRecord } from "@/repositories/wechat-pay-applyments";
import { WechatPayApplymentAttachmentCategorySchema } from "@/schema/wechat-pay-applyments";
import type {
  WechatPayApplymentGatewayPort,
  WechatPayApplymentGatewayProfile,
  WechatPayApplymentQueryResult,
} from "@/services/wechat-pay-applyment-gateway";
import type { WechatPayApplymentAttachment } from "@/services/wechat-pay-applyment-media";
import type { WechatPayApplymentRequestSource } from "@/services/wechat-pay-applyment-request-builder";
import type { PlatformPaymentConfigRepositoryPort } from "@/services/wechat-pay-applyments-types";
import {
  evaluatePlatformPaymentProfileReadiness,
  PLATFORM_WECHAT_PAY_PROFILE_DEFINITION_BY_CODE,
} from "@/services/platform-payment-readiness";
import { requireMatchingPlatformPaymentSecretBundle } from "@/services/platform-payment-secret-bundle-revision";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";

export type ApplymentRuntimeProfile = {
  appId: string;
  gatewayProfile: WechatPayApplymentGatewayProfile;
};

export type ApplymentSecretBundleServicePort = {
  load: (ref: string | null) => Promise<WechatPaySecretBundle>;
};

export async function loadApplymentRuntimeProfile(input: {
  repository: PlatformPaymentConfigRepositoryPort;
  secretBundleService: ApplymentSecretBundleServicePort;
}): Promise<ApplymentRuntimeProfile> {
  const definition =
    PLATFORM_WECHAT_PAY_PROFILE_DEFINITION_BY_CODE.tenant_service_provider;
  const config = await input.repository.findWechatPayConfigByProfile(
    definition.profile_code,
  );
  const readiness = evaluatePlatformPaymentProfileReadiness(definition, config);
  if (!config || !readiness.ready) {
    throw Errors.business(
      409,
      "平台服务商支付配置尚未就绪",
      "PLATFORM_PAYMENT_PROFILE_NOT_READY",
      {
        profile_code: definition.profile_code,
        blocker_codes: readiness.blockers.map((blocker) => blocker.code),
      },
    );
  }
  const secretBundle = requireMatchingPlatformPaymentSecretBundle(
    config,
    await input.secretBundleService.load(config.encrypted_config_ref),
  );
  if (
    !hasText(config.merchant_id) ||
    !hasText(config.serial_no) ||
    !hasText(config.app_id) ||
    !hasText(secretBundle.wechatPayPublicKeyId) ||
    !hasText(secretBundle.wechatPayPublicKeyPem)
  ) {
    throw Errors.business(
      409,
      "平台服务商进件密钥资料不完整",
      "WECHAT_PAY_APPLYMENT_PROFILE_INCOMPLETE",
    );
  }
  return {
    appId: config.app_id,
    gatewayProfile: {
      merchantId: config.merchant_id,
      serialNo: config.serial_no,
      privateKeyPem: secretBundle.privateKeyPem,
      wechatPayPublicKeyId: secretBundle.wechatPayPublicKeyId,
      wechatPayPublicKeyPem: secretBundle.wechatPayPublicKeyPem,
      baseUrl: secretBundle.baseUrl,
    },
  };
}

export async function submitWechatApplymentWithRecovery(input: {
  gateway: Pick<WechatPayApplymentGatewayPort, "queryByBusinessCode">;
  profile: WechatPayApplymentGatewayProfile;
  businessCode: string;
  submit: () => Promise<string | null>;
}): Promise<{
  result: WechatPayApplymentQueryResult;
  recovered: boolean;
  fallbackRequestId: string | null;
}> {
  let acknowledgementRequestId: string | null = null;
  try {
    acknowledgementRequestId = await input.submit();
  } catch (error) {
    if (!isUncertainApplymentSubmitError(error)) throw error;
    const recovered = await queryWechatApplymentIfExists(input);
    if (recovered) {
      return { result: recovered, recovered: true, fallbackRequestId: null };
    }

    try {
      acknowledgementRequestId = await input.submit();
    } catch (retryError) {
      if (!isUncertainApplymentSubmitError(retryError)) throw retryError;
      const retried = await queryWechatApplymentIfExists(input);
      if (retried) {
        return { result: retried, recovered: true, fallbackRequestId: null };
      }
      throw retryError;
    }
    return querySubmittedApplyment(input, true, acknowledgementRequestId);
  }
  return querySubmittedApplyment(input, false, acknowledgementRequestId);
}

export async function queryWechatApplymentIfExists(input: {
  gateway: Pick<WechatPayApplymentGatewayPort, "queryByBusinessCode">;
  profile: WechatPayApplymentGatewayProfile;
  businessCode: string;
}) {
  try {
    return await input.gateway.queryByBusinessCode({
      profile: input.profile,
      businessCode: input.businessCode,
    });
  } catch (error) {
    if (isWechatApplymentNotFound(error)) return null;
    throw error;
  }
}

async function querySubmittedApplyment(
  input: {
    gateway: Pick<WechatPayApplymentGatewayPort, "queryByBusinessCode">;
    profile: WechatPayApplymentGatewayProfile;
    businessCode: string;
  },
  recovered: boolean,
  fallbackRequestId: string | null,
) {
  return {
    result: await input.gateway.queryByBusinessCode({
      profile: input.profile,
      businessCode: input.businessCode,
    }),
    recovered,
    fallbackRequestId,
  };
}

export function toApplymentRequestSource(
  applyment: WechatPayApplymentRecord,
): WechatPayApplymentRequestSource {
  if (
    applyment.subject_type !== "SUBJECT_TYPE_ENTERPRISE" &&
    applyment.subject_type !== "SUBJECT_TYPE_INDIVIDUAL"
  ) throwInvalidRequestSource("subject_type");
  if (applyment.identity_doc_type !== "IDENTIFICATION_TYPE_IDCARD") {
    throwInvalidRequestSource("identity_doc_type");
  }
  if (applyment.contact_type !== "LEGAL" && applyment.contact_type !== "SUPER") {
    throwInvalidRequestSource("contact_type");
  }
  if (
    applyment.settlement_account_type !== "BANK_ACCOUNT_TYPE_CORPORATE" &&
    applyment.settlement_account_type !== "BANK_ACCOUNT_TYPE_PERSONAL"
  ) throwInvalidRequestSource("settlement_account_type");
  return {
    subject_type: applyment.subject_type,
    merchant_short_name: requiredText(
      applyment.merchant_short_name,
      "merchant_short_name",
    ),
    license_name: requiredText(applyment.license_name, "license_name"),
    license_code: requiredText(applyment.license_code, "license_code"),
    license_address: applyment.license_address,
    license_period_begin: applyment.license_period_begin,
    license_period_end: applyment.license_period_end,
    legal_representative_name: requiredText(
      applyment.legal_representative_name,
      "legal_representative_name",
    ),
    identity_doc_type: applyment.identity_doc_type,
    identity_period_begin: requiredText(
      applyment.identity_period_begin,
      "identity_period_begin",
    ),
    identity_period_end: requiredText(
      applyment.identity_period_end,
      "identity_period_end",
    ),
    contact_type: applyment.contact_type,
    contact_identity_doc_type: applyment.contact_identity_doc_type ===
        "IDENTIFICATION_TYPE_IDCARD"
      ? applyment.contact_identity_doc_type
      : null,
    contact_identity_period_begin: applyment.contact_identity_period_begin,
    contact_identity_period_end: applyment.contact_identity_period_end,
    service_phone: requiredText(applyment.service_phone, "service_phone"),
    settlement_account_type: applyment.settlement_account_type,
    settlement_bank_name: requiredText(
      applyment.settlement_bank_name,
      "settlement_bank_name",
    ),
    settlement_bank_full_name: applyment.settlement_bank_full_name,
    settlement_bank_branch_id: applyment.settlement_bank_branch_id,
    settlement_id: requiredText(applyment.settlement_id, "settlement_id"),
    qualification_type: requiredText(
      applyment.qualification_type,
      "qualification_type",
    ),
  };
}

export function parseApplymentAttachments(
  value: unknown,
): WechatPayApplymentAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throwInvalidRequestSource("attachments");
    }
    const record = item as Record<string, unknown>;
    const category = WechatPayApplymentAttachmentCategorySchema.safeParse(
      record.category,
    );
    if (!category.success || !hasText(record.object_key)) {
      throwInvalidRequestSource("attachments");
    }
    return {
      category: category.data,
      object_key: record.object_key,
      file_name: hasText(record.file_name) ? record.file_name : null,
    };
  });
}

export function requiredApplymentMedia(
  media: Map<string, string[]>,
  category: string,
) {
  const value = media.get(category)?.[0];
  if (!value) throwInvalidRequestSource(`attachments.${category}`);
  return value;
}

export function optionalApplymentMedia(
  media: Map<string, string[]>,
  category: string,
) {
  return media.get(category)?.[0] ?? null;
}

export function mapWechatApplymentState(
  state: WechatPayApplymentQueryResult["applymentState"],
): { status: string; applymentState: string } {
  return {
    APPLYMENT_STATE_EDITTING: {
      status: "wechat_editing",
      applymentState: "submitted",
    },
    APPLYMENT_STATE_AUDITING: {
      status: "reviewing",
      applymentState: "reviewing",
    },
    APPLYMENT_STATE_REJECTED: {
      status: "rejected",
      applymentState: "rejected",
    },
    APPLYMENT_STATE_TO_BE_CONFIRMED: {
      status: "account_verifying",
      applymentState: "account_verifying",
    },
    APPLYMENT_STATE_TO_BE_SIGNED: {
      status: "signing",
      applymentState: "signing",
    },
    APPLYMENT_STATE_SIGNING: {
      status: "opening",
      applymentState: "signing",
    },
    APPLYMENT_STATE_FINISHED: {
      status: "opened",
      applymentState: "opened",
    },
    APPLYMENT_STATE_CANCELED: {
      status: "closed",
      applymentState: "closed",
    },
  }[state];
}

export function isUncertainApplymentSubmitError(error: unknown) {
  return error instanceof AppError && [
    "WECHAT_PAY_APPLYMENT_TIMEOUT",
    "WECHAT_PAY_APPLYMENT_TRANSPORT_FAILED",
    "WECHAT_PAY_APPLYMENT_UPSTREAM_UNAVAILABLE",
  ].includes(error.code);
}

export function isWechatApplymentNotFound(error: unknown) {
  if (!(error instanceof AppError)) return false;
  const details = safeDetails(error.details);
  return error.code === "WECHAT_PAY_APPLYMENT_REQUEST_REJECTED" &&
    details.operation === "query" &&
    details.status === 400 &&
    details.wechatCode === "APPLYMENT_NOT_EXIST";
}

export function canResubmitWechatApplyment(
  result: WechatPayApplymentQueryResult,
) {
  return [
    "APPLYMENT_STATE_EDITTING",
    "APPLYMENT_STATE_REJECTED",
  ].includes(result.applymentState);
}

export function isKnownWechatApplymentSubmitRejection(error: unknown) {
  if (!(error instanceof AppError)) return false;
  return error.code === "WECHAT_PAY_APPLYMENT_REQUEST_REJECTED" &&
    safeDetails(error.details).operation === "submit";
}

export function sanitizedApplymentErrorMetadata(
  error: unknown,
): Record<string, unknown> {
  if (!(error instanceof AppError)) return { error_code: "UNKNOWN" };
  const details = safeDetails(error.details);
  const operation = ["submit", "query", "upload_media"].includes(
      String(details.operation),
    )
    ? String(details.operation)
    : null;
  return {
    error_code: safeToken(error.code) ?? "UNKNOWN",
    ...(operation ? { operation } : {}),
    ...(hasText(details.requestId)
      ? { request_id: details.requestId.slice(0, 128) }
      : {}),
    ...(safeToken(details.wechatCode)
      ? { wechat_code: safeToken(details.wechatCode) }
      : {}),
  };
}

export function applymentSubmissionEventMessage(eventType: string) {
  return eventType === "wechat_applyment_submission_failed"
    ? "微信支付正式进件提交失败"
    : eventType === "wechat_applyment_recovered"
    ? "已通过业务申请编号恢复微信支付正式进件状态"
    : "已向微信支付提交正式进件申请";
}

export function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requiredText(value: unknown, field: string): string {
  if (!hasText(value)) throwInvalidRequestSource(field);
  return value;
}

function throwInvalidRequestSource(field: string): never {
  throw Errors.business(
    409,
    "微信支付进件请求资料不完整",
    "WECHAT_PAY_APPLYMENT_REQUEST_SOURCE_INVALID",
    { missing: [field] },
  );
}

function safeDetails(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeToken(value: unknown) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(value)
    ? value
    : null;
}
