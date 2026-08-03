import { describe, expect, test } from "bun:test";
import {
  beginPaginationRequest,
  createPaginationState,
  rejectPaginationRequest,
  resolvePaginationRequest,
} from "./pagination";

type Item = { id: string; title: string };

function page(ids: string[], pageNumber: number, total = ids.length) {
  return {
    items: ids.map((id) => ({ id, title: `案例 ${id}` })),
    pagination: {
      page: pageNumber,
      pageSize: 2,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / 2),
    },
  };
}

describe("pagination state reducer", () => {
  test("starts first-page loading and resolves its items", () => {
    const pending = beginPaginationRequest(createPaginationState<Item>(2), "loadMore");
    expect(pending.request).toMatchObject({ page: 1, sequence: 1 });
    expect(pending.state).toMatchObject({ status: "loading", items: [] });

    const ready = resolvePaginationRequest(pending.state, pending.request, page(["a", "b"], 1, 4));
    expect(ready).toMatchObject({ status: "idle", page: 1, items: [{ id: "a" }, { id: "b" }] });
  });

  test("appends unique items and detects the end of the list", () => {
    const first = beginPaginationRequest(createPaginationState<Item>(2), "loadMore");
    const ready = resolvePaginationRequest(first.state, first.request, page(["a", "b"], 1, 3));
    const second = beginPaginationRequest(ready, "loadMore");
    const ended = resolvePaginationRequest(second.state, second.request, page(["b", "c"], 2, 3));

    expect(ended.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(ended).toMatchObject({ page: 2, status: "end", total: 3, totalPages: 2 });
  });

  test("keeps loaded items after a next-page failure and retries the same page", () => {
    const first = beginPaginationRequest(createPaginationState<Item>(2), "loadMore");
    const ready = resolvePaginationRequest(first.state, first.request, page(["a", "b"], 1, 4));
    const second = beginPaginationRequest(ready, "loadMore");
    const failed = rejectPaginationRequest(second.state, second.request);

    expect(failed).toMatchObject({ status: "error", page: 1, items: [{ id: "a" }, { id: "b" }] });
    const retry = beginPaginationRequest(failed, "retry");
    expect(retry.request).toMatchObject({ page: 2, sequence: 3 });
    expect(retry.state.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("refresh resets existing content and stale responses cannot overwrite it", () => {
    const first = beginPaginationRequest(createPaginationState<Item>(2), "loadMore");
    const ready = resolvePaginationRequest(first.state, first.request, page(["old"], 1, 1));
    const refresh = beginPaginationRequest(ready, "refresh");
    expect(refresh.state).toMatchObject({ status: "loading", page: 0, items: [] });

    const newer = beginPaginationRequest(refresh.state, "refresh");
    const ignored = resolvePaginationRequest(newer.state, refresh.request, page(["stale"], 1, 1));
    expect(ignored).toBe(newer.state);
    const current = resolvePaginationRequest(newer.state, newer.request, page(["fresh"], 1, 1));
    expect(current.items.map((item) => item.id)).toEqual(["fresh"]);
    expect(current.status).toBe("end");
  });
});
