import { expect, mock, test } from "bun:test";

import type { DouyinMaterialNotePreview } from "../../models";
import { createHomePageDefinition } from "./page";

const note = (index: number): DouyinMaterialNotePreview => ({
  id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
  title: `资料${index}`, summary: "摘要", category: "清单", applicable_to: "业主",
  published_at: "2026-09-01T08:00:00.000Z", claimed: false,
});

test("home requests four materials and keeps material failure local", async () => {
  const fetchMaterials = mock(async (_api, query) => {
    expect(query).toEqual({ page: 1, pageSize: 4 });
    throw new Error("local failure");
  });
  const page = makePage(fetchMaterials);
  await page.load();
  await flush();
  expect(page.data.loading).toBe(false);
  expect(page.data.error).toBe(false);
  expect(page.data.materialStatus).toBe("error");
  expect(fetchMaterials).toHaveBeenCalledTimes(1);
});

test("home keeps its global state healthy when no public materials are available", async () => {
  const page = makePage(mock(async () => response([])));
  await page.load();
  await flush();
  expect(page.data.error).toBe(false);
  expect(page.data.materialStatus).toBe("empty");
  expect(page.data.materialItems).toEqual([]);
});

test("home caps the module at four and ignores its old response after hide-show", async () => {
  const staleFlight = deferred<ReturnType<typeof response>>();
  const currentFlight = deferred<ReturnType<typeof response>>();
  const flights = [staleFlight, currentFlight];
  const fetchMaterials = mock(() => flights.shift()!.promise);
  const page = makePage(fetchMaterials);
  await page.load();
  await flush();
  page.onHide();
  page.onShow();
  await flush();
  currentFlight.resolve(response([note(6)]));
  await flush();
  expect(page.data.materialItems.map((item) => item.id)).toEqual([note(6).id]);
  const writes = page.setData.mock.calls.length;
  staleFlight.resolve(response([note(1), note(2), note(3), note(4), note(5)]));
  await flush();
  expect(page.data.materialItems.map((item) => item.id)).toEqual([note(6).id]);
  expect(page.setData).toHaveBeenCalledTimes(writes);
});

function makePage(fetchMaterials: ReturnType<typeof mock>) {
  const definition = createHomePageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve(bootstrap()), recordAnalytics: () => undefined }),
    fetchMaterials,
    navigateToEntityDetail: async () => undefined,
    navigateToMaterialDetail: async () => undefined,
    navigateToPage: async () => undefined,
    switchToTab: async () => undefined,
    showToast: () => undefined,
  } as never);
  const setData = mock((patch: Record<string, unknown>) => Object.assign(definition.data, patch));
  const page = Object.assign(definition, { setData });
  page.lifecycle.onLoad();
  return page;
}

function bootstrap() {
  return {
    theme: { primary_color: "#191817" },
    company: { name: "装企", logo_url: null, summary: null, address_region: { city: "上海" }, service_regions: [] },
    content: { home_banners: [], trust_metrics: [], featured_projects: [] },
  };
}

function response(list: DouyinMaterialNotePreview[] = []) {
  return { list, pagination: { page: 1, pageSize: 4, total: list.length, totalPages: list.length ? 1 : 0 } };
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
