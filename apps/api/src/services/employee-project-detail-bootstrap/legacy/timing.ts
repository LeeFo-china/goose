import { OPTIONAL_MODULE_TIMEOUT_MS } from "./shared";
import type {
  BootstrapTimingStep,
  EmployeeProjectDetailBootstrapTimings,
  PartialError,
} from "./shared";

export async function loadOptional<T>(this: any, 
  module: string,
  loader: () => Promise<T>,
  fallback: T,
  partialErrors: PartialError[],
  timings: EmployeeProjectDetailBootstrapTimings,
  step: BootstrapTimingStep,
) {
  try {
    return await this.measure(step, timings, () =>
      this.withTimeout(module, loader(), OPTIONAL_MODULE_TIMEOUT_MS)
    );
  } catch (error) {
    partialErrors.push(this.toPartialError(module, error));
    return fallback;
  }
}

export function createEmptyTimings(this: any, ): EmployeeProjectDetailBootstrapTimings {
  return {
    bootstrap_data_ms: 0,
    project_ms: 0,
    permissions_ms: 0,
    members_ms: 0,
    status_actions_ms: 0,
    construction_stages_ms: 0,
    logs_ms: 0,
    calendar_ms: 0,
  };
}

export async function measure<T>(this: any, 
  step: BootstrapTimingStep,
  timings: EmployeeProjectDetailBootstrapTimings,
  loader: () => Promise<T>,
) {
  const startedAt = Date.now();
  try {
    return await loader();
  } finally {
    timings[step] = Date.now() - startedAt;
  }
}

export function withTimeout<T>(this: any, 
  module: string,
  promise: Promise<T>,
  timeoutMs: number,
) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${module} 模块加载超过 ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

export function toPartialError(this: any, module: string, error: unknown): PartialError {
  const value = error as { code?: unknown; message?: unknown };

  return {
    module,
    code: typeof value.code === "string" ? value.code : null,
    message: typeof value.message === "string" ? value.message : "模块加载失败",
  };
}
