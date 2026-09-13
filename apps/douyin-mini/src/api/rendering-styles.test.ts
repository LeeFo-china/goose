import { expect, test } from "bun:test";
import { ApiRequestError, type ApiClient } from "./request";
import { fetchPublishedStyleDetail, fetchPublishedStyles } from "./rendering-styles";

const STYLE_ID = "11111111-1111-4111-8111-111111111111";
const STYLE = {
  id: STYLE_ID,
  title: "暖色客厅",
  space: "living_room",
  style: "modern_simple",
  color_notes: "暖白墙面",
  material_notes: "浅木饰面",
  source_type: "ai_concept",
  image_url: "https://cdn.example.com/rendering.webp",
  published_at: "2026-09-13T08:00:00.000Z",
} as const;

test("published style API sends bounded filters and reads the public list envelope", async () => {
  const calls: unknown[] = [];
  const client = { request: async (input: unknown) => {
    calls.push(input);
    return { list: [STYLE], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } };
  } } as unknown as ApiClient;
  const page = await fetchPublishedStyles(client, {
    page: 1, pageSize: 20, space: "living_room", style: "modern_simple",
  });

  expect(calls).toEqual([{ method: "GET", path:
    "/douyin-mini/renderings/styles?page=1&pageSize=20&space=living_room&style=modern_simple" }]);
  expect(page.list).toEqual([STYLE]);
});

test("published style API validates detail identity and public HTTPS image", async () => {
  const client = { request: async () => ({ ...STYLE, image_url: "http://private.example.com/a.webp" }) } as unknown as ApiClient;
  await expect(fetchPublishedStyleDetail(client, STYLE_ID)).rejects.toMatchObject({
    code: "INVALID_API_RESPONSE",
  });
  await expect(fetchPublishedStyleDetail(client, "bad-id")).rejects.toMatchObject({
    code: "INVALID_RENDERING_ID",
  });
});

test("published style API rejects invalid pagination before calling the server", async () => {
  let calls = 0;
  const client = { request: async () => { calls++; return null; } } as unknown as ApiClient;
  await expect(fetchPublishedStyles(client, { page: 1, pageSize: 101 })).rejects.toMatchObject({
    code: "INVALID_RENDERING_QUERY",
  });
  expect(calls).toBe(0);
});

test("published style API keeps stable server errors for page handling", async () => {
  const serverError = new ApiRequestError(404, "RENDERING_STYLE_NOT_FOUND", "已下架");
  const client = { request: async () => { throw serverError; } } as unknown as ApiClient;
  await expect(fetchPublishedStyleDetail(client, STYLE_ID)).rejects.toBe(serverError);
});
