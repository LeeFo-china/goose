import { describe, expect, test } from "bun:test";

import type { DouyinMaterialNoteBlock } from "../models";
import { ApiClient, ApiRequestError, type TransportInput } from "./request";
import {
  claimMaterial,
  clearOwnedMaterials,
  fetchMaterialPreview,
  fetchMaterials,
  fetchOwnedMaterialDetail,
  fetchOwnedMaterials,
  removeOwnedMaterial,
  toMaterialBusinessError,
} from "./materials";

const NOTE_ID = "11111111-1111-4111-8111-111111111111";
const CLAIM_ID = "22222222-2222-4222-8222-222222222222";
const PUBLISHED_AT = "2026-09-01T08:00:00.000Z";
const CLAIMED_AT = "2026-09-01T08:30:00.000Z";

function clientWith(handler: (input: TransportInput) => unknown): ApiClient {
  return new ApiClient(
    { send: async (input) => handler(input) },
    {
      getAccessToken: async () => "test-token",
      refreshAfterUnauthorized: async () => "refreshed-token",
    },
  );
}

const preview = {
  id: NOTE_ID,
  title: "装修开工前检查清单",
  summary: "开工交底前需要确认的事项",
  category: "施工避坑",
  applicable_to: "准备开工的业主",
  published_at: PUBLISHED_AT,
  claimed: false,
};

const contentBlocks: DouyinMaterialNoteBlock[] = [
  { type: "heading", level: 2, text: "开工准备" },
  { type: "paragraph", text: "逐项核对合同与现场条件。" },
  { type: "list", style: "unordered", items: ["核对图纸", "确认工期"] },
  { type: "quote", text: "隐蔽工程要留存影像。", attribution: "项目经理" },
  { type: "callout", tone: "warning", title: "注意", text: "不要跳过现场交底。" },
];

const claimedMaterial = {
  id: NOTE_ID,
  version: 1,
  title: preview.title,
  summary: preview.summary,
  category: preview.category,
  applicable_to: preview.applicable_to,
  content_blocks: contentBlocks,
};

const ownedSummary = {
  claim_id: CLAIM_ID,
  id: NOTE_ID,
  version: 1,
  title: preview.title,
  summary: preview.summary,
  category: preview.category,
  applicable_to: preview.applicable_to,
  claimed_at: CLAIMED_AT,
};

