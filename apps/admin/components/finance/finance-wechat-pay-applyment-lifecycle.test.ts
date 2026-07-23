import { describe, expect, test } from "bun:test";
import {
  createApplymentAutosavePageLifecycle,
  setupMountedRefLifecycle,
} from "./finance-wechat-pay-applyment-lifecycle";

describe("wechat pay applyment mounted lifecycle", () => {
  test("reactivates state updates after a Strict Mode setup replay", () => {
    const mountedRef = { current: false };
    let cleanupCalls = 0;

    const firstCleanup = setupMountedRefLifecycle(
      mountedRef,
      () => cleanupCalls += 1,
    );
    expect(mountedRef.current).toBe(true);
    firstCleanup();
    expect(mountedRef.current).toBe(false);

    const secondCleanup = setupMountedRefLifecycle(
      mountedRef,
      () => cleanupCalls += 1,
    );
    expect(mountedRef.current).toBe(true);
    expect(cleanupCalls).toBe(1);

    secondCleanup();
    expect(mountedRef.current).toBe(false);
    expect(cleanupCalls).toBe(2);
  });

  test("keeps the runtime through BFCache and detaches only on a real leave", async () => {
    const mountedRef = { current: false };
    const saves: string[] = [];
    const lifecycleEvents: string[] = [];
    let latestPayload = "before-bfcache";
    const lifecycle = createApplymentAutosavePageLifecycle({
      mountedRef,
      flush: async () => {
        saves.push(latestPayload);
      },
      detach: async () => {
        lifecycleEvents.push("detach");
      },
      restore: () => {
        lifecycleEvents.push("restore");
      },
    });

    lifecycle.mount();
    await lifecycle.pageHide({ persisted: true });
    expect(mountedRef.current).toBe(true);
    expect(saves).toEqual(["before-bfcache"]);
    expect(lifecycleEvents).toEqual([]);

    lifecycle.pageShow({ persisted: true });
    expect(mountedRef.current).toBe(true);
    expect(lifecycleEvents).toEqual(["restore"]);

    latestPayload = "after-restore";
    await lifecycle.pageHide({ persisted: true });
    lifecycle.pageShow({ persisted: true });
    expect(saves).toEqual(["before-bfcache", "after-restore"]);
    expect(lifecycleEvents).toEqual(["restore", "restore"]);

    await lifecycle.pageHide({ persisted: false });
    expect(mountedRef.current).toBe(false);
    expect(lifecycleEvents).toEqual(["restore", "restore", "detach"]);

    lifecycle.pageShow({ persisted: true });
    await lifecycle.unmount();
    expect(mountedRef.current).toBe(false);
    expect(lifecycleEvents).toEqual(["restore", "restore", "detach"]);
  });
});
