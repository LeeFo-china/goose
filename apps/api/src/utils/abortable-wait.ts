import { Errors } from "@/errors/error-factory";

export function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw Errors.business(504, "操作已超时或取消", "OPERATION_ABORTED");
}

/** Bounds waiting even when the underlying read/transport ignores cancellation. */
export function waitForSignal<Value>(operation: PromiseLike<Value>, signal?: AbortSignal): Promise<Value> {
  if (!signal) return Promise.resolve(operation);
  return new Promise<Value>((resolve, reject) => {
    const abort = () => reject(Errors.business(504, "操作已超时或取消", "OPERATION_ABORTED"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(operation).then(
      (value) => { if (signal.aborted) abort(); else resolve(value); },
      reject,
    ).finally(() => signal.removeEventListener("abort", abort));
  });
}
