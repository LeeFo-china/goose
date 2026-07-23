import {
  getOcrMaterialDocumentType,
  getOcrMaterialCategory,
  reconcileMaterialStates,
  updateAttachmentOcrReviewMetadata,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import type {
  WechatPayApplymentAttachment,
  WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";

export type DraftUpdateSource =
  | "attachment_change"
  | "ocr_review"
  | "manual_entry";

export type PersistAttachmentsInput = {
  attachments: WechatPayApplymentAttachment[];
  draftUpdateSource: DraftUpdateSource;
};

export const MANUAL_ENTRY_PERSIST_ERROR = "手动填写状态保存失败";

export function markManualEntryPersistenceError(
  materialStates: ApplymentMaterialStateMap,
  categories: readonly WechatPayApplymentAttachmentCategory[],
  error: string | null,
): ApplymentMaterialStateMap {
  const nextStates = { ...materialStates };
  for (const category of categories) {
    const state = nextStates[category];
    if (state?.status === "manual") {
      nextStates[category] = { ...state, error };
    }
  }
  return nextStates;
}

export type ManualEntryPersistenceOutcome =
  | { type: "persisted" }
  | { type: "persist_failed"; error: unknown };

export async function runManualEntryPersistence(
  persist: () => Promise<void>,
): Promise<ManualEntryPersistenceOutcome> {
  try {
    await persist();
    return { type: "persisted" };
  } catch (error) {
    return { type: "persist_failed", error };
  }
}

export async function persistUnsupportedApplymentMaterialsAsManual(input: {
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
  supportedDocumentTypes: ReadonlySet<string>;
  excludedObjectKeys: ReadonlySet<string>;
  isActive: () => boolean;
  commitLocal: (
    attachments: WechatPayApplymentAttachment[],
    states: ApplymentMaterialStateMap,
  ) => void;
  commitStates: (states: ApplymentMaterialStateMap) => void;
  persist: (input: PersistAttachmentsInput) => Promise<void>;
  reportError: (message: string) => void;
}) {
  if (!input.isActive()) return;
  const unsupported = input.attachments.filter((attachment) => {
    const category = getOcrMaterialCategory(attachment);
    const state = category ? input.materialStates[category] : undefined;
    const documentType = getOcrMaterialDocumentType(attachment);
    return Boolean(
      category &&
      documentType &&
      !input.excludedObjectKeys.has(attachment.object_key) &&
      !input.supportedDocumentTypes.has(documentType) &&
      state?.attachmentObjectKey === attachment.object_key &&
      state.status === "uploaded",
    );
  });
  if (unsupported.length === 0) return;

  let nextAttachments = [...input.attachments];
  for (const attachment of unsupported) {
    nextAttachments = updateAttachmentOcrReviewMetadata(
      nextAttachments,
      attachment.object_key,
      {
        ocr_recognition_id: attachment.ocr_recognition_id ?? null,
        ocr_review_status: "manual",
      },
    );
  }
  const nextStates = reconcileMaterialStates(
    nextAttachments,
    input.materialStates,
  );
  input.commitLocal(nextAttachments, nextStates);

  const outcome = await runManualEntryPersistence(() => input.persist({
    attachments: nextAttachments,
    draftUpdateSource: "manual_entry",
  }));
  if (outcome.type !== "persist_failed" || !input.isActive()) return;
  const categories = unsupported.flatMap((attachment) => {
    const category = getOcrMaterialCategory(attachment);
    return category ? [category] : [];
  });
  input.commitStates(markManualEntryPersistenceError(
    nextStates,
    categories,
    MANUAL_ENTRY_PERSIST_ERROR,
  ));
  input.reportError(MANUAL_ENTRY_PERSIST_ERROR);
}

export function changeApplymentAttachments(input: {
  currentAttachments: readonly WechatPayApplymentAttachment[];
  currentStates: ApplymentMaterialStateMap;
  nextAttachments: WechatPayApplymentAttachment[];
  commitLocal: (
    attachments: WechatPayApplymentAttachment[],
    states: ApplymentMaterialStateMap,
  ) => void;
  getCurrentStates: () => ApplymentMaterialStateMap;
  commitStates: (states: ApplymentMaterialStateMap) => void;
  enqueue: (operation: () => Promise<void>) => Promise<void>;
  isActive: () => boolean;
  rollback: () => void;
  persist: (input: PersistAttachmentsInput) => Promise<void>;
  clearError: () => void;
  reportError: (error: string) => void;
  reportOperationError: (error: unknown) => void;
}) {
  const manualCategories = input.nextAttachments.flatMap((attachment) => {
    const previous = input.currentAttachments.find(
      (item) => item.object_key === attachment.object_key,
    );
    const category = getOcrMaterialCategory(attachment);
    return previous?.ocr_review_status !== "manual" &&
        attachment.ocr_review_status === "manual" && category
      ? [category]
      : [];
  });
  input.commitLocal(
    input.nextAttachments,
    reconcileMaterialStates(input.nextAttachments, input.currentStates),
  );
  input.clearError();

  return input.enqueue(async () => {
    const persistInput: PersistAttachmentsInput = {
      attachments: input.nextAttachments,
      draftUpdateSource: manualCategories.length > 0
        ? "manual_entry"
        : "attachment_change",
    };
    if (manualCategories.length === 0) {
      await input.persist(persistInput);
      return;
    }
    const outcome = await runManualEntryPersistence(
      () => input.persist(persistInput),
    );
    if (outcome.type === "persisted") return;
    input.commitStates(markManualEntryPersistenceError(
      input.getCurrentStates(),
      manualCategories,
      MANUAL_ENTRY_PERSIST_ERROR,
    ));
    input.reportError(MANUAL_ENTRY_PERSIST_ERROR);
    throw outcome.error;
  }).catch((error) => {
    if (manualCategories.length === 0 && input.isActive()) {
      input.rollback();
      input.reportOperationError(error);
    }
    throw error;
  });
}
