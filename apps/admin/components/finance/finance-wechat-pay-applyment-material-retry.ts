import {
  getMaterialRetryAction,
  getOcrMaterialCategory,
  type ApplymentMaterialState,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import {
  MANUAL_ENTRY_PERSIST_ERROR,
  type PersistAttachmentsInput,
} from "./finance-wechat-pay-applyment-manual-entry";
import { RECOGNITION_PERSIST_ERROR } from "./finance-wechat-pay-applyment-recognition";
import type {
  WechatPayApplymentAttachment,
} from "./finance-wechat-pay-applyment-shared";

type RetryCoordinatorInput = {
  inFlight?: Map<string, Promise<void>>;
  getAttachments: () => readonly WechatPayApplymentAttachment[];
  getMaterialStates: () => ApplymentMaterialStateMap;
  getCheckpointErrors: () => Readonly<Record<string, string>>;
  enqueue: (operation: () => Promise<void>) => Promise<void>;
  checkpoint: (attachment: WechatPayApplymentAttachment) => Promise<unknown>;
  persist?: (input: PersistAttachmentsInput) => Promise<void>;
  isActive?: () => boolean;
  commitState?: (
    attachment: WechatPayApplymentAttachment,
    state: ApplymentMaterialState,
  ) => void;
  hasOutstandingErrors?: () => boolean;
  clearError?: () => void;
  reportError?: (message: string) => void;
  persistState?: (
    attachment: WechatPayApplymentAttachment,
    state: ApplymentMaterialState,
  ) => Promise<void>;
  recognize: (attachment: WechatPayApplymentAttachment) => Promise<void>;
};

export function createApplymentAttachmentRetryCoordinator(
  input: RetryCoordinatorInput,
) {
  const inFlight = input.inFlight ?? new Map<string, Promise<void>>();

  function run(
    objectKey: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    const existing = inFlight.get(objectKey);
    if (existing) return existing;
    const queued = input.enqueue(operation);
    const tracked = queued.finally(() => {
      if (inFlight.get(objectKey) === tracked) inFlight.delete(objectKey);
    });
    inFlight.set(objectKey, tracked);
    return tracked;
  }

  return {
    retryRecognition(requested: WechatPayApplymentAttachment) {
      return run(requested.object_key, async () => {
        const current = findCurrentAttachment(input, requested.object_key);
        if (!current) return;
        const category = getOcrMaterialCategory(current);
        const state = category
          ? input.getMaterialStates()[category]
          : undefined;
        if (
          !category ||
          !state ||
          state.attachmentObjectKey !== current.object_key
        ) return;
        const action = getMaterialRetryAction(state);
        if (action === "persist") {
          if (state.status === "uploaded") {
            await input.checkpoint(current);
          } else {
            await persistMaterialState(input, current, state);
          }
          return;
        }
        if (state.status === "failed") await input.recognize(current);
      });
    },
    retrySave(requested: WechatPayApplymentAttachment) {
      return run(requested.object_key, async () => {
        const current = findCurrentAttachment(input, requested.object_key);
        if (
          !current ||
          !input.getCheckpointErrors()[current.object_key]
        ) return;
        await input.checkpoint(current);
      });
    },
  };
}

function findCurrentAttachment(
  input: RetryCoordinatorInput,
  objectKey: string,
) {
  return input.getAttachments().find(
    (attachment) => attachment.object_key === objectKey,
  );
}

async function persistMaterialState(
  input: RetryCoordinatorInput,
  attachment: WechatPayApplymentAttachment,
  retryState: ApplymentMaterialState,
) {
  if (input.persistState) {
    await input.persistState(attachment, retryState);
    return;
  }
  if (!input.persist) return;
  const retryingManual = retryState.status === "manual";
  const persistError = retryingManual
    ? MANUAL_ENTRY_PERSIST_ERROR
    : RECOGNITION_PERSIST_ERROR;
  try {
    await input.persist({
      attachments: [...input.getAttachments()],
      draftUpdateSource: retryingManual ? "manual_entry" : "ocr_review",
    });
    commitPersistenceResult(input, attachment, retryState, null);
  } catch {
    commitPersistenceResult(input, attachment, retryState, persistError);
  }
}

function commitPersistenceResult(
  input: RetryCoordinatorInput,
  attachment: WechatPayApplymentAttachment,
  retryState: ApplymentMaterialState,
  error: string | null,
) {
  if (input.isActive && !input.isActive()) return;
  const category = getOcrMaterialCategory(attachment);
  const currentState = category
    ? input.getMaterialStates()[category]
    : undefined;
  if (
    !currentState ||
    currentState.attachmentObjectKey !== attachment.object_key ||
    currentState.status !== retryState.status ||
    currentState.recognitionId !== retryState.recognitionId
  ) return;
  input.commitState?.(attachment, { ...currentState, error });
  if (error) {
    input.reportError?.(error);
  } else if (!input.hasOutstandingErrors?.()) {
    input.clearError?.();
  }
}
