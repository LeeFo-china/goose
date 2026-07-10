type CancellableSqlQuery<Value> = PromiseLike<Value> & {
  cancel: () => unknown;
};

export async function executeCancellableSqlQuery<Value>(
  query: CancellableSqlQuery<Value>,
  signal?: AbortSignal,
): Promise<Value> {
  if (!signal) return await query;
  if (signal.aborted) {
    query.cancel();
    signal.throwIfAborted();
  }

  return await new Promise<Value>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", cancelQuery);
    const cancelQuery = () => {
      cleanup();
      try {
        query.cancel();
        reject(signal.reason);
      } catch (error) {
        reject(error);
      }
    };
    signal.addEventListener("abort", cancelQuery, { once: true });
    Promise.resolve(query).then(
      (value) => { cleanup(); resolve(value); },
      (error) => { cleanup(); reject(error); },
    );
  });
}
