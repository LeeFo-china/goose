import type {
  OcrFieldSuggestion,
  OcrWarning,
} from "@gooes/domain";

import {
  WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES,
  type WechatPayApplymentAttachment,
  type WechatPayApplymentAttachmentCategory,
  type WechatPayApplymentAttachmentOcrReviewStatus,
} from "./finance-wechat-pay-applyment-shared";

export const APPLYMENT_STAGE_KEYS = [
  "materials",
  "recognition",
  "supplement",
  "submit",
] as const;

export type ApplymentStageKey = (typeof APPLYMENT_STAGE_KEYS)[number];

export type ApplymentMaterialStatus =
  | "missing"
  | "uploaded"
  | "recognizing"
  | "review_required"
  | "confirmed"
  | "manual"
  | "failed";

export type ApplymentMaterialState = {
  readonly status: ApplymentMaterialStatus;
  readonly attachmentObjectKey: string | null;
  readonly recognitionId: string | null;
  readonly fields: readonly OcrFieldSuggestion[];
  readonly warnings: readonly OcrWarning[];
  readonly error: string | null;
};

export type ApplymentMaterialStateMap = Readonly<
  Partial<
    Record<WechatPayApplymentAttachmentCategory, ApplymentMaterialState>
  >
>;

export type ApplymentAttachmentOcrReviewMetadata = {
  readonly ocr_recognition_id: string | null;
  readonly ocr_review_status:
    | WechatPayApplymentAttachmentOcrReviewStatus
    | null;
};

export type ApplymentStageGuardResult =
  | { allowed: true; reason: null }
  | { allowed: false; reason: string };

const BASE_REQUIRED_ATTACHMENTS = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
] as const satisfies readonly WechatPayApplymentAttachmentCategory[];

const CONTACT_REQUIRED_ATTACHMENTS = [
  "contact_id_card_front",
  "contact_id_card_back",
] as const satisfies readonly WechatPayApplymentAttachmentCategory[];

const OCR_SUPPORTED_CATEGORIES: ReadonlySet<unknown> = new Set(
  Object.keys(WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES),
);

function isOcrSupportedCategory(
  category: WechatPayApplymentAttachment["category"],
): category is WechatPayApplymentAttachmentCategory {
  return typeof category === "string" && OCR_SUPPORTED_CATEGORIES.has(category);
}

function buildCurrentOcrAttachments(
  attachments: readonly WechatPayApplymentAttachment[],
): ReadonlyMap<
  WechatPayApplymentAttachmentCategory,
  WechatPayApplymentAttachment
> {
  const currentAttachments = new Map<
    WechatPayApplymentAttachmentCategory,
    WechatPayApplymentAttachment
  >();
  for (const attachment of attachments) {
    if (!isOcrSupportedCategory(attachment.category)) continue;
    currentAttachments.set(attachment.category, attachment);
  }
  return currentAttachments;
}

function restoreMaterialStatus(
  status: WechatPayApplymentAttachment["ocr_review_status"],
): ApplymentMaterialStatus {
  switch (status) {
    case "review_required":
    case "confirmed":
    case "manual":
    case "failed":
      return status;
    default:
      return "uploaded";
  }
}

export function buildInitialMaterialState(
  attachment: WechatPayApplymentAttachment,
): ApplymentMaterialState {
  return {
    status: restoreMaterialStatus(attachment.ocr_review_status),
    attachmentObjectKey: attachment.object_key,
    recognitionId: attachment.ocr_recognition_id ?? null,
    fields: [],
    warnings: [],
    error: null,
  };
}

export function buildInitialMaterialStates(
  attachments: readonly WechatPayApplymentAttachment[],
): ApplymentMaterialStateMap {
  const states: Partial<
    Record<WechatPayApplymentAttachmentCategory, ApplymentMaterialState>
  > = {};
  for (const [category, attachment] of buildCurrentOcrAttachments(attachments)) {
    states[category] = buildInitialMaterialState(attachment);
  }
  return states;
}

export function updateAttachmentOcrReviewMetadata(
  attachments: readonly WechatPayApplymentAttachment[],
  objectKey: string,
  metadata: ApplymentAttachmentOcrReviewMetadata,
): WechatPayApplymentAttachment[] {
  return attachments.map((attachment) =>
    attachment.object_key === objectKey
      ? { ...attachment, ...metadata }
      : attachment
  );
}

export function replaceApplymentAttachment(
  attachments: readonly WechatPayApplymentAttachment[],
  attachment: WechatPayApplymentAttachment,
): WechatPayApplymentAttachment[] {
  if (attachment.category === "business_scene_material") {
    return [...attachments, attachment];
  }
  return [
    ...attachments.filter((item) => item.category !== attachment.category),
    attachment,
  ];
}

export function isCurrentMaterialAttachment(
  attachments: readonly WechatPayApplymentAttachment[],
  attachment: WechatPayApplymentAttachment,
): boolean {
  if (!isOcrSupportedCategory(attachment.category)) return false;
  return buildCurrentOcrAttachments(attachments).get(attachment.category)
    ?.object_key === attachment.object_key;
}

export function getOcrMaterialCategory(
  attachment: WechatPayApplymentAttachment,
): WechatPayApplymentAttachmentCategory | null {
  return isOcrSupportedCategory(attachment.category)
    ? attachment.category
    : null;
}

