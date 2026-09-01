import { describe, expect, test } from "bun:test";

import type { DouyinMaterialNoteBlock } from "../models";
import type {
  MaterialPaginationQuery,
  OwnedMaterialListQuery,
  PublicMaterialListQuery,
} from "./materials";
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

type Assert<Condition extends true> = Condition;
type PublicQueryHasKeyword = Assert<"keyword" extends keyof PublicMaterialListQuery ? true : false>;
type OwnedQueryHasNoKeyword = Assert<"keyword" extends keyof OwnedMaterialListQuery ? false : true>;
type PaginationHasNoKeyword = Assert<"keyword" extends keyof MaterialPaginationQuery ? false : true>;
void (null as unknown as PublicQueryHasKeyword);
void (null as unknown as OwnedQueryHasNoKeyword);
void (null as unknown as PaginationHasNoKeyword);

const NOTE_ID = "11111111-1111-4111-8111-111111111111";
const CLAIM_ID = "22222222-2222-4222-8222-222222222222";
const UPPER_NOTE_ID = "A1111111-B111-4111-8111-11111111111A";
const UPPER_CLAIM_ID = "B2222222-C222-4222-8222-22222222222B";
const ZOD_UUID_POSITIVE_CASES = [
  ...Array.from({ length: 8 }, (_, index) => (
    `A000000${index + 1}-B000-${index + 1}000-8000-00000000000${index + 1}`
  )),
  "00000000-0000-0000-0000-000000000000",
  "ffffffff-ffff-ffff-ffff-ffffffffffff",
] as const;
const ZOD_UUID_NEGATIVE_CASES = [
  "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF",
] as const;
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

