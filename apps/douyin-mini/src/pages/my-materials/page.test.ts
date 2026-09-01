import { expect, mock, test } from "bun:test";

import type { DouyinMaterialNoteOwnedSummary } from "../../models";
import { createMyMaterialsPageDefinition } from "./page";

const item: DouyinMaterialNoteOwnedSummary = {
  claim_id: "22222222-2222-4222-8222-222222222222",
  id: "11111111-1111-4111-8111-111111111111", version: 1,
  title: "开工清单", summary: "逐项确认", category: "施工", applicable_to: "业主",
  claimed_at: "2026-09-01T08:30:00.000Z",
};

test("my materials ignores late modal callbacks and late mutation results", async () => {
  const callbacks: Array<(result: { confirm: boolean }) => void> = [];
  const clearFlight = deferred<void>();
  const clearOwnedMaterials = mock(() => clearFlight.promise);
  const fetchOwnedMaterials = mock(async () => response());
  const toasts: string[] = [];
  const definition = createMyMaterialsPageDefinition({
    getApp: () => ({
      api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined,
    }),
    fetchOwnedMaterials,
    removeOwnedMaterial: mock(async () => undefined),
    clearOwnedMaterials,
    navigateToOwnedMaterialDetail: async () => undefined,
    navigateToPage: async () => undefined,
    showModal: (options: { success(result: { confirm: boolean }): void }) => callbacks.push(options.success),
    showToast: (options: { title: string }) => toasts.push(options.title),
    stopPullDownRefresh: () => undefined,
  } as never);
  const setData = mock((patch: Record<string, unknown>) => Object.assign(definition.data, patch));
  const page = Object.assign(definition, { setData });
  page.onLoad();
  await flush();

  page.onConfirmClear();
  page.onHide();
  callbacks.shift()!({ confirm: true });
  await flush();
  expect(clearOwnedMaterials).not.toHaveBeenCalled();

  page.onShow();
  await flush();
  page.onConfirmClear();
  callbacks.shift()!({ confirm: true });
  callbacks[callbacks.length - 1]?.({ confirm: true });
  expect(clearOwnedMaterials).toHaveBeenCalledTimes(1);
  const loadsBeforeHide = fetchOwnedMaterials.mock.calls.length;
  page.onHide();
  const toastCount = toasts.length;
  clearFlight.resolve();
  await flush();
  expect(fetchOwnedMaterials).toHaveBeenCalledTimes(loadsBeforeHide);
  expect(toasts).toHaveLength(toastCount);
});

test("clear and remove confirmations are single-flight and old callbacks are single-use", async () => {
  const modals: Array<{ success(result: { confirm: boolean }): void }> = [];
  const clearOwnedMaterials = mock(async () => undefined);
  const removeOwnedMaterial = mock(async () => undefined);
  const page = makePage({ modals, clearOwnedMaterials, removeOwnedMaterial });
  page.onLoad();
  await flush();

  page.onConfirmClear();
  page.onConfirmClear();
  expect(modals).toHaveLength(1);
  const clearCallback = modals[0]!.success;
  clearCallback({ confirm: true });
  await flush();
  expect(clearOwnedMaterials).toHaveBeenCalledTimes(1);
  clearCallback({ confirm: true });
  await flush();
  expect(clearOwnedMaterials).toHaveBeenCalledTimes(1);

  page.onConfirmClear();
  expect(modals).toHaveLength(2);
  modals[1]!.success({ confirm: false });
  page.onConfirmClear();
  expect(modals).toHaveLength(3);
  modals[2]!.success({ confirm: false });

  const removeEvent = { currentTarget: { dataset: { claimid: item.claim_id } } };
  page.onConfirmRemove(removeEvent);
  page.onConfirmRemove(removeEvent);
  expect(modals).toHaveLength(4);
  const removeCallback = modals[3]!.success;
  removeCallback({ confirm: true });
  await flush();
  expect(removeOwnedMaterial).toHaveBeenCalledTimes(1);
  removeCallback({ confirm: true });
  await flush();
  expect(removeOwnedMaterial).toHaveBeenCalledTimes(1);
});

