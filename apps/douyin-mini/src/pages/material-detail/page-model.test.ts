import { describe, expect, test } from "bun:test";

import type {
  DouyinMaterialNoteClaimResponse,
  DouyinMaterialNoteOwnedDetail,
  DouyinMaterialNotePreview,
} from "../../models";
import {
  beginDetailLoad,
  beginMaterialClaim,
  createMaterialDetailState,
  failMaterialClaimUncertain,
  resolveDetailBusinessError,
  failDetailLoad,
  invalidateMaterialDetailState,
  isCurrentDetailRequest,
  resolveMaterialClaim,
  resolveMaterialPreview,
  resolveOwnedMaterial,
  serializeMaterialBlocks,
} from "./page-model";

const NOTE_ID = "11111111-1111-4111-8111-111111111111";
const CLAIM_ID = "22222222-2222-4222-8222-222222222222";
const preview: DouyinMaterialNotePreview = {
  id: NOTE_ID,
  title: "开工清单",
  summary: "开工前逐项确认",
  category: "施工避坑",
  applicable_to: "准备开工的业主",
  published_at: "2026-09-01T08:00:00.000Z",
  claimed: false,
};
const blocks = [
  { type: "heading" as const, level: 2 as const, text: "开工准备" },
  { type: "paragraph" as const, text: "逐项核对。" },
  { type: "list" as const, style: "ordered" as const, items: ["合同", "图纸"] },
  { type: "quote" as const, text: "先确认，再施工。", attribution: "项目经理" },
  { type: "callout" as const, tone: "warning" as const, title: "注意", text: "不要跳过交底。" },
  {
    type: "image" as const,
    asset: {
      fileId: "33333333-3333-4333-8333-333333333333",
      src: "https://cdn.goodcms.cn/material-notes/checklist.webp",
      alt: "开工材料清单图片",
      width: 1200,
      height: 800,
    },
    caption: "保存到手机后按房间核对。",
  },
];
const claim: DouyinMaterialNoteClaimResponse = {
  claim_id: CLAIM_ID,
  already_claimed: false,
  claimed_at: "2026-09-01T08:30:00.000Z",
  material: { ...preview, version: 1, content_blocks: blocks },
};

describe("material detail page model", () => {
  test("moves preview to one single-flight claim and unlocks the body immediately", () => {
    const loading = beginDetailLoad(createMaterialDetailState({ kind: "preview", id: NOTE_ID }));
    const previewState = resolveMaterialPreview(loading.state, loading.request, preview);
    expect(previewState.status).toBe("preview");
    const pending = beginMaterialClaim(previewState);
    expect(pending).not.toBeNull();
    if (!pending) return;
    expect(beginMaterialClaim(pending.state)).toBeNull();

    const claimed = resolveMaterialClaim(pending.state, pending.request, claim);
    expect(claimed).toMatchObject({ status: "claimed", claimId: CLAIM_ID });
    expect(claimed.content?.content_blocks).toEqual(blocks);
  });

  test("recovers an uncertain claim only by refetch and never auto-repeats POST claim", () => {
    const loading = beginDetailLoad(createMaterialDetailState({ kind: "preview", id: NOTE_ID }));
    const previewState = resolveMaterialPreview(loading.state, loading.request, preview);
    const pending = beginMaterialClaim(previewState)!;
    const uncertain = failMaterialClaimUncertain(pending.state, pending.request);
    expect(uncertain).toMatchObject({ status: "recovering", content: null });

    const refetch = beginDetailLoad(uncertain);
    expect(refetch.request.kind).toBe("preview");
    const authoritative = resolveMaterialPreview(
      refetch.state,
      refetch.request,
      { ...preview, claimed: true },
    );
    expect(authoritative).toMatchObject({
      status: "recovery-required",
      content: null,
      shouldAutoResolveClaim: false,
    });
    expect(beginMaterialClaim(authoritative)).not.toBeNull();
  });

  test("reads an owned archived version and clears body on withdrawn or not-found", () => {
    const owned: DouyinMaterialNoteOwnedDetail = {
      claim_id: CLAIM_ID,
      id: NOTE_ID,
      version: 1,
      title: preview.title,
      summary: preview.summary,
      category: preview.category,
      applicable_to: preview.applicable_to,
      claimed_at: claim.claimed_at,
      content_blocks: blocks,
    };
    const loading = beginDetailLoad(createMaterialDetailState({ kind: "owned", claimId: CLAIM_ID }));
    const claimed = resolveOwnedMaterial(loading.state, loading.request, owned);
    expect(claimed.status).toBe("claimed");
    expect(claimed.content?.content_blocks).toEqual(blocks);

    const withdrawn = resolveDetailBusinessError(claimed, {
      statusCode: 410,
      code: "MATERIAL_NOTE_WITHDRAWN",
      message: "资料已停止提供",
    }, { kind: "detail", request: loading.request });
    expect(withdrawn).toMatchObject({ status: "withdrawn", content: null });
    const nextLoad = beginDetailLoad(claimed);
    const missing = resolveDetailBusinessError(nextLoad.state, {
      statusCode: 404,
      code: "MATERIAL_NOTE_CLAIM_NOT_FOUND",
      message: "领取记录不存在",
    }, { kind: "detail", request: nextLoad.request });
    expect(missing).toMatchObject({ status: "not-found", content: null });
  });

  test("ignores stale load and claim errors and invalidates all late work on hide", () => {
    const firstLoad = beginDetailLoad(
      createMaterialDetailState({ kind: "preview", id: NOTE_ID }),
    );
    const secondLoad = beginDetailLoad(firstLoad.state);
    expect(isCurrentDetailRequest(secondLoad.state, firstLoad.request)).toBe(false);
    expect(isCurrentDetailRequest(secondLoad.state, secondLoad.request)).toBe(true);
    expect(failDetailLoad(secondLoad.state, firstLoad.request)).toBe(secondLoad.state);
    expect(resolveDetailBusinessError(secondLoad.state, {
      statusCode: 410,
      code: "MATERIAL_NOTE_WITHDRAWN",
      message: "过期错误",
    }, { kind: "detail", request: firstLoad.request })).toBe(secondLoad.state);

    const previewState = resolveMaterialPreview(
      secondLoad.state,
      secondLoad.request,
      preview,
    );
    const pendingClaim = beginMaterialClaim(previewState)!;
    const hidden = invalidateMaterialDetailState(pendingClaim.state);
    expect(hidden).toMatchObject({ status: "idle", content: null });
    expect(resolveMaterialClaim(hidden, pendingClaim.request, claim)).toBe(hidden);
    expect(resolveDetailBusinessError(hidden, {
      statusCode: 410,
      code: "MATERIAL_NOTE_WITHDRAWN",
      message: "过期领取错误",
    }, { kind: "claim", request: pendingClaim.request })).toBe(hidden);
  });

  test("serializes supported text and image blocks deterministically", () => {
    expect(serializeMaterialBlocks(blocks)).toBe([
      "开工准备",
      "逐项核对。",
      "1. 合同\n2. 图纸",
      "“先确认，再施工。”\n——项目经理",
      "注意\n不要跳过交底。",
      "[图片] 开工材料清单图片\n保存到手机后按房间核对。\nhttps://cdn.goodcms.cn/material-notes/checklist.webp",
    ].join("\n\n"));
  });
});