function maximumUtf8Blocks(token: string): DouyinMaterialNoteBlock[] {
  const maximumBytes = 512 * 1024;
  const maximumRepeats = Math.floor(20_000 / token.length);
  const blocks: DouyinMaterialNoteBlock[] = [];
  while (blocks.length < 100) {
    const fullBlock = { type: "paragraph" as const, text: token.repeat(maximumRepeats) };
    if (Buffer.byteLength(JSON.stringify([...blocks, fullBlock]), "utf8") <= maximumBytes) {
      blocks.push(fullBlock);
      continue;
    }
    let lower = 1;
    let upper = maximumRepeats;
    let accepted = 0;
    while (lower <= upper) {
      const middle = Math.floor((lower + upper) / 2);
      const candidate = [...blocks, {
        type: "paragraph" as const,
        text: token.repeat(middle),
      }];
      if (Buffer.byteLength(JSON.stringify(candidate), "utf8") <= maximumBytes) {
        accepted = middle;
        lower = middle + 1;
      } else {
        upper = middle - 1;
      }
    }
    if (accepted > 0) blocks.push({ type: "paragraph", text: token.repeat(accepted) });
    break;
  }
  return blocks;
}

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
      { page: 1, pageSize: 20, keyword: 123 },
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

  test("accepts canonical safe-integer pagination without client-only caps", async () => {
    const calls: TransportInput[] = [];
    await expect(fetchMaterials(clientWith((input) => {
      calls.push(input);
      return {
        list: [],
        pagination: { page: 10_001, pageSize: 20, total: 0, totalPages: 0 },
      };
    }), { page: 10_001, pageSize: 20 })).resolves.toMatchObject({
      pagination: { page: 10_001, pageSize: 20, total: 0, totalPages: 0 },
    });
    expect(calls[0]?.path).toBe(
      "/douyin-mini/material-notes?page=10001&pageSize=20",
    );

    const total = 10_000_001;
    await expect(fetchMaterials(clientWith(() => ({
      list: Array.from({ length: 100 }, () => preview),
      pagination: {
        page: 1,
        pageSize: 100,
        total,
        totalPages: Math.ceil(total / 100),
      },
    })), { page: 1, pageSize: 100 })).resolves.toMatchObject({
      pagination: { total, totalPages: Math.ceil(total / 100) },
    });

    await expect(fetchMaterials(clientWith(() => null), {
      page: Number.MAX_SAFE_INTEGER + 1,
      pageSize: 20,
    })).rejects.toMatchObject({ code: "INVALID_MATERIAL_QUERY" });
    await expect(fetchMaterials(clientWith(() => ({
      list: [],
      pagination: {
        page: 1,
        pageSize: 20,
        total: Number.MAX_SAFE_INTEGER + 1,
        totalPages: 0,
      },
    })))).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
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

  test("matches the canonical offset ISO datetime calendar and precision semantics", async () => {
    for (const publishedAt of [
      "2024-02-29T23:59:59.123456Z",
      "2026-09-01T08:30Z",
      "2026-09-01T08:30:00+23:59",
    ]) {
      await expect(fetchMaterialPreview(clientWith(() => ({
        ...preview,
        published_at: publishedAt,
      })), NOTE_ID)).resolves.toMatchObject({ published_at: publishedAt });
    }
    for (const publishedAt of [
      "2026-02-30T12:00:00Z",
      "2023-02-29T12:00:00Z",
      "2026-09-01T08:30:00+24:00",
      "2026-09-01T08:30:00+01:60",
    ]) {
      await expect(fetchMaterialPreview(clientWith(() => ({
        ...preview,
        published_at: publishedAt,
      })), NOTE_ID)).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
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

  test("counts normalized content with portable UTF-8 semantics at 512 KiB", async () => {
    for (const token of ["A", "é", "中", "😀"]) {
      const accepted = maximumUtf8Blocks(token);
      const acceptedBytes = Buffer.byteLength(JSON.stringify(accepted), "utf8");
      const last = accepted[accepted.length - 1];
      expect(acceptedBytes).toBeLessThanOrEqual(512 * 1024);
      expect(last?.type).toBe("paragraph");
      if (!last || last.type !== "paragraph") throw new Error("invalid boundary fixture");
      const rejected = [
        ...accepted.slice(0, -1),
        { ...last, text: `${last.text}${token}` },
      ];
      expect(Buffer.byteLength(JSON.stringify(rejected), "utf8")).toBeGreaterThan(512 * 1024);
      await expect(claimMaterial(clientWith(() => ({
        claim_id: CLAIM_ID,
        already_claimed: false,
        claimed_at: CLAIMED_AT,
        material: { ...claimedMaterial, content_blocks: accepted },
      })), NOTE_ID)).resolves.toMatchObject({ material: { content_blocks: accepted } });
      await expect(claimMaterial(clientWith(() => ({
        claim_id: CLAIM_ID,
        already_claimed: false,
        claimed_at: CLAIMED_AT,
        material: { ...claimedMaterial, content_blocks: rejected },
      })), NOTE_ID)).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
    }

    const padding = " ".repeat(512 * 1024);
    await expect(claimMaterial(clientWith(() => ({
      claim_id: CLAIM_ID,
      already_claimed: false,
      claimed_at: CLAIMED_AT,
      material: {
        ...claimedMaterial,
        content_blocks: [{ type: "paragraph", text: `${padding} 正文 ${padding}` }],
      },
    })), NOTE_ID)).resolves.toMatchObject({
      material: { content_blocks: [{ type: "paragraph", text: "正文" }] },
    });
  });

  test("parses material bodies when TextEncoder is not available globally", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "TextEncoder");
    Reflect.deleteProperty(globalThis, "TextEncoder");
    try {
      await expect(claimMaterial(clientWith(() => ({
        claim_id: CLAIM_ID,
        already_claimed: false,
        claimed_at: CLAIMED_AT,
        material: claimedMaterial,
      })), NOTE_ID)).resolves.toMatchObject({ material: claimedMaterial });
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "TextEncoder", descriptor);
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

  test("rejects public-only keyword and unknown fields from owned pagination", async () => {
    const calls: TransportInput[] = [];
    const client = clientWith((input) => calls.push(input));
    await expect(fetchOwnedMaterials(client, { keyword: "开工" } as never))
      .rejects.toMatchObject({ code: "INVALID_MATERIAL_QUERY" });
    await expect(fetchOwnedMaterials(client, { page: 1, pageSize: 20, tenant_id: NOTE_ID } as never))
      .rejects.toMatchObject({ code: "INVALID_MATERIAL_QUERY" });
    expect(calls).toHaveLength(0);
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

  test("normalizes mixed-case UUIDs before all detail requests and correlations", async () => {
    const calls: TransportInput[] = [];
    const client = clientWith((input) => {
      calls.push(input);
      if (input.path.endsWith("/claim")) {
        return {
          claim_id: UPPER_CLAIM_ID,
          already_claimed: false,
          claimed_at: CLAIMED_AT,
          material: { ...claimedMaterial, id: UPPER_NOTE_ID },
        };
      }
      if (input.path.startsWith("/douyin-mini/my-material-notes/")) {
        return {
          ...ownedSummary,
          claim_id: UPPER_CLAIM_ID,
          id: UPPER_NOTE_ID,
          content_blocks: contentBlocks,
        };
      }
      return { ...preview, id: UPPER_NOTE_ID };
    });

    await expect(fetchMaterialPreview(client, UPPER_NOTE_ID)).resolves.toMatchObject({
      id: UPPER_NOTE_ID.toLowerCase(),
    });
    await expect(claimMaterial(client, UPPER_NOTE_ID)).resolves.toMatchObject({
      claim_id: UPPER_CLAIM_ID.toLowerCase(),
      material: { id: UPPER_NOTE_ID.toLowerCase() },
    });
    await expect(fetchOwnedMaterialDetail(client, UPPER_CLAIM_ID)).resolves.toMatchObject({
      claim_id: UPPER_CLAIM_ID.toLowerCase(),
      id: UPPER_NOTE_ID.toLowerCase(),
    });
    expect(calls.map((call) => call.path)).toEqual([
      `/douyin-mini/material-notes/${UPPER_NOTE_ID.toLowerCase()}`,
      `/douyin-mini/material-notes/${UPPER_NOTE_ID.toLowerCase()}/claim`,
      `/douyin-mini/my-material-notes/${UPPER_CLAIM_ID.toLowerCase()}`,
    ]);
  });

  test("matches zod uuid acceptance for v1-v8, nil and max material ids", async () => {
    const calls: TransportInput[] = [];
    for (const id of ZOD_UUID_POSITIVE_CASES) {
      await expect(fetchMaterialPreview(clientWith((input) => {
        calls.push(input);
        return { ...preview, id };
      }), id)).resolves.toMatchObject({ id: id.toLowerCase() });
    }
    expect(calls.map((call) => call.path)).toEqual(ZOD_UUID_POSITIVE_CASES.map(
      (id) => `/douyin-mini/material-notes/${id.toLowerCase()}`,
    ));
    for (const id of ZOD_UUID_NEGATIVE_CASES) {
      await expect(fetchMaterialPreview(clientWith((input) => calls.push(input)), id))
        .rejects.toMatchObject({ code: "INVALID_MATERIAL_ID" });
    }
    expect(calls).toHaveLength(ZOD_UUID_POSITIVE_CASES.length);
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
      expect(toMaterialBusinessError(new ApiRequestError(statusCode + 1, code, "状态错误")))
        .toBeNull();
    }
    expect(toMaterialBusinessError(new ApiRequestError(0, "NETWORK_ERROR", "网络错误")))
      .toBeNull();
    expect(toMaterialBusinessError(new Error("unknown"))).toBeNull();
  });
});
