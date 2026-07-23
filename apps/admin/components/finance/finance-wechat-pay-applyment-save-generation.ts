export type ApplymentSaveGenerationContext = {
  isCurrent: () => boolean;
};

export async function runGenerationGuardedSave<T>(input: {
  request: () => Promise<T>;
  isCurrent: () => boolean;
  commit: (result: T) => void;
}) {
  const result = await input.request();
  if (!input.isCurrent()) return { type: "stale" as const, result };
  input.commit(result);
  return { type: "current" as const, result };
}
