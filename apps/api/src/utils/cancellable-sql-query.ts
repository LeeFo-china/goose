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

  const cancelQuery = () => query.cancel();
  signal.addEventListener("abort", cancelQuery, { once: true });
  try {
    return await query;
  } finally {
    signal.removeEventListener("abort", cancelQuery);
  }
}
