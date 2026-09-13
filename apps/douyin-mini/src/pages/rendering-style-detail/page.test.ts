import { expect, mock, test } from "bun:test";
import type { PublishedRenderingStyle } from "../../api/rendering-styles";
import { ApiRequestError } from "../../api/request";
import { createRenderingStyleDetailPageDefinition } from "./page";

const STYLE: PublishedRenderingStyle = {
  id: "11111111-1111-4111-8111-111111111111", title: "暖色客厅",
  space: "living_room", style: "modern_simple", color_notes: "暖白",
  material_notes: "木饰面", source_type: "ai_concept",
  image_url: "https://cdn.example.com/rendering.webp",
  published_at: "2026-09-13T08:00:00.000Z",
};

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
  expect(page.data.status).toBe("ready");
  expect(page.data.sourceLabel).toBe("AI 概念图");
  page.onHide();
  page.onShow();
  await flush();
  expect(calls).toBe(2);
  expect(page.data.status).toBe("not-found");
  expect(page.data.style).toBeNull();
});

test("rendering detail retains the current image through a network failure", async () => {
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

function makePage(fetchPublishedStyleDetail: ReturnType<typeof mock>) {
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }),
    fetchPublishedStyleDetail,
    navigateToList: async () => undefined,
    showToast: () => undefined,
  } as never);
  return Object.assign(definition, {
    setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); },
  });
}

async function flush() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