describe("Douyin material API client", () => {
  test("uses default and bounded pagination while strictly parsing preview-only lists", async () => {
    const calls: TransportInput[] = [];
    const client = clientWith((input) => {
      calls.push(input);
      return {
        list: [preview],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      };
    });

    await expect(fetchMaterials(client)).resolves.toEqual({
      list: [preview],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(calls).toEqual([{
      path: "/douyin-mini/material-notes?page=1&pageSize=20",
      method: "GET",
      token: "test-token",
    }]);

    const keywordCalls: TransportInput[] = [];
    await fetchMaterials(clientWith((input) => {
      keywordCalls.push(input);
      return { list: [], pagination: { page: 2, pageSize: 100, total: 1, totalPages: 1 } };
    }), { page: 2, pageSize: 100, keyword: "  开工 清单  " });
    expect(keywordCalls[0]?.path).toBe(
      "/douyin-mini/material-notes?page=2&pageSize=100&keyword=%E5%BC%80%E5%B7%A5%20%E6%B8%85%E5%8D%95",
    );
  });

  test("rejects invalid list queries before transport and mismatched pagination echoes", async () => {
    const calls: TransportInput[] = [];
    const client = clientWith((input) => calls.push(input));
    for (const query of [
      { page: 0, pageSize: 20 },
      { page: 1, pageSize: 101 },
      { page: 1, pageSize: 20, keyword: " " },
      { page: 1, pageSize: 20, keyword: "x".repeat(121) },
      { page: 1, pageSize: 20, tenant_id: NOTE_ID },
      { page: 1, pageSize: 20, installation_id: NOTE_ID },
      { page: 1, pageSize: 20, appid: "tt-private" },
      { page: 1, pageSize: 20, subject_hash: "private" },
    ]) {
      await expect(fetchMaterials(client, query as never))
        .rejects.toMatchObject({ code: "INVALID_MATERIAL_QUERY" });
    }
    expect(calls).toHaveLength(0);

    await expect(fetchMaterials(clientWith(() => ({
      list: [], pagination: { page: 2, pageSize: 20, total: 0, totalPages: 0 },
    })), { page: 1, pageSize: 20 })).rejects.toMatchObject({
      code: "INVALID_API_RESPONSE",
    });
  });

  test("parses unclaimed detail without ever accepting a response body", async () => {
    await expect(fetchMaterialPreview(clientWith(() => preview), NOTE_ID))
      .resolves.toEqual(preview);
    for (const expanded of [
      { ...preview, content_blocks: contentBlocks },
      { ...preview, tenant_id: NOTE_ID },
      { ...preview, installation_id: NOTE_ID },
      { ...preview, app_id: "tt-secret" },
      { ...preview, appid: "tt-secret" },
      { ...preview, subject_hash: "must-not-leak" },
      { ...preview, title: "", applicable_to: null },
    ]) {
      await expect(fetchMaterialPreview(clientWith(() => expanded), NOTE_ID))
        .rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
    }
  });

  test("claims with an empty command and strictly unlocks the claimed body", async () => {
    const calls: TransportInput[] = [];
    const response = {
      claim_id: CLAIM_ID,
      already_claimed: false,
      claimed_at: CLAIMED_AT,
      material: claimedMaterial,
    };
    await expect(claimMaterial(clientWith((input) => {
      calls.push(input);
      return response;
    }), NOTE_ID)).resolves.toEqual(response);
    expect(calls).toEqual([{
      path: `/douyin-mini/material-notes/${NOTE_ID}/claim`,
      method: "POST",
      token: "test-token",
    }]);

    for (const malformed of [
      { ...response, tenant_id: NOTE_ID },
      { ...response, material: { ...claimedMaterial, subject_hash: "private" } },
      { ...response, material: { ...claimedMaterial, content_blocks: [
        { type: "image", fileId: NOTE_ID, alt: "不得支持" },
      ] } },
      { ...response, material: { ...claimedMaterial, content_blocks: [
        { type: "heading", level: 1, text: "错误层级" },
      ] } },
      { ...response, material: { ...claimedMaterial, content_blocks: Array.from(
        { length: 27 },
        () => ({ type: "paragraph", text: "x".repeat(20_000) }),
      ) } },
    ]) {
      await expect(claimMaterial(clientWith(() => malformed), NOTE_ID))
        .rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
    }
  });

  test("parses owned summaries and detail with strict subject-safe shapes", async () => {
    const listCalls: TransportInput[] = [];
    await expect(fetchOwnedMaterials(clientWith((input) => {
      listCalls.push(input);
      return {
        list: [ownedSummary],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      };
    }))).resolves.toEqual({
      list: [ownedSummary],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(listCalls[0]?.path).toBe("/douyin-mini/my-material-notes?page=1&pageSize=20");

    const detail = { ...ownedSummary, content_blocks: contentBlocks };
    await expect(fetchOwnedMaterialDetail(clientWith(() => detail), CLAIM_ID))
      .resolves.toEqual(detail);
    for (const expandedSummary of [
      { ...ownedSummary, content_blocks: contentBlocks },
      { ...ownedSummary, tenant_id: NOTE_ID },
    ]) {
      await expect(fetchOwnedMaterials(clientWith(() => ({
        list: [expandedSummary],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      })))).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
    }
    await expect(fetchOwnedMaterialDetail(clientWith(() => ({
      ...detail,
      subject_hash: "private",
    })), CLAIM_ID)).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
  });

  test("uses strict idempotent remove and atomic clear commands", async () => {
    const calls: TransportInput[] = [];
    const client = clientWith((input) => {
      calls.push(input);
      return input.path.endsWith("/clear") ? { removed_count: 2 } : { removed: true };
    });
    await expect(removeOwnedMaterial(client, CLAIM_ID)).resolves.toEqual({ removed: true });
    await expect(clearOwnedMaterials(client)).resolves.toEqual({ removed_count: 2 });
    expect(calls).toEqual([
      {
        path: `/douyin-mini/my-material-notes/${CLAIM_ID}/remove`,
        method: "POST",
        token: "test-token",
      },
      { path: "/douyin-mini/my-material-notes/clear", method: "POST", token: "test-token" },
    ]);
    await expect(removeOwnedMaterial(clientWith(() => ({ removed: false })), CLAIM_ID))
      .rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
    await expect(clearOwnedMaterials(clientWith(() => ({ removed_count: -1 }))))
      .rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
  });

  test("validates UUID route identities before transport", async () => {
    const calls: TransportInput[] = [];
    const client = clientWith((input) => calls.push(input));
    for (const operation of [
      fetchMaterialPreview(client, `${NOTE_ID}?tenant_id=forged`),
      claimMaterial(client, "bad-id"),
      fetchOwnedMaterialDetail(client, "bad-id"),
      removeOwnedMaterial(client, `${CLAIM_ID}/remove-again`),
    ]) {
      await expect(operation).rejects.toMatchObject({ code: "INVALID_MATERIAL_ID" });
    }
    expect(calls).toHaveLength(0);
  });

  test("normalizes every typed material business error and no unrelated error", () => {
    const cases = [
      [404, "MATERIAL_NOTE_NOT_FOUND"],
      [409, "MATERIAL_NOTE_NOT_AVAILABLE"],
      [410, "MATERIAL_NOTE_WITHDRAWN"],
      [404, "MATERIAL_NOTE_CLAIM_NOT_FOUND"],
      [409, "MATERIAL_NOTE_VERSION_CONFLICT"],
      [409, "MATERIAL_NOTE_STATE_CONFLICT"],
    ] as const;
    for (const [statusCode, code] of cases) {
      expect(toMaterialBusinessError(new ApiRequestError(statusCode, code, "业务错误")))
        .toEqual({ statusCode, code, message: "业务错误" });
    }
    expect(toMaterialBusinessError(new ApiRequestError(0, "NETWORK_ERROR", "网络错误")))
      .toBeNull();
    expect(toMaterialBusinessError(new Error("unknown"))).toBeNull();
  });
});
