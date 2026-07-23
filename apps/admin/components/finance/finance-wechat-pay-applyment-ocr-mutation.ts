import {
  createMaterialOperationGeneration,
  runAttachmentCheckpoint,
} from "./finance-wechat-pay-applyment-checkpoint";

export function createOcrReviewMutationGeneration(initialResetKey: string) {
  let resetKey = initialResetKey;
  const runtime = createMaterialOperationGeneration();
  return {
    current: runtime.current,
    isCurrent: runtime.isCurrent,
    sync(nextResetKey: string) {
      if (nextResetKey === resetKey) return runtime.current();
      resetKey = nextResetKey;
      return runtime.advance();
    },
  };
}

export function runGenerationGuardedOcrReviewMutation(input: {
  generation: number;
  isCurrentGeneration: (generation: number) => boolean;
  mutate: () => Promise<void>;
  fallbackMessage: string;
  onError: (message: string) => void;
}) {
  return runAttachmentCheckpoint({
    generation: input.generation,
    isCurrent: input.isCurrentGeneration,
    persist: input.mutate,
    onFailed: (error) => {
      input.onError(
        error instanceof Error ? error.message : input.fallbackMessage,
      );
    },
    onPersisted: () => undefined,
  });
}
