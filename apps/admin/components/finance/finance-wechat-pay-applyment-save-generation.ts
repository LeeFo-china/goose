export type ApplymentSaveGenerationContext = {
  isCurrent: () => boolean;
};

export function reportGenerationGuardedError(input: {
  generation: number;
  isCurrent: (generation: number) => boolean;
  error: unknown;
  report: (error: unknown) => void;
}) {
  if (!input.isCurrent(input.generation)) return false;
  input.report(input.error);
  return true;
}

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
