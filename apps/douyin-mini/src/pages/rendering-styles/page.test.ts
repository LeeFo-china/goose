import { expect, mock, test } from "bun:test";
import type { PublishedRenderingStyle, RenderingListQuery } from "../../api/rendering-styles";
import { ApiRequestError } from "../../api/request";
import { createRenderingStylesPageDefinition } from "./page";

const first: PublishedRenderingStyle = {
  id: "11111111-1111-4111-8111-111111111111", title: "暖色客厅",
  space: "living_room", style: "modern_simple", color_notes: "", material_notes: "",
  source_type: "design", image_url: "https://cdn.example.com/one.webp",
  published_at: "2026-09-13T08:00:00.000Z",
};
const second: PublishedRenderingStyle = { ...first,
  id: "22222222-2222-4222-8222-222222222222", title: "奶油卧室", space: "bedroom" };

test("rendering list discards an old filter response and starts the new filter at page one", async () => {
  const oldFlight = deferred<ReturnType<typeof response>>();
  const newFlight = deferred<ReturnType<typeof response>>();
  const queries: RenderingListQuery[] = [];
  const flights = [oldFlight, newFlight];
  const fetch = mock((_api: unknown, query: RenderingListQuery) => {
    queries.push(query);
    return flights.shift()!.promise;
  });
  const page = makePage(fetch);

  page.onLoad();
  await flush();
  page.onSelectSpace({ currentTarget: { dataset: { value: "bedroom" } } });
  await flush();
  newFlight.resolve(response([second]));
  await flush();
  oldFlight.resolve(response([first]));
  await flush();

  expect(queries).toEqual([
    { page: 1, pageSize: 20 },
    { page: 1, pageSize: 20, space: "bedroom" },
  ]);
  expect(page.data.items.map((item) => item.id)).toEqual([second.id]);
});

test("rendering list deduplicates concurrent load-more and retains cards on page failure", async () => {
  const nextFlight = deferred<ReturnType<typeof response>>();
  let attempts = 0;
  const fetch = mock(async (_api, query: { page: number }) => {
    if (query.page === 1) return response([first], 21);
    attempts++;
    if (attempts === 1) return nextFlight.promise;
    return response([first, second], 21, 2);
  });
  const page = makePage(fetch);

  page.onLoad();
  await flush();
  page.onReachBottom();
  page.onReachBottom();
  expect(fetch).toHaveBeenCalledTimes(2);
  nextFlight.reject(new Error("network"));
  await flush();
  expect(page.data.items.map((item) => item.id)).toEqual([first.id]);
  expect(page.data.paginationStatus).toBe("error");
  page.onRetry();
  await flush();
  expect(fetch.mock.calls[fetch.mock.calls.length - 1]?.[1]).toMatchObject({ page: 2 });
  expect(page.data.items.map((item) => item.id)).toEqual([first.id, second.id]);
});

test("rendering list refreshes after returning from detail and handles paused installation", async () => {
  let calls = 0;
  const fetch = mock(async () => {
    calls++;
    if (calls === 1) return response([first]);
    throw new ApiRequestError(409, "DOUYIN_INSTALLATION_DISABLED", "暂停");
  });
  const page = makePage(fetch);
  page.onLoad();
  await flush();
  page.onHide();
  page.onShow();
  await flush();
  expect(calls).toBe(2);
  expect(page.data.items).toEqual([]);
  expect(page.data.blocked).toBe(true);
});

test("rendering list removes stale cards when session recovery still returns 401", async () => {
  let calls = 0;
  const fetch = mock(async () => {
    calls++;
    if (calls === 1) return response([first]);
    throw new ApiRequestError(401, "TOKEN_INVALID", "会话失效");
  });
  const page = makePage(fetch);
  page.onLoad();
  await flush();
  page.onHide();
  page.onShow();
  await flush();
  expect(page.data.items).toEqual([]);
  expect(page.data.firstError).toBe(true);
  expect(page.data.errorTitle).toBe("登录状态已失效");
});

function makePage(fetchPublishedStyles: ReturnType<typeof mock>) {
  const definition = createRenderingStylesPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }),
    fetchPublishedStyles,
    navigateToDetail: async () => undefined,
    stopPullDownRefresh: () => undefined,
    showToast: () => undefined,
  } as never);
  return Object.assign(definition, {
    setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); },
  });
}

function response(list: PublishedRenderingStyle[], total = list.length, page = 1) {
  return { list, pagination: { page, pageSize: 20, total, totalPages: Math.ceil(total / 20) || (total > 0 ? 1 : 0) } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function flush() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
