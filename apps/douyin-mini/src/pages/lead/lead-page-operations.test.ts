import { describe, expect, mock, test } from "bun:test";

import { LeadPageCoordinator } from "./lead-page-coordinator";
import { runPolicyNavigation, runPrivacyPolicyRefresh } from "./lead-page-operations";

describe("lead page async operations", () => {
  test("a stale privacy mismatch cannot start refresh or mutate a newer submit", async () => {
    const lifecycle = visibleCoordinator();
    const stale = lifecycle.beginSubmit()!;
    lifecycle.onHide();
    lifecycle.onShow();
    const current = lifecycle.beginSubmit()!;
    const refresh = mock(async () => ({ version: "v2" }));
    const setData = mock((_value: string) => undefined);

    await runPrivacyPolicyRefresh({
      coordinator: lifecycle,
      authority: stale,
      refresh,
      onPending: () => setData("pending"),
      onSuccess: () => setData("success"),
      onFailure: () => setData("failure"),
    });

    expect(refresh).not.toHaveBeenCalled();
    expect(setData).not.toHaveBeenCalled();
    expect(lifecycle.beginSubmit()).toBeNull();
    expect(lifecycle.finishSubmit(current)).toBe(true);
  });

  test("a hidden privacy refresh resolution cannot write or unlock a newer submit", async () => {
    const lifecycle = visibleCoordinator();
    const stale = lifecycle.beginSubmit()!;
    const refresh = deferred<{ version: string } | null>();
    const setData = mock((_value: string) => undefined);
    const operation = runPrivacyPolicyRefresh({
      coordinator: lifecycle,
      authority: stale,
      refresh: () => refresh.promise,
      onPending: () => setData("pending"),
      onSuccess: () => setData("success"),
      onFailure: () => setData("failure"),
    });
    expect(setData).toHaveBeenCalledTimes(1);
    setData.mockClear();

    lifecycle.onHide();
    lifecycle.onShow();
    const current = lifecycle.beginSubmit()!;
    refresh.resolve({ version: "v2" });
    await operation;

    expect(setData).not.toHaveBeenCalled();
    expect(lifecycle.beginSubmit()).toBeNull();
    expect(lifecycle.finishSubmit(current)).toBe(true);
  });

  test("an unloaded privacy refresh rejection has zero late writes", async () => {
    const lifecycle = visibleCoordinator();
    const refresh = deferred<{ version: string } | null>();
    const setData = mock((_value: string) => undefined);
    const operation = runPrivacyPolicyRefresh({
      coordinator: lifecycle,
      authority: lifecycle.beginSubmit()!,
      refresh: () => refresh.promise,
      onPending: () => setData("pending"),
      onSuccess: () => setData("success"),
      onFailure: () => setData("failure"),
    });
    expect(setData).toHaveBeenCalledTimes(1);
    setData.mockClear();

    lifecycle.onUnload();
    refresh.reject(new Error("refresh failed"));
    await operation;

    expect(setData).not.toHaveBeenCalled();
  });

  test("a current privacy refresh presents its resolved result once", async () => {
    const lifecycle = visibleCoordinator();
    const refresh = deferred<{ version: string } | null>();
    const setData = mock((_value: string) => undefined);
    const operation = runPrivacyPolicyRefresh({
      coordinator: lifecycle,
      authority: lifecycle.beginSubmit()!,
      refresh: () => refresh.promise,
      onPending: () => setData("pending"),
      onSuccess: ({ version }) => setData(version),
      onFailure: () => setData("failure"),
    });
    refresh.resolve({ version: "v2" });
    await operation;

    expect(setData.mock.calls.map(([value]) => value)).toEqual(["pending", "v2"]);
    expect(lifecycle.beginSubmit()).not.toBeNull();
  });

  test("a current privacy refresh rejection presents one failure", async () => {
    const lifecycle = visibleCoordinator();
    const refresh = deferred<{ version: string } | null>();
    const setData = mock((_value: string) => undefined);
    const operation = runPrivacyPolicyRefresh({
      coordinator: lifecycle,
      authority: lifecycle.beginSubmit()!,
      refresh: () => refresh.promise,
      onPending: () => setData("pending"),
      onSuccess: () => setData("success"),
      onFailure: () => setData("failure"),
    });
    refresh.reject(new Error("refresh failed"));
    await operation;

    expect(setData.mock.calls.map(([value]) => value)).toEqual(["pending", "failure"]);
    expect(lifecycle.beginSubmit()).not.toBeNull();
  });

  test("a stale policy rejection cannot write or unlock a newer navigation", async () => {
    const lifecycle = visibleCoordinator();
    const navigation = deferred<void>();
    const navigate = mock(() => navigation.promise);
    const setData = mock(() => undefined);
    const operation = runPolicyNavigation({
      coordinator: lifecycle,
      navigate,
      onFailure: setData,
    });
    lifecycle.onHide();
    lifecycle.onShow();
    const current = lifecycle.beginPolicyNavigation()!;
    navigation.reject(new Error("navigation failed"));
    await operation;

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(setData).not.toHaveBeenCalled();
    expect(lifecycle.beginPolicyNavigation()).toBeNull();
    expect(lifecycle.finishPolicyNavigation(current)).toBe(true);
  });

  test("a current policy rejection writes once and releases its lock", async () => {
    const lifecycle = visibleCoordinator();
    const navigation = deferred<void>();
    const navigate = mock(() => navigation.promise);
    const setData = mock(() => undefined);
    const operation = runPolicyNavigation({
      coordinator: lifecycle,
      navigate,
      onFailure: setData,
    });
    navigation.reject(new Error("navigation failed"));
    await operation;

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(setData).toHaveBeenCalledTimes(1);
    expect(lifecycle.beginPolicyNavigation()).not.toBeNull();
  });
});

function visibleCoordinator(): LeadPageCoordinator {
  const lifecycle = new LeadPageCoordinator();
  lifecycle.onShow();
  return lifecycle;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}
