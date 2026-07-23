import {
  findWechatPaySettlementRule,
  type OcrDocumentType,
} from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import type { OcrRecognitionOwnershipRecord } from "@/repositories/ocr-recognitions";
import type {
  WechatPayApplymentRecord,
  WechatPayApplymentSensitiveRecord,
} from "@/repositories/wechat-pay-applyments";
import { WechatPayApplymentAttachmentCategorySchema } from "@/schema/wechat-pay-applyments";
import {
  decryptApplymentSensitivePayload,
  requireCompleteApplymentSensitivePayload,
  type ApplymentSensitiveDraftPayload,
  type ApplymentSensitivePayload,
} from "@/services/wechat-pay-applyment-sensitive-payload";
import {
  getWechatPayApplymentOcrDocumentType,
} from "@/services/ocr/capabilities";
import type {
  WechatPayApplymentOcrRecognitionRepositoryPort,
  WechatPayApplymentPreflightBlocker,
} from "@/services/wechat-pay-applyments-types";

const MAX_APPLYMENT_ATTACHMENTS = 20;

export type ApplymentSensitivePayloadRepositoryPort = {
  findSensitivePayloadById: (input: {
    id: string;
    tenantId?: string;
  }) => Promise<WechatPayApplymentSensitiveRecord | null>;
};

export async function loadApplymentSensitiveDraftPayload(input: {
  applyment: WechatPayApplymentRecord;
  repository: ApplymentSensitivePayloadRepositoryPort;
  rootSecret: string | null | undefined;
}): Promise<ApplymentSensitiveDraftPayload> {
  const stored = await input.repository.findSensitivePayloadById({
    id: input.applyment.id,
    tenantId: input.applyment.tenant_id,
  });
  if (
    !stored?.has_sensitive_payload ||
    !stored.sensitive_payload_ciphertext ||
    !stored.sensitive_payload_version ||
    stored.sensitive_payload_version !== input.applyment.sensitive_payload_version
  ) {
    throw Errors.business(
      500,
      "微信支付进件敏感资料存储状态异常",
      "WECHAT_PAY_APPLYMENT_SENSITIVE_PAYLOAD_CORRUPTED",
    );
  }
  return decryptApplymentSensitivePayload({
    context: {
      tenantId: input.applyment.tenant_id,
      applymentId: input.applyment.id,
      version: stored.sensitive_payload_version,
    },
    ciphertext: stored.sensitive_payload_ciphertext,
    rootSecret: input.rootSecret,
  });
}

export async function loadCompleteApplymentSensitivePayload(input: {
  applyment: WechatPayApplymentRecord;
  repository: ApplymentSensitivePayloadRepositoryPort;
  rootSecret: string | null | undefined;
}): Promise<ApplymentSensitivePayload> {
  return requireCompleteApplymentSensitivePayload(
    await loadApplymentSensitiveDraftPayload(input),
    input.applyment.contact_type,
  );
}

export async function getApplymentSubmissionContentBlockers(input: {
  applyment: WechatPayApplymentRecord;
  ocrRecognitionRepository: WechatPayApplymentOcrRecognitionRepositoryPort;
}): Promise<WechatPayApplymentPreflightBlocker[]> {
  const blockers: WechatPayApplymentPreflightBlocker[] = [];
  collectSettlementBlockers(input.applyment, blockers);
  await collectOcrReviewBlockers(input, blockers);
  return deduplicateBlockers(blockers);
}

export async function assertApplymentSubmissionContentValid(input: {
  applyment: WechatPayApplymentRecord;
  ocrRecognitionRepository: WechatPayApplymentOcrRecognitionRepositoryPort;
}): Promise<void> {
  const blockers = await getApplymentSubmissionContentBlockers(input);
  if (blockers.length === 0) return;
  throw Errors.business(
    400,
    "微信支付开通申请提交内容不符合要求",
    "WECHAT_PAY_APPLYMENT_SUBMISSION_CONTENT_INVALID",
    { blockers },
  );
}

