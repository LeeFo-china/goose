import {
  getOcrMaterialCategory,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import type { WechatPayApplymentAttachment } from "./finance-wechat-pay-applyment-shared";

export const ATTACHMENT_CHECKPOINT_ERROR = "附件保存失败";

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
