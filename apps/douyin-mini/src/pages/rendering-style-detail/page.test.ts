import { expect, mock, test } from "bun:test";
import type { PublishedRenderingStyle } from "../../api/rendering-styles";
import { ApiRequestError } from "../../api/request";
import { createRenderingStyleDetailPageDefinition } from "./page";

const STYLE: PublishedRenderingStyle = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "暖色客厅",
  space: "living_room",
  style: "modern_simple",
  color_notes: "暖白",
  material_notes: "木饰面",
  source_type: "design",
  image_url: "https://cdn.example.com/rendering.webp",
  published_at: "2026-09-13T08:00:00.000Z",
};

test("rendering detail presents one published style as read-only content", async () => {
  const fetch = mock(async () => STYLE);
  const page = makePage(fetch);
  page.onLoad({ id: STYLE.id });
  await flush();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(page.data.status).toBe("ready");
  expect(page.data.style).toEqual(STYLE);
  expect(page.data.spaceLabel).toBe("客厅");
  expect(page.data.styleLabel).toBe("现代简约");
  expect(page.data.sourceLabel).toBe("设计图");
  expect(page.data.publishedDate).toBe("2026-09-13");
});

test("rendering detail refreshes after return and treats hidden style as not found", async () => {
  let calls = 0;
  const fetch = mock(async () => {
    calls++;
    if (calls === 1) return STYLE;
    throw new ApiRequestError(404, "RENDERING_STYLE_NOT_FOUND", "已隐藏");
  });
  const page = makePage(fetch);
  page.onLoad({ id: STYLE.id });
  await flush();
  page.onHide();
  page.onShow();
  await flush();
  expect(calls).toBe(2);
  expect(page.data.status).toBe("not-found");
  expect(page.data.style).toBeNull();
});

test("rendering detail retains current content through a refresh failure", async () => {
  let calls = 0;
  const fetch = mock(async () => {
    calls++;
    if (calls === 1) return STYLE;
    throw new ApiRequestError(0, "NETWORK_ERROR", "网络失败");
  });
  const page = makePage(fetch);
  page.onLoad({ id: STYLE.id });
  await flush();
  page.onHide();
  page.onShow();
  await flush();
  expect(page.data.status).toBe("stale-error");
  expect(page.data.style?.id).toBe(STYLE.id);
});

test("rendering detail ignores a response that resolves while hidden", async () => {
  let resolveStyle: ((style: PublishedRenderingStyle) => void) | undefined;
  const fetch = mock(() => new Promise<PublishedRenderingStyle>((resolve) => {
    resolveStyle = resolve;
  }));
  const page = makePage(fetch);
  page.onLoad({ id: STYLE.id });
  await Promise.resolve();
  page.onHide();
  resolveStyle?.(STYLE);
  await flush();
  expect(page.data.style).toBeNull();
  expect(page.data.status).toBe("loading");
});

test("rendering detail handles invalid ids, image failures and list navigation", async () => {
  let navigations = 0;
  const page = makePage(mock(async () => STYLE), async () => { navigations++; });
  page.onLoad({ id: "bad-id" });
  expect(page.data.status).toBe("not-found");
  page.onImageError();
  expect(page.data.imageFailed).toBe(true);
  page.onBackToList();
  await flush();
  expect(navigations).toBe(1);
});

function makePage(
  fetchPublishedStyleDetail: ReturnType<typeof mock>,
  navigateToList: () => Promise<void> = async () => undefined,
) {
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({
      api: {},
      startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined,
    }),
    fetchPublishedStyleDetail,
    navigateToList,
    showToast: () => undefined,
  } as never);
  return Object.assign(definition, {
    setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); },
  });
}

async function flush() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
