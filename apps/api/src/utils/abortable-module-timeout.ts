import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";

type AbortableModuleTimeoutOptions<Value> = {
  module: string;
  timeoutMs: number;
  cancelSupported: boolean;
  load: (signal: AbortSignal) => Promise<Value> | Value;
};

export function withAbortableModuleTimeout<Value>(
  options: AbortableModuleTimeoutOptions<Value>,
): Promise<Value> {
  const controller = new AbortController();

  return new Promise<Value>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (settled) return;
      settled = true;
      timeout = null;
      const error = Errors.business(
        504,
        `${options.module} 模块加载超时`,
        ErrorCodes.INTERNAL_ERROR,
        {
          module: options.module,
          timeout_ms: options.timeoutMs,
          cancel_supported: options.cancelSupported,
        },
      );
      reject(error);
      controller.abort(error);
    }, options.timeoutMs);

    Promise.resolve()
      .then(() => options.load(controller.signal))
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        },
      )
      .finally(() => {
        if (timeout) clearTimeout(timeout);
        timeout = null;
      });
  });
}
