import { describe, expect, test } from "bun:test";
import type {
  DouyinMaterialNoteTenantDetail,
  DouyinMaterialNoteTenantList,
  DouyinMaterialNoteTenantVersion,
} from "@gooes/domain";

import {
  buildMaterialNoteListQuery,
  getMaterialNoteActions,
  getMaterialNotePermissions,
  MATERIAL_NOTE_DEFAULT_PAGE_SIZE,
  MATERIAL_NOTE_MAX_PAGE_SIZE,
  normalizeMaterialNoteFilters,
  parseMaterialNoteDetail,
  parseMaterialNoteList,
  parseMaterialNoteVersion,
  parseMaterialNoteVersionList,
} from "./material-note-contract";

const noteId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const employeeId = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-09-01T08:00:00.000+08:00";

const versionSummary = {
  id: versionId,
  note_id: noteId,
  version: 1,
  title: "装修开工清单",
  summary: "开工前逐项确认",
  category: "施工避坑",
  applicable_to: "准备开工的业主",
  created_by: employeeId,
  created_at: timestamp,
};

describe("抖音资料后台客户端契约", () => {
  test("规范化 URL 分页和筛选并限制 pageSize 最大为 100", () => {
    expect(normalizeMaterialNoteFilters({})).toEqual({
      page: 1,
      pageSize: MATERIAL_NOTE_DEFAULT_PAGE_SIZE,
      status: "",
      keyword: "",
    });
    expect(normalizeMaterialNoteFilters({
      page: "2.9",
      pageSize: "999",
      status: "published",
      keyword: "  开工  ",
    })).toEqual({
      page: 2,
      pageSize: MATERIAL_NOTE_MAX_PAGE_SIZE,
      status: "published",
      keyword: "开工",
    });
    expect(normalizeMaterialNoteFilters({
      page: "0",
      pageSize: "NaN",
      status: "deleted",
      keyword: " ",
    })).toEqual({
      page: 1,
      pageSize: MATERIAL_NOTE_DEFAULT_PAGE_SIZE,
      status: "",
      keyword: "",
    });

    const query = buildMaterialNoteListQuery({
      page: 2,
      pageSize: 50,
      status: "archived",
      keyword: "清单",
    });
    expect(query.toString()).toBe(
      "page=2&pageSize=50&status=archived&keyword=%E6%B8%85%E5%8D%95",
    );
  });

  test("严格解析聚合列表且拒绝正文与领取人身份字段", () => {
    const page: DouyinMaterialNoteTenantList = {
      list: [{
        id: noteId,
        status: "published",
        title: "装修开工清单",
        category: "施工避坑",
        current_version: 1,
        claim_count: 12,
        published_at: timestamp,
        updated_at: timestamp,
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    expect(parseMaterialNoteList(page)).toEqual(page);
    expect(() => parseMaterialNoteList({
      ...page,
      list: [{ ...page.list[0], content_blocks: [] }],
    })).toThrow();
    expect(() => parseMaterialNoteList({
      ...page,
      list: [{ ...page.list[0], subject_hash: "secret" }],
    })).toThrow();
    expect(() => parseMaterialNoteList({
      ...page,
      list: [{ ...page.list[0], claimants: [] }],
    })).toThrow();
  });

  test("普通详情和版本历史无正文，版本详情才允许正文", () => {
    const detail: DouyinMaterialNoteTenantDetail = {
      id: noteId,
      status: "draft",
      title: "装修开工清单",
      category: "施工避坑",
      current_version: 1,
      claim_count: 0,
      published_at: null,
      updated_at: timestamp,
      published_version_id: null,
      latest_version: versionSummary,
      created_at: timestamp,
    };
    expect(parseMaterialNoteDetail(detail)).toEqual(detail);
    expect(() => parseMaterialNoteDetail({
      ...detail,
      latest_version: { ...versionSummary, content_blocks: [] },
    })).toThrow();

    const history = {
      list: [versionSummary],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    expect(parseMaterialNoteVersionList(history)).toEqual(history);
    expect(() => parseMaterialNoteVersionList({
      ...history,
      list: [{ ...versionSummary, content_blocks: [] }],
    })).toThrow();

    const fullVersion: DouyinMaterialNoteTenantVersion = {
      ...versionSummary,
      content_blocks: [{ type: "paragraph", text: "先核对施工图。" }],
    };
    expect(parseMaterialNoteVersion(fullVersion)).toEqual(fullVersion);
    expect(() => parseMaterialNoteVersion({
      ...fullVersion,
      content_blocks: [{ type: "image", fileId: versionId, alt: "图片" }],
    })).toThrow();
  });

  test("权限和状态动作矩阵与服务端一致", () => {
    expect(getMaterialNotePermissions(["douyin_material_note.read"])).toEqual({
      canRead: true,
      canManage: false,
      canPublish: false,
    });
    expect(getMaterialNotePermissions([
      "douyin_material_note.read",
      "douyin_material_note.manage",
      "douyin_material_note.publish",
    ])).toEqual({ canRead: true, canManage: true, canPublish: true });

    expect(getMaterialNoteActions("draft", true)).toEqual(["publish", "archive"]);
    expect(getMaterialNoteActions("published", true)).toEqual([
      "publish",
      "archive",
      "withdraw",
    ]);
    expect(getMaterialNoteActions("archived", true)).toEqual(["publish", "withdraw"]);
    expect(getMaterialNoteActions("withdrawn", true)).toEqual([]);
    expect(getMaterialNoteActions("published", false)).toEqual([]);
  });
});
