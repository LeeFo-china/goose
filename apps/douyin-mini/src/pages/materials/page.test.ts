import { describe, expect, mock, test } from "bun:test";

import type { DouyinMaterialNotePreview } from "../../models";
import { createMaterialsPageDefinition } from "./page";

const first: DouyinMaterialNotePreview = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "旧资料", summary: "旧结果", category: "清单", applicable_to: "业主",
  published_at: "2026-09-01T08:00:00.000Z", claimed: false,
};
const second = { ...first, id: "22222222-2222-4222-8222-222222222222", title: "新资料" };

test("materials controller ignores an old list response after hide-show", async () => {
  const staleFlight = deferred<ReturnType<typeof pageResponse>>();
  const currentFlight = deferred<ReturnType<typeof pageResponse>>();
  const flights = [staleFlight, currentFlight];
  const fetchMaterials = mock(() => flights.shift()!.promise);
  const definition = createMaterialsPageDefinition({
    getApp: () => ({
      api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: mock(() => undefined),
    }),
    fetchMaterials,
    navigateToMaterialDetail: async () => undefined,
    navigateToPage: async () => undefined,
    showToast: () => undefined,
    stopPullDownRefresh: () => undefined,
  } as never);
  const setData = mock((patch: Record<string, unknown>) => Object.assign(definition.data, patch));
  const page = Object.assign(definition, { setData });

  page.onLoad();
  await flush();
  page.onHide();
  page.onShow();
  await flush();
  currentFlight.resolve(pageResponse([second]));
  await flush();
  expect(page.data.items.map((item) => item.id)).toEqual([second.id]);
  const writesAfterCurrent = setData.mock.calls.length;

  staleFlight.resolve(pageResponse([first]));
  await flush();
  expect(page.data.items.map((item) => item.id)).toEqual([second.id]);
  expect(setData).toHaveBeenCalledTimes(writesAfterCurrent);
  expect(fetchMaterials).toHaveBeenCalledTimes(2);
});

function pageResponse(list: DouyinMaterialNotePreview[] = []) {
  return { list, pagination: { page: 1, pageSize: 20, total: list.length, totalPages: list.length ? 1 : 0 } };
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