test("hide-show waits for pending remove and clear settlement before the latest refresh", async () => {
  for (const command of ["remove", "clear"] as const) {
    const mutation = deferred<void>();
    let serverHasItem = true;
    const modals: Array<{ success(result: { confirm: boolean }): void }> = [];
    const toasts: string[] = [];
    const fetchOwnedMaterials = mock(async () => response(serverHasItem ? [item] : []));
    const removeOwnedMaterial = mock(async () => {
      await mutation.promise;
      serverHasItem = false;
    });
    const clearOwnedMaterials = mock(async () => {
      await mutation.promise;
      serverHasItem = false;
    });
    const navigateToOwnedMaterialDetail = mock(async () => undefined);
    const navigateToPage = mock(async () => undefined);
    const stopPullDownRefresh = mock(() => undefined);
    const page = makePage({
      modals, fetchOwnedMaterials, removeOwnedMaterial, clearOwnedMaterials, toasts,
      navigateToOwnedMaterialDetail, navigateToPage, stopPullDownRefresh,
    });
    page.onLoad();
    await flush();
    if (command === "remove") {
      page.onConfirmRemove({ currentTarget: { dataset: { claimid: item.claim_id } } });
    } else {
      page.onConfirmClear();
    }
    modals[0]!.success({ confirm: true });
    await flush();
    page.onHide();
    page.onShow();
    page.onHide();
    page.onShow();
    await flush();
    expect(page.data.mutating).toBe(true);
    if (command === "remove") {
      page.onConfirmRemove({ currentTarget: { dataset: { claimid: item.claim_id } } });
    } else {
      page.onConfirmClear();
    }
    expect(modals).toHaveLength(1);
    expect(command === "remove" ? removeOwnedMaterial : clearOwnedMaterials)
      .toHaveBeenCalledTimes(1);
    expect(fetchOwnedMaterials).toHaveBeenCalledTimes(1);

    page.onMaterialSelect({ detail: { claimId: item.claim_id } });
    page.onBrowseMaterials();
    page.onPullDownRefresh();
    page.onReachBottom();
    page.onRetry();
    page.onLoadMore();
    await flush();
    expect(navigateToOwnedMaterialDetail).not.toHaveBeenCalled();
    expect(navigateToPage).not.toHaveBeenCalled();
    expect(stopPullDownRefresh).toHaveBeenCalledTimes(1);
    expect(fetchOwnedMaterials).toHaveBeenCalledTimes(1);

    mutation.resolve();
    await flush();
    await flush();
    expect(fetchOwnedMaterials).toHaveBeenCalledTimes(2);
    expect(page.data.items).toEqual([]);
    expect(command === "remove" ? removeOwnedMaterial : clearOwnedMaterials)
      .toHaveBeenCalledTimes(1);
    expect(toasts).toEqual([]);

    page.onMaterialSelect({ detail: { claimId: item.claim_id } });
    expect(navigateToOwnedMaterialDetail).not.toHaveBeenCalled();
    page.onBrowseMaterials();
    expect(navigateToPage).toHaveBeenCalledTimes(1);
  }
});

test("hide-show refreshes after a rejected old mutation without old side effects", async () => {
  for (const command of ["remove", "clear"] as const) {
    const mutation = deferred<void>();
    const modals: Array<{ success(result: { confirm: boolean }): void }> = [];
    const fetchOwnedMaterials = mock(async () => response([item]));
    const removeOwnedMaterial = mock(() => mutation.promise);
    const clearOwnedMaterials = mock(() => mutation.promise);
    const toasts: string[] = [];
    const navigateToOwnedMaterialDetail = mock(async () => undefined);
    const navigateToPage = mock(async () => undefined);
    const stopPullDownRefresh = mock(() => undefined);
    const page = makePage({
      modals, fetchOwnedMaterials, removeOwnedMaterial, clearOwnedMaterials, toasts,
      navigateToOwnedMaterialDetail, navigateToPage, stopPullDownRefresh,
    });
    page.onLoad();
    await flush();
    if (command === "remove") {
      page.onConfirmRemove({ currentTarget: { dataset: { claimid: item.claim_id } } });
    } else {
      page.onConfirmClear();
    }
    modals[0]!.success({ confirm: true });
    page.onHide();
    page.onShow();
    await flush();
    expect(page.data.mutating).toBe(true);
    if (command === "remove") {
      page.onConfirmRemove({ currentTarget: { dataset: { claimid: item.claim_id } } });
    } else {
      page.onConfirmClear();
    }
    expect(modals).toHaveLength(1);
    expect(fetchOwnedMaterials).toHaveBeenCalledTimes(1);
    page.onMaterialSelect({ detail: { claimId: item.claim_id } });
    page.onBrowseMaterials();
    page.onPullDownRefresh();
    page.onReachBottom();
    page.onRetry();
    page.onLoadMore();
    await flush();
    expect(navigateToOwnedMaterialDetail).not.toHaveBeenCalled();
    expect(navigateToPage).not.toHaveBeenCalled();
    expect(stopPullDownRefresh).toHaveBeenCalledTimes(1);
    expect(fetchOwnedMaterials).toHaveBeenCalledTimes(1);
    mutation.reject(new Error(`${command} rejected`));
    await flush();
    await flush();
    expect(fetchOwnedMaterials).toHaveBeenCalledTimes(2);
    expect(page.data.items).toHaveLength(1);
    expect(toasts).toEqual([]);
    expect(page.data.mutating).toBe(false);

    page.onMaterialSelect({ detail: { claimId: item.claim_id } });
    page.onBrowseMaterials();
    expect(navigateToOwnedMaterialDetail).toHaveBeenCalledTimes(1);
    expect(navigateToPage).toHaveBeenCalledTimes(1);
    page.onPullDownRefresh();
    await flush();
    expect(fetchOwnedMaterials).toHaveBeenCalledTimes(3);
    expect(stopPullDownRefresh).toHaveBeenCalledTimes(2);
  }
});

