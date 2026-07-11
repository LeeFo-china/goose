export type BodyReadSuccess = { readonly status: "ok"; readonly bytes: Uint8Array };
export type BodyReadResult = BodyReadSuccess | { readonly status: "too_large" };

export function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: undefined,
  signal?: AbortSignal,
): Promise<BodyReadSuccess>;
export function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<BodyReadResult>;
export async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes?: number,
  signal?: AbortSignal,
): Promise<BodyReadResult> {
  if (!body) return { status: "ok", bytes: new Uint8Array() };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let rejectOnAbort: ((reason?: unknown) => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectOnAbort = reject;
  });
  const handleAbort = () => {
    rejectOnAbort?.(signal?.reason);
    void reader.cancel(signal?.reason).catch(() => undefined);
  };
  signal?.addEventListener("abort", handleAbort, { once: true });

  try {
    while (true) {
      if (signal?.aborted) throw signal.reason;
      const { done, value } = await (signal
        ? Promise.race([reader.read(), aborted])
        : reader.read());
      if (done) break;
      byteLength += value.byteLength;
      if (maxBytes !== undefined && byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: "too_large" };
      }
      chunks.push(value);
    }
  } finally {
    signal?.removeEventListener("abort", handleAbort);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { status: "ok", bytes };
}

export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
