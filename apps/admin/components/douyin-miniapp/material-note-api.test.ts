import { afterEach, describe, expect, test } from "bun:test";

import {
  appendMaterialNoteVersion,
  createMaterialNote,
  createMaterialNoteCommandRequest,
  executeMaterialNoteCommand,
  getMaterialNote,
  getMaterialNoteVersion,
  listMaterialNoteVersions,
  listMaterialNotes,
} from "./material-note-api";

const noteId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const employeeId = "33333333-3333-4333-8333-333333333333";
const commandKey = "44444444-4444-4444-8444-444444444444";
const secondCommandKey = "55555555-5555-4555-8555-555555555555";
const timestamp = "2026-09-01T08:00:00.000+08:00";

const draft = {
  title: "装修开工清单",
  summary: "开工前逐项确认",
  category: "施工避坑",
  applicable_to: "准备开工的业主",
  content_blocks: [{ type: "paragraph" as const, text: "先核对施工图。" }],
};

const versionSummary = {
  id: versionId,
  note_id: noteId,
  version: 1,
  title: draft.title,
  summary: draft.summary,
  category: draft.category,
  applicable_to: draft.applicable_to,
  created_by: employeeId,
  created_at: timestamp,
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: status < 400, data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("抖音资料后台 API", () => {
  test("列表、详情、历史和版本正文使用各自严格 GET 契约", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const responses = [
      { list: [], pagination: { page: 2, pageSize: 50, total: 0, totalPages: 0 } },
      {
        id: noteId,
        status: "draft",
        title: draft.title,
        category: draft.category,
        current_version: 1,
        claim_count: 0,
        published_at: null,
        updated_at: timestamp,
        published_version_id: null,
        latest_version: versionSummary,
        created_at: timestamp,
      },
      {
        list: [versionSummary],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
      { ...versionSummary, content_blocks: draft.content_blocks },
    ];
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse(responses.shift());
    }) as typeof fetch;

    await listMaterialNotes({
      page: 2,
      pageSize: 50,
      status: "published",
      keyword: "开工",
    });
    await getMaterialNote(noteId);
    const history = await listMaterialNoteVersions(noteId, { page: 1, pageSize: 20 });
    const version = await getMaterialNoteVersion(noteId, versionId);

    expect(calls.map((call) => call.url)).toEqual([
      "/api/backend/tenant/douyin-material-notes?page=2&pageSize=50&status=published&keyword=%E5%BC%80%E5%B7%A5",
      `/api/backend/tenant/douyin-material-notes/${noteId}`,
      `/api/backend/tenant/douyin-material-notes/${noteId}/versions?page=1&pageSize=20`,
      `/api/backend/tenant/douyin-material-notes/${noteId}/versions/${versionId}`,
    ]);
    expect(JSON.stringify(history)).not.toContain("content_blocks");
    expect(version.content_blocks).toEqual(draft.content_blocks);
  });

  test("创建一次提交资料和版本 1，后续保存只追加不可变版本", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse(calls.length === 1
        ? { note_id: noteId, version_id: versionId, version_no: 1, status: "draft" }
        : { note_id: noteId, version_id: secondCommandKey, version_no: 2, status: "draft" });
    }) as typeof fetch;

    await createMaterialNote(draft);
    await appendMaterialNoteVersion(noteId, { ...draft, title: "装修开工清单（修订）" });

    expect(calls.map((call) => ({
      url: call.url,
      method: call.init?.method,
      body: JSON.parse(String(call.init?.body)),
    }))).toEqual([
      {
        url: "/api/backend/tenant/douyin-material-notes",
        method: "POST",
        body: draft,
      },
      {
        url: `/api/backend/tenant/douyin-material-notes/${noteId}/versions`,
        method: "POST",
        body: { ...draft, title: "装修开工清单（修订）" },
      },
    ]);
  });

  test("状态命令每次新建 UUID，同一失败请求重试复用原 key 和原 payload", async () => {
    const generated = [commandKey, secondCommandKey];
    const randomUUID = () => generated.shift()!;
    const request = createMaterialNoteCommandRequest({
      noteId,
      action: "publish",
      expectedStatus: "draft",
      versionId,
    }, randomUUID);
    const nextRequest = createMaterialNoteCommandRequest({
      noteId,
      action: "archive",
      expectedStatus: "published",
      reason: "停止公开",
    }, randomUUID);
    expect(request.idempotencyKey).toBe(commandKey);
    expect(nextRequest.idempotencyKey).toBe(secondCommandKey);

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        note_id: noteId,
        status: "published",
        published_version_id: versionId,
        published_at: timestamp,
      });
    }) as typeof fetch;

    await executeMaterialNoteCommand(request);
    await executeMaterialNoteCommand(request);

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.url).toBe(`/api/backend/tenant/douyin-material-notes/${noteId}/publish`);
      expect(new Headers(call.init?.headers).get("Idempotency-Key")).toBe(commandKey);
      expect(JSON.parse(String(call.init?.body))).toEqual({
        version_id: versionId,
        expected_status: "draft",
      });
    }
    expect(calls[0]?.init?.body).toBe(calls[1]?.init?.body);
  });

  test("撤回必须填写原因且归档、撤回 payload 明确区分", () => {
    expect(() => createMaterialNoteCommandRequest({
      noteId,
      action: "withdraw",
      expectedStatus: "published",
      reason: "   ",
    }, () => commandKey)).toThrow("撤回原因不能为空");

    const archive = createMaterialNoteCommandRequest({
      noteId,
      action: "archive",
      expectedStatus: "published",
      reason: "暂时下线",
    }, () => commandKey);
    const withdraw = createMaterialNoteCommandRequest({
      noteId,
      action: "withdraw",
      expectedStatus: "published",
      reason: "内容合规撤回",
    }, () => secondCommandKey);
    expect(archive.path.endsWith("/archive")).toBe(true);
    expect(withdraw.path.endsWith("/withdraw")).toBe(true);
    expect(archive.body).toEqual({ expected_status: "published", reason: "暂时下线" });
    expect(withdraw.body).toEqual({ expected_status: "published", reason: "内容合规撤回" });
  });

  test("拒绝发布状态与发布指针不一致的命令响应", async () => {
    const request = createMaterialNoteCommandRequest({
      noteId,
      action: "publish",
      expectedStatus: "draft",
      versionId,
    }, () => commandKey);
    globalThis.fetch = (async (_url, _init) => jsonResponse({
      note_id: noteId,
      status: "published",
      published_version_id: null,
      published_at: null,
    })) as typeof fetch;

    await expect(executeMaterialNoteCommand(request)).rejects.toThrow();
  });
});
