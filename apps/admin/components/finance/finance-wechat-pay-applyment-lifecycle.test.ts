import { describe, expect, test } from "bun:test";
import {
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
});
