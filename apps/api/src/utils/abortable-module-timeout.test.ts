import { describe, expect, mock, test } from "bun:test";
import { AppError } from "@/errors/app-error";
import { withAbortableModuleTimeout } from "./abortable-module-timeout";

describe("withAbortableModuleTimeout", () => {
  test("returns a loader result before the deadline", async () => {
    const result = await withAbortableModuleTimeout({
      module: "logs",
      timeoutMs: 20,
      cancelSupported: true,
      load: async (signal) => ({ signal, value: "ok" }),
    });

    expect(result.value).toBe("ok");
    expect(result.signal.aborted).toBe(false);
  });

  test("forwards a loader error", async () => {
    const failure = new AppError(500, "query failed", "DB_ERROR");

    await expect(withAbortableModuleTimeout({
      module: "logs",
      timeoutMs: 20,
      cancelSupported: true,
      load: async () => { throw failure; },
    })).rejects.toBe(failure);
  });

  test("aborts the loader and reports cancellation support on timeout", async () => {
    const onAbort = mock(() => undefined);

    await expect(withAbortableModuleTimeout({
      module: "acceptances",
      timeoutMs: 5,
      cancelSupported: true,
      load: (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          onAbort();
          reject(signal.reason);
        }, { once: true });
      }),
    })).rejects.toMatchObject({
      statusCode: 504,
      details: {
        module: "acceptances",
        timeout_ms: 5,
        cancel_supported: true,
      },
    });
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  test("clears the timer after a successful load", async () => {
    let loaderSignal: AbortSignal | undefined;
    await withAbortableModuleTimeout({
      module: "customer_service",
      timeoutMs: 5,
      cancelSupported: false,
      load: async (signal) => {
        loaderSignal = signal;
        return null;
      },
    });

    await Bun.sleep(10);
    expect(loaderSignal?.aborted).toBe(false);
  });

  test("handles a loader rejection that arrives after timeout", async () => {
    const unhandled = mock((_reason: unknown) => undefined);
    const listener = (reason: unknown) => unhandled(reason);
    process.on("unhandledRejection", listener);

    try {
      await expect(withAbortableModuleTimeout({
        module: "campaign_summary",
        timeoutMs: 2,
        cancelSupported: false,
        load: async () => {
          await Bun.sleep(8);
          throw new AppError(500, "late failure", "DB_ERROR");
        },
      })).rejects.toMatchObject({ statusCode: 504 });
      await Bun.sleep(12);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", listener);
    }
  });
});