function collectSettlementBlockers(
  applyment: WechatPayApplymentRecord,
  blockers: WechatPayApplymentPreflightBlocker[],
) {
  if (
    applyment.subject_type === "SUBJECT_TYPE_ENTERPRISE" &&
    applyment.settlement_account_type !== "BANK_ACCOUNT_TYPE_CORPORATE"
  ) {
    blockers.push({
      code: "APPLYMENT_ENTERPRISE_ACCOUNT_TYPE_INVALID",
      field: "settlement_account_type",
    });
  }
  if (
    !applyment.subject_type ||
    !applyment.settlement_id ||
    !applyment.qualification_type
  ) return;
  if (
    (
      applyment.subject_type !== "SUBJECT_TYPE_ENTERPRISE" &&
      applyment.subject_type !== "SUBJECT_TYPE_INDIVIDUAL"
    ) ||
    !findWechatPaySettlementRule(
      applyment.subject_type,
      applyment.settlement_id,
      applyment.qualification_type,
    )
  ) {
    blockers.push({
      code: "APPLYMENT_SETTLEMENT_RULE_INVALID",
      field: "settlement_id",
    });
  }
}

async function collectOcrReviewBlockers(
  input: {
    applyment: WechatPayApplymentRecord;
    ocrRecognitionRepository: WechatPayApplymentOcrRecognitionRepositoryPort;
  },
  blockers: WechatPayApplymentPreflightBlocker[],
) {
  const confirmed: Array<{
    category: string;
    documentType: OcrDocumentType;
    fileObjectId: string;
    recognitionId: string;
  }> = [];
  if (Array.isArray(input.applyment.attachments)) {
    for (const value of input.applyment.attachments) {
      const attachment = safeRecord(value);
      const category = WechatPayApplymentAttachmentCategorySchema.safeParse(
        attachment?.category,
      );
      if (!attachment || !category.success) {
        continue;
      }
      const documentType = getWechatPayApplymentOcrDocumentType(category.data);
      if (!documentType) {
        continue;
      }
      const status = attachment.ocr_review_status;
      if (status === "manual") continue;
      if (status !== "confirmed") {
        blockers.push({
          code: "APPLYMENT_ATTACHMENT_OCR_REVIEW_REQUIRED",
          category: category.data,
        });
        continue;
      }
      if (
        typeof attachment.ocr_recognition_id !== "string" ||
        typeof attachment.file_object_id !== "string"
      ) {
        blockers.push({
          code: "APPLYMENT_ATTACHMENT_OCR_RECOGNITION_MISMATCH",
          category: category.data,
        });
        continue;
      }
      confirmed.push({
        category: category.data,
        documentType,
        fileObjectId: attachment.file_object_id,
        recognitionId: attachment.ocr_recognition_id,
      });
    }
  }
  if (confirmed.length === 0) return;

  const recognitions = await input.ocrRecognitionRepository.findByIdsForTenant({
    tenantId: input.applyment.tenant_id,
    ids: confirmed.map((item) => item.recognitionId),
    limit: MAX_APPLYMENT_ATTACHMENTS,
  });
  const byId = new Map(recognitions.map((recognition) => [
    recognition.id,
    recognition,
  ]));
  for (const attachment of confirmed) {
    const recognition = byId.get(attachment.recognitionId);
    if (!matchesApplymentAttachment(
      recognition,
      input.applyment,
      attachment.fileObjectId,
      attachment.documentType,
    )) {
      blockers.push({
        code: "APPLYMENT_ATTACHMENT_OCR_RECOGNITION_MISMATCH",
        category: attachment.category,
      });
    }
  }
}

function matchesApplymentAttachment(
  recognition: OcrRecognitionOwnershipRecord | undefined,
  applyment: WechatPayApplymentRecord,
  fileObjectId: string,
  documentType: OcrDocumentType,
) {
  return recognition?.tenant_id === applyment.tenant_id &&
    recognition.scene === "wechat_pay_applyment" &&
    recognition.document_type === documentType &&
    recognition.file_object_id === fileObjectId &&
    recognition.subject_type === "wechat_pay_applyment" &&
    recognition.subject_id === applyment.id &&
    recognition.status === "succeeded";
}

function safeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function deduplicateBlockers(
  blockers: WechatPayApplymentPreflightBlocker[],
) {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    const key = JSON.stringify(blocker);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