test("unload keeps pending remove and clear globally single-flight without late effects", async () => {
  for (const command of ["remove", "clear"] as const) {
    const mutation = deferred<void>();
    const modals: Array<{ success(result: { confirm: boolean }): void }> = [];
    const fetchOwnedMaterials = mock(async () => response([item]));
    const removeOwnedMaterial = mock(() => mutation.promise);
    const clearOwnedMaterials = mock(() => mutation.promise);
    const toasts: string[] = [];
    const page = makePage({
      modals, fetchOwnedMaterials, removeOwnedMaterial, clearOwnedMaterials, toasts,
    });
    page.onLoad();
    await flush();
    if (command === "remove") {
      page.onConfirmRemove({ currentTarget: { dataset: { claimid: item.claim_id } } });
    } else {
      page.onConfirmClear();
    }
    modals[0]!.success({ confirm: true });
    await flush();
    page.onUnload();
    if (command === "remove") {
      page.onConfirmRemove({ currentTarget: { dataset: { claimid: item.claim_id } } });
    } else {
      page.onConfirmClear();
    }
    expect(modals).toHaveLength(1);
    expect(command === "remove" ? removeOwnedMaterial : clearOwnedMaterials)
      .toHaveBeenCalledTimes(1);
    const fetchCount = fetchOwnedMaterials.mock.calls.length;
    mutation.resolve();
    await flush();
    expect(fetchOwnedMaterials).toHaveBeenCalledTimes(fetchCount);
    expect(toasts).toEqual([]);
  }
});

test("a failed authoritative refresh releases reconcile lock and exposes retry", async () => {
  const mutation = deferred<void>();
  let fetchCalls = 0;
  const fetchOwnedMaterials = mock(async () => {
    fetchCalls += 1;
    if (fetchCalls === 2) throw new Error("refresh failed");
    return response([item]);
  });
  const modals: Array<{ success(result: { confirm: boolean }): void }> = [];
  const page = makePage({
    modals,
    fetchOwnedMaterials,
    clearOwnedMaterials: mock(() => mutation.promise),
  });
  page.onLoad();
  await flush();
  page.onConfirmClear();
  modals[0]!.success({ confirm: true });
  page.onHide();
  page.onShow();
  mutation.resolve();
  await flush();
  await flush();

  expect(page.data.mutating).toBe(false);
  expect(page.data.firstError).toBe(true);
  page.onRetry();
  await flush();
  expect(fetchOwnedMaterials).toHaveBeenCalledTimes(3);
  expect(page.data.firstError).toBe(false);
});

function makePage(options: {
  modals: Array<{ success(result: { confirm: boolean }): void }>;
  fetchOwnedMaterials?: ReturnType<typeof mock>;
  removeOwnedMaterial?: ReturnType<typeof mock>;
  clearOwnedMaterials?: ReturnType<typeof mock>;
  toasts?: string[];
  navigateToOwnedMaterialDetail?: (claimId: string) => Promise<void>;
  navigateToPage?: (path: string) => Promise<void>;
  stopPullDownRefresh?: () => void;
}) {
  const definition = createMyMaterialsPageDefinition({
    getApp: () => ({
      api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined,
    }),
    fetchOwnedMaterials: options.fetchOwnedMaterials ?? mock(async () => response([item])),
    removeOwnedMaterial: options.removeOwnedMaterial ?? mock(async () => undefined),
    clearOwnedMaterials: options.clearOwnedMaterials ?? mock(async () => undefined),
    navigateToOwnedMaterialDetail: options.navigateToOwnedMaterialDetail
      ?? (async () => undefined),
    navigateToPage: options.navigateToPage ?? (async () => undefined),
    showModal: (modal: { success(result: { confirm: boolean }): void }) => {
      options.modals.push(modal);
    },
    showToast: (toast: { title: string }) => options.toasts?.push(toast.title),
    stopPullDownRefresh: options.stopPullDownRefresh ?? (() => undefined),
  } as never);
  const setData = mock((patch: Record<string, unknown>) => Object.assign(definition.data, patch));
  return Object.assign(definition, { setData });
}

function response(list: DouyinMaterialNoteOwnedSummary[] = [item]) {
  return {
    list,
    pagination: {
      page: 1, pageSize: 20, total: list.length, totalPages: list.length ? 1 : 0,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
