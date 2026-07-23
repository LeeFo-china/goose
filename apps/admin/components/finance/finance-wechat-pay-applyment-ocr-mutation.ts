import {
  createMaterialOperationGeneration,
  runAttachmentCheckpoint,
} from "./finance-wechat-pay-applyment-checkpoint";

export function createOcrReviewMutationGeneration() {
  const runtime = createMaterialOperationGeneration();
  let activeGeneration: number | null = null;
  return {
    current: () => activeGeneration ?? runtime.current(),
    isCurrent: (generation: number) =>
      activeGeneration === generation && runtime.isCurrent(generation),
    activate() {
      activeGeneration = runtime.advance();
      return activeGeneration;
    },
    invalidate(generation: number) {
      if (activeGeneration !== generation) return;
      runtime.advance();
      activeGeneration = null;
    },
  };
}

export function setupOcrReviewMutationGeneration(
  runtime: ReturnType<typeof createOcrReviewMutationGeneration>,
) {
  const generation = runtime.activate();
  return () => runtime.invalidate(generation);
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
