import {
  getOcrMaterialCategory,
  getOcrMaterialDocumentType,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import type { WechatPayApplymentAttachment } from "./finance-wechat-pay-applyment-shared";

export const ATTACHMENT_CHECKPOINT_ERROR = "附件保存失败";
export type AttachmentCheckpointErrorMap = Readonly<Record<string, string>>;
export type AttachmentChangeCheckpointSnapshot = {
  attachments: WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
  checkpointErrors: AttachmentCheckpointErrorMap;
  unpersistedObjectKeys: Set<string>;
};

export function createAttachmentChangeCheckpointSnapshot(input: {
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
  checkpointErrors: AttachmentCheckpointErrorMap;
  unpersistedObjectKeys: ReadonlySet<string>;
}): AttachmentChangeCheckpointSnapshot {
  return {
    attachments: input.attachments.map((attachment) => ({ ...attachment })),
    materialStates: { ...input.materialStates },
    checkpointErrors: { ...input.checkpointErrors },
    unpersistedObjectKeys: new Set(input.unpersistedObjectKeys),
  };
}

export function restoreAttachmentChangeCheckpointSnapshot(input: {
  snapshot: AttachmentChangeCheckpointSnapshot;
  unpersistedObjectKeys: Set<string>;
  commitLocal: (
    attachments: WechatPayApplymentAttachment[],
    states: ApplymentMaterialStateMap,
  ) => void;
  commitCheckpointErrors: (errors: AttachmentCheckpointErrorMap) => void;
}) {
  input.commitLocal(
    input.snapshot.attachments.map((attachment) => ({ ...attachment })),
    { ...input.snapshot.materialStates },
  );
  input.unpersistedObjectKeys.clear();
  for (const objectKey of input.snapshot.unpersistedObjectKeys) {
    input.unpersistedObjectKeys.add(objectKey);
  }
  input.commitCheckpointErrors({ ...input.snapshot.checkpointErrors });
}

export function setAttachmentCheckpointError(
  errors: AttachmentCheckpointErrorMap,
  objectKey: string,
  error: string,
): AttachmentCheckpointErrorMap {
  return { ...errors, [objectKey]: error };
}

export function clearAttachmentCheckpointError(
  errors: AttachmentCheckpointErrorMap,
  objectKey: string,
): AttachmentCheckpointErrorMap {
  if (!(objectKey in errors)) return errors;
  const nextErrors = { ...errors };
  delete nextErrors[objectKey];
  return nextErrors;
}

export function retainAttachmentCheckpointErrors(
  errors: AttachmentCheckpointErrorMap,
  attachments: readonly WechatPayApplymentAttachment[],
): AttachmentCheckpointErrorMap {
  const currentKeys = new Set(
    attachments.map((attachment) => attachment.object_key),
  );
  return Object.fromEntries(
    Object.entries(errors).filter(([objectKey]) => currentKeys.has(objectKey)),
  );
}

export async function continueAfterAttachmentCheckpoint(input: {
  attachment: WechatPayApplymentAttachment;
  supportedDocumentTypes: ReadonlySet<string>;
  isActive: () => boolean;
  hasRecognitionConsent: () => boolean;
  markUnsupportedManual: () => Promise<void>;
  recognize: () => Promise<void>;
}) {
  if (!input.isActive()) return;
  const documentType = getOcrMaterialDocumentType(input.attachment);
  if (!documentType) return;
  if (!input.supportedDocumentTypes.has(documentType)) {
    await input.markUnsupportedManual();
    return;
  }
  if (input.isActive() && input.hasRecognitionConsent()) {
    await input.recognize();
  }
}

export async function checkpointApplymentAttachment(input: {
  attachment: WechatPayApplymentAttachment;
  generation: number;
  isCurrent: (generation: number) => boolean;
  isCurrentAttachment: (
    attachment: WechatPayApplymentAttachment,
  ) => boolean;
  persist: () => Promise<void>;
  getErrors: () => AttachmentCheckpointErrorMap;
  commitErrors: (errors: AttachmentCheckpointErrorMap) => void;
  removeUnpersisted: (objectKey: string) => void;
  hasOutstandingErrors: () => boolean;
  reportError: (message: string) => void;
  capabilityLoading: boolean;
  supportedDocumentTypes: ReadonlySet<string>;
  hasRecognitionConsent: () => boolean;
  markUnsupportedManual: () => Promise<void>;
  recognize: () => Promise<void>;
}) {
  return runAttachmentCheckpoint({
    generation: input.generation,
    isCurrent: input.isCurrent,
    persist: input.persist,
    onFailed: () => {
      input.commitErrors(setAttachmentCheckpointError(
        input.getErrors(),
        input.attachment.object_key,
        ATTACHMENT_CHECKPOINT_ERROR,
      ));
      input.reportError(ATTACHMENT_CHECKPOINT_ERROR);
    },
    onPersisted: async () => {
      input.removeUnpersisted(input.attachment.object_key);
      input.commitErrors(clearAttachmentCheckpointError(
        input.getErrors(),
        input.attachment.object_key,
      ));
      if (!input.hasOutstandingErrors()) input.reportError("");
      if (input.capabilityLoading) return;
      await continueAfterAttachmentCheckpoint({
        attachment: input.attachment,
        supportedDocumentTypes: input.supportedDocumentTypes,
        isActive: () =>
          input.isCurrent(input.generation) &&
          input.isCurrentAttachment(input.attachment),
        hasRecognitionConsent: input.hasRecognitionConsent,
        markUnsupportedManual: input.markUnsupportedManual,
        recognize: input.recognize,
      });
    },
  });
}

export function retainUnpersistedAttachmentKeys(
  unpersistedObjectKeys: Set<string>,
  attachments: readonly WechatPayApplymentAttachment[],
) {
  const currentKeys = new Set(
    attachments.map((attachment) => attachment.object_key),
  );
  for (const objectKey of unpersistedObjectKeys) {
    if (!currentKeys.has(objectKey)) unpersistedObjectKeys.delete(objectKey);
  }
}

export function replaceCurrentMaterialError(input: {
  materialStates: ApplymentMaterialStateMap;
  attachment: WechatPayApplymentAttachment;
  error: string | null;
}): ApplymentMaterialStateMap {
  const category = getOcrMaterialCategory(input.attachment);
  const currentState = category
    ? input.materialStates[category]
    : undefined;
  if (
    !category ||
    currentState?.attachmentObjectKey !== input.attachment.object_key
  ) return input.materialStates;
  return {
    ...input.materialStates,
    [category]: { ...currentState, error: input.error },
  };
}

export function hasMaterialErrors(materialStates: ApplymentMaterialStateMap) {
  return Object.values(materialStates).some((state) => Boolean(state?.error));
}

export function createMaterialOperationGeneration() {
  let generation = 0;
  return {
    current: () => generation,
    advance: () => {
      generation += 1;
      return generation;
    },
    isCurrent: (candidate: number) => candidate === generation,
  };
}

export type AttachmentCheckpointOutcome =
  | { type: "persisted" }
  | { type: "persist_failed"; error: unknown }
  | { type: "stale" };

export async function runAttachmentCheckpoint(input: {
  generation: number;
  isCurrent: (generation: number) => boolean;
  persist: () => Promise<void>;
  onFailed: (error: unknown) => void;
  onPersisted: () => void | Promise<void>;
}): Promise<AttachmentCheckpointOutcome> {
  if (!input.isCurrent(input.generation)) return { type: "stale" };
  try {
    await input.persist();
  } catch (error) {
    if (!input.isCurrent(input.generation)) return { type: "stale" };
    input.onFailed(error);
    return { type: "persist_failed", error };
  }
  if (!input.isCurrent(input.generation)) return { type: "stale" };
  await input.onPersisted();
  return input.isCurrent(input.generation)
    ? { type: "persisted" }
    : { type: "stale" };
}
