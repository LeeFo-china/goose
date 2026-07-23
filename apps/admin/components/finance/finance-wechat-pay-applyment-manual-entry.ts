import {
  getOcrMaterialCategory,
  reconcileMaterialStates,
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
    if (manualCategories.length === 0) input.reportOperationError(error);
    throw error;
  });
}
