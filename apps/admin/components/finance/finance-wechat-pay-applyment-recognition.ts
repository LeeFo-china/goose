import type { OcrDocumentType } from "@gooes/domain";
import { mapApplymentOcrFields } from "@/components/ocr/ocr-field-review-dialog";
import { createApplymentOcrRecognition } from "@/components/ocr/ocr-requests";
import {
  buildFailedMaterialState,
  getOcrMaterialCategory,
  getPendingRecognitionAttachments,
  isCurrentMaterialAttachment,
  runMaterialRecognitionOperation,
  updateAttachmentOcrReviewMetadata,
  type ApplymentMaterialState,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import type { PersistAttachmentsInput } from "./finance-wechat-pay-applyment-manual-entry";
import {
  WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES,
  type WechatPayApplymentAttachment,
  type WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";

export const RECOGNITION_PERSIST_ERROR = "识别结果保存失败";

export async function processApplymentUploadedMaterials(input: {
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
  supportedDocumentTypes: ReadonlySet<string>;
  excludedObjectKeys: ReadonlySet<string>;
  isActive: () => boolean;
  markUnsupportedManual: () => Promise<void>;
  recognize: (attachment: WechatPayApplymentAttachment) => Promise<void>;
}) {
  await input.markUnsupportedManual();
  if (!input.isActive()) return;
  const attachments = getPendingRecognitionAttachments({
    attachments: input.attachments,
    materialStates: input.materialStates,
    supportedDocumentTypes: input.supportedDocumentTypes,
    excludedObjectKeys: input.excludedObjectKeys,
  });
  for (const attachment of attachments) {
    if (!input.isActive()) break;
    await input.recognize(attachment);
  }
}

export async function recognizeApplymentAttachment(input: {
  attachment: WechatPayApplymentAttachment;
  applymentId: string | null;
  supportedDocumentTypes: ReadonlySet<string>;
  unpersistedObjectKeys: ReadonlySet<string>;
  generation: number;
  isCurrentGeneration: (generation: number) => boolean;
  getAttachments: () => WechatPayApplymentAttachment[];
  getState: (
    category: WechatPayApplymentAttachmentCategory,
  ) => ApplymentMaterialState | undefined;
  commitAttachments: (attachments: WechatPayApplymentAttachment[]) => void;
  commitState: (
    attachment: WechatPayApplymentAttachment,
    state: ApplymentMaterialState,
  ) => boolean;
  persist: (input: PersistAttachmentsInput) => Promise<void>;
  reportError: (error: string) => void;
}) {
  const attachment = input.attachment;
  const category = getOcrMaterialCategory(attachment);
  const fileObjectId = attachment.file_object_id;
  const documentType = category
    ? WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES[category]
    : undefined;
  if (
    !input.isCurrentGeneration(input.generation) ||
    !category ||
    !documentType ||
    !fileObjectId ||
    input.unpersistedObjectKeys.has(attachment.object_key) ||
    !input.supportedDocumentTypes.has(documentType) ||
    !isCurrentMaterialAttachment(input.getAttachments(), attachment)
  ) {
    return;
  }

  input.reportError("");
  input.commitState(attachment, {
    status: "recognizing",
    attachmentObjectKey: attachment.object_key,
    recognitionId: attachment.ocr_recognition_id ?? null,
    fields: [],
    warnings: [],
    error: null,
  });
  let recognizedAttachments: WechatPayApplymentAttachment[] | null = null;
  const outcome = await runMaterialRecognitionOperation({
    recognize: () => createApplymentOcrRecognition({
      documentType: documentType as OcrDocumentType,
      fileObjectId,
      applymentId: input.applymentId,
    }),
    commitRecognition: (result) => {
      if (
        !input.isCurrentGeneration(input.generation) ||
        !isCurrentMaterialAttachment(input.getAttachments(), attachment)
      ) {
        return false;
      }
      recognizedAttachments = updateAttachmentOcrReviewMetadata(
        input.getAttachments(),
        attachment.object_key,
        {
          ocr_recognition_id: result.recognition.id,
          ocr_review_status: "review_required",
        },
      );
      input.commitAttachments(recognizedAttachments);
      input.commitState(attachment, {
        status: "review_required",
        attachmentObjectKey: attachment.object_key,
        recognitionId: result.recognition.id,
        fields: mapApplymentOcrFields(category, result.recognition.fields),
        warnings: [...result.recognition.warnings],
        error: null,
      });
      return true;
    },
    persistRecognition: async () => {
      if (
        !recognizedAttachments ||
        !input.isCurrentGeneration(input.generation)
      ) {
        return;
      }
      await input.persist({
        attachments: recognizedAttachments,
        draftUpdateSource: "ocr_review",
      });
    },
  });
  if (!input.isCurrentGeneration(input.generation)) return;
  if (outcome.type === "recognition_failed") {
    if (!isCurrentMaterialAttachment(input.getAttachments(), attachment)) return;
    const nextAttachments = updateAttachmentOcrReviewMetadata(
      input.getAttachments(),
      attachment.object_key,
      {
        ocr_recognition_id: attachment.ocr_recognition_id ?? null,
        ocr_review_status: "failed",
      },
    );
    input.commitAttachments(nextAttachments);
    const message = getApplymentMaterialErrorMessage(
      outcome.error,
      "证照识别失败",
    );
    input.commitState(attachment, buildFailedMaterialState(attachment, message));
    input.reportError(message);
    await input.persist({
      attachments: nextAttachments,
      draftUpdateSource: "ocr_review",
    });
    return;
  }
  if (outcome.type === "persist_failed") {
    const currentState = input.getState(category);
    if (
      currentState?.status === "review_required" &&
      currentState.recognitionId === outcome.recognition.recognition.id
    ) {
      input.commitState(attachment, {
        ...currentState,
        error: RECOGNITION_PERSIST_ERROR,
      });
      input.reportError(RECOGNITION_PERSIST_ERROR);
    }
  }
}

export function getApplymentMaterialErrorMessage(
  error: unknown,
  fallback: string,
) {
  return error instanceof Error ? error.message : fallback;
}
