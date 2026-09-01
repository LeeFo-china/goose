import { describe, expect, test } from "bun:test";

import type { DouyinMaterialNotePreview } from "../../models";
import {
  applyMaterialKeyword,
  beginMaterialListLoad,
  createMaterialListPageState,
  failMaterialListLoad,
  MaterialExperienceLifecycle,
  resolveMaterialListLoad,
  updateMaterialKeyword,
} from "./page-model";

const first: DouyinMaterialNotePreview = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "开工清单",
  summary: "开工前逐项确认",
  category: "施工避坑",
  applicable_to: "准备开工的业主",
  published_at: "2026-09-01T08:00:00.000Z",
  claimed: false,
};
const second = { ...first, id: "22222222-2222-4222-8222-222222222222" };

function response(
  list: DouyinMaterialNotePreview[],
  page: number,
  total: number,
) {
  return {
    list,
    pagination: { page, pageSize: 2, total, totalPages: Math.ceil(total / 2) },
  };
}

describe("materials page model", () => {
  test("invalidates every hidden operation and never reactivates after unload", () => {
    const lifecycle = new MaterialExperienceLifecycle();
    expect(lifecycle.onLoad()).toBe(true);
    const stale = lifecycle.beginOperation();
    expect(stale).not.toBeNull();
    lifecycle.onHide();
    lifecycle.onShow();
    expect(lifecycle.isCurrent(stale!)).toBe(false);
    const current = lifecycle.beginOperation();
    expect(lifecycle.isCurrent(current!)).toBe(true);
    lifecycle.onUnload();
    lifecycle.onShow();
    expect(lifecycle.isCurrent(current!)).toBe(false);
    expect(lifecycle.beginOperation()).toBeNull();
  });

  test("debounces a normalized keyword and ignores an older debounce token", () => {
    const initial = createMaterialListPageState(2);
    const older = updateMaterialKeyword(initial, " 开 ");
    const latest = updateMaterialKeyword(older.state, " 开工 ");

    expect(older.debounce.delayMs).toBeGreaterThanOrEqual(250);
    expect(applyMaterialKeyword(latest.state, older.debounce.sequence)).toEqual({
      state: latest.state,
      request: null,
    });

    const applied = applyMaterialKeyword(latest.state, latest.debounce.sequence);
    expect(applied.request).toMatchObject({ page: 1, pageSize: 2, keyword: "开工" });
    expect(applied.state.appliedKeyword).toBe("开工");
    expect(applied.state.pagination.items).toEqual([]);
  });

  test("appends server pages once, guards duplicate loads and suppresses stale results", () => {
    const initial = createMaterialListPageState(2);
    const pendingFirst = beginMaterialListLoad(initial, "loadMore");
    expect(pendingFirst).not.toBeNull();
    if (!pendingFirst) return;
    expect(beginMaterialListLoad(pendingFirst.state, "loadMore")).toBeNull();

    const ready = resolveMaterialListLoad(
      pendingFirst.state,
      pendingFirst.request,
      response([first, second], 1, 3),
    );
    const pendingSecond = beginMaterialListLoad(ready, "loadMore");
    expect(pendingSecond).not.toBeNull();
    if (!pendingSecond) return;

    const refresh = beginMaterialListLoad(pendingSecond.state, "refresh");
    expect(refresh).not.toBeNull();
    if (!refresh) return;
    const stale = resolveMaterialListLoad(
      refresh.state,
      pendingSecond.request,
      response([{ ...second, title: "过期" }], 2, 3),
    );
    expect(stale).toBe(refresh.state);

    const fresh = resolveMaterialListLoad(
      stale,
      refresh.request,
      response([{ ...first, title: "最新" }], 1, 1),
    );
    expect(fresh.pagination.items.map((item) => item.title)).toEqual(["最新"]);
    expect(fresh.pagination.status).toBe("end");
    expect(beginMaterialListLoad(fresh, "loadMore")).toBeNull();
  });

  test("exposes first-page empty/error and preserves loaded items on append errors", () => {
    const initial = createMaterialListPageState(2);
    const firstLoad = beginMaterialListLoad(initial, "loadMore")!;
    const failedFirst = failMaterialListLoad(firstLoad.state, firstLoad.request);
    expect(failedFirst.view).toMatchObject({ firstError: true, empty: false });

    const retry = beginMaterialListLoad(failedFirst, "retry")!;
    const empty = resolveMaterialListLoad(retry.state, retry.request, response([], 1, 0));
    expect(empty.view).toMatchObject({ firstError: false, firstLoading: false, empty: true });

    const refreshed = beginMaterialListLoad(empty, "refresh")!;
    const populated = resolveMaterialListLoad(
      refreshed.state,
      refreshed.request,
      response([first, second], 1, 3),
    );
    const next = beginMaterialListLoad(populated, "loadMore")!;
    const appendError = failMaterialListLoad(next.state, next.request);
    expect(appendError.pagination.items).toHaveLength(2);
    expect(appendError.view).toMatchObject({ firstError: false, empty: false });
  });
});
