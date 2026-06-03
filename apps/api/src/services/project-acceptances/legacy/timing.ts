export type ProjectAcceptanceTimingSteps = Record<string, number>;

export async function measureProjectAcceptanceTiming<T>(
  steps: ProjectAcceptanceTimingSteps | undefined,
  key: string,
  callback: () => Promise<T> | T,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await callback();
  } finally {
    if (steps) {
      steps[key] = (steps[key] || 0) + Date.now() - startedAt;
    }
  }
}
