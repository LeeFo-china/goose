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
  contactType?: string;
};

export const MANUAL_ENTRY_PERSIST_ERROR = "手动填写状态保存失败";

export type ApplymentAttachmentMutationIntent = {
  removeObjectKeys: readonly string[];
  upsertAttachments: readonly WechatPayApplymentAttachment[];
};

export type ApplymentAttachmentRelatedMutation = {
  commitOptimistic: () => void;
  rollback: () => void;
  contactType?: string;
};

export type ApplymentAttachmentChangeOptions = {
  intent?: ApplymentAttachmentMutationIntent;
  relatedMutation?: ApplymentAttachmentRelatedMutation;
};

export function createApplymentAttachmentMutationIntent(
  currentAttachments: readonly WechatPayApplymentAttachment[],
  nextAttachments: readonly WechatPayApplymentAttachment[],
): ApplymentAttachmentMutationIntent {
  const nextObjectKeys = new Set(
    nextAttachments.map((attachment) => attachment.object_key),
  );
  return {
    removeObjectKeys: currentAttachments
      .filter((attachment) => !nextObjectKeys.has(attachment.object_key))
      .map((attachment) => attachment.object_key),
    upsertAttachments: nextAttachments
      .filter((attachment) => {
        const current = currentAttachments.find(
          (item) => item.object_key === attachment.object_key,
        );
        return !current || !areApplymentAttachmentsEqual(current, attachment);
      }),
  };
}

export function applyApplymentAttachmentMutationIntent(
  currentAttachments: readonly WechatPayApplymentAttachment[],
  intent: ApplymentAttachmentMutationIntent,
) {
  const removed = new Set(intent.removeObjectKeys);
  const upserts = new Map(
    intent.upsertAttachments.map((attachment) => [
      attachment.object_key,
      attachment,
    ]),
  );
  const nextAttachments = currentAttachments
    .filter((attachment) => !removed.has(attachment.object_key))
    .map((attachment) =>
      upserts.get(attachment.object_key) ?? attachment
    );
  const currentKeys = new Set(
    currentAttachments.map((attachment) => attachment.object_key),
  );
  for (const attachment of intent.upsertAttachments) {
    if (!currentKeys.has(attachment.object_key)) {
      nextAttachments.push(attachment);
    }
  }
  return nextAttachments;
}

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
  intent?: ApplymentAttachmentMutationIntent;
  relatedMutation?: ApplymentAttachmentRelatedMutation;
  getCurrentAttachments: () => readonly WechatPayApplymentAttachment[];
  commitLocal: (
    attachments: WechatPayApplymentAttachment[],
    states: ApplymentMaterialStateMap,
  ) => void;
  getCurrentStates: () => ApplymentMaterialStateMap;
  commitStates: (states: ApplymentMaterialStateMap) => void;
  enqueue: (operation: () => Promise<void>) => Promise<void>;
  isActive: () => boolean;
  captureRollback: () => () => void;
  persist: (input: PersistAttachmentsInput) => Promise<void>;
  clearError: () => void;
  reportError: (error: string) => void;
  reportOperationError: (error: unknown) => void;
}) {
  const intent = input.intent ?? createApplymentAttachmentMutationIntent(
    input.currentAttachments,
    input.nextAttachments,
  );
  return input.enqueue(async () => {
    if (!input.isActive()) return;
    const currentAttachments = input.getCurrentAttachments();
    const currentStates = input.getCurrentStates();
    const nextAttachments = applyApplymentAttachmentMutationIntent(
      currentAttachments,
      intent,
    );
    const manualCategories = nextAttachments.flatMap((attachment) => {
      const previous = currentAttachments.find(
        (item) => item.object_key === attachment.object_key,
      );
      const category = getOcrMaterialCategory(attachment);
      return previous?.ocr_review_status !== "manual" &&
          attachment.ocr_review_status === "manual" && category
        ? [category]
        : [];
    });
    const rollback = input.captureRollback();
    input.relatedMutation?.commitOptimistic();
    input.commitLocal(
      nextAttachments,
      reconcileMaterialStates(nextAttachments, currentStates),
    );
    input.clearError();
    const persistInput: PersistAttachmentsInput = {
      attachments: nextAttachments,
      draftUpdateSource: manualCategories.length > 0
        ? "manual_entry"
        : "attachment_change",
      ...(input.relatedMutation?.contactType
        ? { contactType: input.relatedMutation.contactType }
        : {}),
    };
    if (manualCategories.length === 0) {
      try {
        await input.persist(persistInput);
      } catch (error) {
        if (input.isActive()) {
          rollback();
          input.relatedMutation?.rollback();
          input.reportOperationError(error);
        }
        throw error;
      }
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
  });
}

function areApplymentAttachmentsEqual(
  left: WechatPayApplymentAttachment,
  right: WechatPayApplymentAttachment,
) {
  return left.category === right.category &&
    left.file_object_id === right.file_object_id &&
    left.object_key === right.object_key &&
    left.file_name === right.file_name &&
    left.content_type === right.content_type &&
    left.size === right.size &&
    left.ocr_recognition_id === right.ocr_recognition_id &&
    left.ocr_review_status === right.ocr_review_status;
}
