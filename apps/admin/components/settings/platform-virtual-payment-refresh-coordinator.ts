type LatestRefreshHandlers<T> = {
  onSuccess: (value: T) => void;
  onError: () => void;
};

export function createLatestRefreshCoordinator() {
  let generation = 0;
  let latestPromise: Promise<boolean> = Promise.resolve(false);

  function run<T>(
    request: () => Promise<T>,
    handlers: LatestRefreshHandlers<T>,
  ): Promise<boolean> {
    const currentGeneration = ++generation;
    let operation!: Promise<boolean>;

    operation = (async () => {
      try {
        const value = await request();
        if (currentGeneration === generation) {
          handlers.onSuccess(value);
          return true;
        }
      } catch {
        if (currentGeneration === generation) {
          handlers.onError();
          return false;
        }
      }

      const latestOperation = latestPromise;
      if (latestOperation === operation) return false;
      return latestOperation;
    })();

    latestPromise = operation;
    return operation;
  }

  function invalidate() {
    generation += 1;
    latestPromise = Promise.resolve(false);
  }

  return { invalidate, run };
}