export function getOcrMaterialDocumentType(
  attachment: WechatPayApplymentAttachment,
) {
  const category = getOcrMaterialCategory(attachment);
  return category
    ? WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES[category]
    : undefined;
}

export function buildFailedMaterialState(
  attachment: WechatPayApplymentAttachment,
  error: string,
): ApplymentMaterialState {
  return {
    status: "failed",
    attachmentObjectKey: attachment.object_key,
    recognitionId: attachment.ocr_recognition_id ?? null,
    fields: [],
    warnings: [],
    error,
  };
}

export function reconcileMaterialStates(
  attachments: readonly WechatPayApplymentAttachment[],
  materialStates: ApplymentMaterialStateMap,
): ApplymentMaterialStateMap {
  const initialStates = buildInitialMaterialStates(attachments);
  const nextStates: Partial<
    Record<WechatPayApplymentAttachmentCategory, ApplymentMaterialState>
  > = {};
  for (const [category, initialState] of Object.entries(initialStates) as Array<
    [WechatPayApplymentAttachmentCategory, ApplymentMaterialState]
  >) {
    const currentState = materialStates[category];
    nextStates[category] = currentState?.attachmentObjectKey ===
        initialState.attachmentObjectKey
      ? currentState
      : initialState;
  }
  return nextStates;
}

export function buildRecoveredMaterialState(
  attachment: WechatPayApplymentAttachment,
  recognition: {
    id: string;
    warnings: readonly OcrWarning[];
  },
  fields: readonly OcrFieldSuggestion[],
): ApplymentMaterialState {
  return {
    status: "review_required",
    attachmentObjectKey: attachment.object_key,
    recognitionId: recognition.id,
    fields,
    warnings: recognition.warnings,
    error: null,
  };
}

export function getPendingRecognitionAttachments(input: {
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
  supportedDocumentTypes: ReadonlySet<string>;
  excludedObjectKeys?: ReadonlySet<string>;
}): WechatPayApplymentAttachment[] {
  return input.attachments.filter((attachment) => {
    if (
      !isOcrSupportedCategory(attachment.category) ||
      !attachment.file_object_id ||
      input.excludedObjectKeys?.has(attachment.object_key)
    ) {
      return false;
    }
    const documentType = WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES[
      attachment.category
    ];
    const state = input.materialStates[attachment.category];
    return Boolean(
      documentType &&
      input.supportedDocumentTypes.has(documentType) &&
      state?.attachmentObjectKey === attachment.object_key &&
      state.status === "uploaded",
    );
  });
}

export function getApplymentProgress(stage: ApplymentStageKey): number {
  return (
    ((APPLYMENT_STAGE_KEYS.indexOf(stage) + 1) /
      APPLYMENT_STAGE_KEYS.length) *
    100
  );
}

export function getRequiredApplymentAttachments(
  contactType: string,
): readonly WechatPayApplymentAttachmentCategory[] {
  return contactType === "SUPER"
    ? [...BASE_REQUIRED_ATTACHMENTS, ...CONTACT_REQUIRED_ATTACHMENTS]
    : [...BASE_REQUIRED_ATTACHMENTS];
}

export function canLeaveMaterialsStage(input: {
  contactType: string;
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
}): ApplymentStageGuardResult {
  const currentAttachments = buildCurrentOcrAttachments(input.attachments);
  const isMissingRequired = getRequiredApplymentAttachments(input.contactType)
    .some((category) => !currentAttachments.has(category));
  if (isMissingRequired) {
    return {
      allowed: false,
      reason: "请先上传全部必传资料",
    };
  }

  const isRecognizing = Array.from(currentAttachments).some(
    ([category, attachment]) => {
      const state = input.materialStates[category];
      return state?.attachmentObjectKey === attachment.object_key &&
        state.status === "recognizing";
    },
  );
  if (isRecognizing) {
    return {
      allowed: false,
      reason: "证照正在识别，请稍候",
    };
  }

  return { allowed: true, reason: null };
}

export function canLeaveRecognitionStage(input: {
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
}): ApplymentStageGuardResult {
  const hasUnresolvedMaterial = Array.from(
    buildCurrentOcrAttachments(input.attachments),
  ).some(([category, attachment]) => {
    const state = input.materialStates[category];
    if (state?.attachmentObjectKey !== attachment.object_key) return true;
    return state.status !== "confirmed" && state.status !== "manual";
  });
  if (hasUnresolvedMaterial) {
    return {
      allowed: false,
      reason: "请先核对全部证照识别结果或选择手动填写",
    };
  }

  return { allowed: true, reason: null };
}

export function getInitialApplymentStage(input: {
  contactType: string;
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
  blockerStages: readonly ApplymentStageKey[];
}): ApplymentStageKey {
  const blockerStages = new Set(input.blockerStages);
  if (
    !canLeaveMaterialsStage(input).allowed ||
    blockerStages.has("materials")
  ) {
    return "materials";
  }
  if (
    !canLeaveRecognitionStage(input).allowed ||
    blockerStages.has("recognition")
  ) {
    return "recognition";
  }
  return blockerStages.has("supplement") ? "supplement" : "submit";
}
