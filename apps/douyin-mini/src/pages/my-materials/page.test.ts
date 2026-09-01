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

function response() {
  return { list: [item], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
