import { expect, mock, test } from "bun:test";
import type { PublishedRenderingStyle } from "../../api/rendering-styles";
import { ApiRequestError } from "../../api/request";
import type { PrivateImage } from "../../platform/private-image";
import { readRenderingRecovery, writeRenderingRecovery } from "../../platform/rendering-recovery";
import { createRenderingStyleDetailPageDefinition } from "./page";

const STYLE: PublishedRenderingStyle = {
  id: "11111111-1111-4111-8111-111111111111", title: "暖色客厅",
  space: "living_room", style: "modern_simple", color_notes: "暖白",
  material_notes: "木饰面", source_type: "ai_concept",
  image_url: "https://cdn.example.com/rendering.webp",
  published_at: "2026-09-13T08:00:00.000Z",
};
const OWNER = { tenantId: STYLE.id, appId: "tt-app", installationId: STYLE.id,
  subjectHash: "a".repeat(64) };
const OTHER = { ...OWNER, subjectHash: "b".repeat(64) };

test("ready room image can be previewed, replaced without losing the old image, and removed from the draft", async () => {
  const replacementId = "22222222-2222-4222-8222-222222222222";
  const previews: string[] = [];
  const image: PrivateImage = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    mimeType: "image/jpeg", sizeBytes: 4 };
  let resolvePut!: () => void;
  const put = new Promise<void>((resolve) => { resolvePut = resolve; });
  let uploadCount = 0;
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: async () => image,
    createRenderingUploadIntent: async () => { uploadCount++; return { intentId: replacementId,
      uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }; },
    putRenderingBytes: async () => put,
    completeRenderingUploadWithRetry: async () => ({ fileId: replacementId, status: "ready" }),
    fetchRenderingUploadStatus: async () => ({ fileId: STYLE.id, status: "ready", reviewState: null }),
    fetchRenderingUploadPreview: async () => "https://private.example.com/signed.webp",
    previewImage: ({ current }) => { if (current) previews.push(current); },
    readRenderingRecovery: () => ({ styleId: STYLE.id, roomIntentId: null, floorIntentId: null,
      roomFileId: STYLE.id, floorFileId: null, jobRequest: null, jobId: null, savedAt: Date.now() }),
    writeRenderingRecovery: () => true,
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id }); await flush();
  expect(view.data.roomPreviewUrl).toBe("https://private.example.com/signed.webp");
  await view.preview("room");
  expect(previews).toEqual(["https://private.example.com/signed.webp"]);
  const replacing = view.upload("room"); await flush();
  expect(uploadCount).toBe(1);
  expect(view.data.roomFileId).toBe(STYLE.id);
  resolvePut(); await replacing;
  expect(view.data.roomFileId).toBe(replacementId);
  view.removeFromDraft("room");
  expect(view.data.roomFileId).toBe("");
  expect(view.data.canGenerate).toBe(false);
});

test("closed generation admission releases the draft so its image can be changed", async () => {
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined, showToast: () => undefined,
    choosePrivateImage: async () => { throw new Error("unused"); },
    createRenderingUploadIntent: async () => { throw new Error("unused"); },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => { throw new Error("unused"); },
    readRenderingRecovery: () => ({ styleId: STYLE.id, roomIntentId: null, floorIntentId: null,
      roomFileId: STYLE.id, floorFileId: null, jobRequest: null, jobId: null, savedAt: Date.now() }),
    writeRenderingRecovery: () => true,
    fetchRenderingUploadStatus: async () => ({ fileId: STYLE.id, status: "ready", reviewState: null }),
    createRenderingJob: async () => { throw new ApiRequestError(503, "RENDERING_JOB_DISABLED", "closed"); },
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id }); await flush();
  await view.submitJob();
  expect(view.data.jobDraftLocked).toBe(false);
  expect(view.data.generateButtonLabel).toBe("生成 AI 参考效果图");
  view.removeFromDraft("room");
  expect(view.data.roomFileId).toBe("");
});

test("an old status failure cannot remove a newly confirmed replacement", async () => {
  const replacementId = "22222222-2222-4222-8222-222222222222";
  let rejectOld!: (error: unknown) => void;
  const oldStatus = new Promise<never>((_resolve, reject) => { rejectOld = reject; });
  const image: PrivateImage = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    mimeType: "image/jpeg", sizeBytes: 4 };
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined, showToast: () => undefined,
    choosePrivateImage: async () => image,
    createRenderingUploadIntent: async () => ({ intentId: replacementId,
      uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }),
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: replacementId, status: "ready" }),
    fetchRenderingUploadStatus: async () => oldStatus,
    readRenderingRecovery: () => ({ styleId: STYLE.id, roomIntentId: null, floorIntentId: null,
      roomFileId: STYLE.id, floorFileId: null, jobRequest: null, jobId: null, savedAt: Date.now() }),
    writeRenderingRecovery: () => true,
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id }); await flush();
  await view.upload("room");
  expect(view.data.roomFileId).toBe(replacementId);
  rejectOld(new ApiRequestError(404, "RENDERING_INPUT_NOT_FOUND", "old image missing"));
  await flush();
  expect(view.data.roomFileId).toBe(replacementId);
  expect(view.data.roomUploadStatus).toBe("ready");
});

test("native private image preview failure shows a retryable message", async () => {
  const toasts: string[] = [];
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: ({ title }) => { toasts.push(title); },
    choosePrivateImage: async () => { throw new Error("unused"); },
    createRenderingUploadIntent: async () => { throw new Error("unused"); },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => { throw new Error("unused"); },
    fetchRenderingUploadPreview: async () => "https://private.example.com/signed.webp",
    previewImage: ({ fail }) => { fail?.({ errMsg: "download failed" }); },
    readRenderingRecovery: () => ({ styleId: STYLE.id, roomIntentId: null, floorIntentId: null,
      roomFileId: STYLE.id, floorFileId: null, jobRequest: null, jobId: null, savedAt: Date.now() }),
    writeRenderingRecovery: () => true,
    fetchRenderingUploadStatus: async () => ({ fileId: STYLE.id, status: "ready", reviewState: null }),
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id }); await flush();
  await view.preview("room");
  expect(toasts).toEqual(["暂无法查看图片，请稍后重试"]);
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

test("detail requires a room photo, then accepts an optional ready floor plan", async () => {
  const purposes: string[] = [];
  const toasts: string[] = [];
  const image: PrivateImage = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    mimeType: "image/jpeg", sizeBytes: 4 };
  const page = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: ({ title }) => { toasts.push(title); },
    choosePrivateImage: async () => image,
    createRenderingUploadIntent: async (_client, input) => {
      purposes.push(input.purpose);
      return { intentId: STYLE.id, uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" };
    },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "ready" }),
  });
  const view = Object.assign(page, { setData(patch: Record<string, unknown>) { Object.assign(page.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  await view.upload("floor_plan");
  expect(purposes).toEqual([]);
  expect(toasts[0]).toContain("房间照");
  expect(view.data.floorUploadMessage).toContain("先上传房间照");
  await view.upload("room");
  expect(view.data.roomUploadStatus).toBe("ready");
  expect(view.data.roomFileId).toBe(STYLE.id);
  await view.upload("floor_plan");
  expect(purposes).toEqual(["room", "floor_plan"]);
  expect(view.data.floorUploadStatus).toBe("ready");
  expect(view.data.floorFileId).toBe(STYLE.id);
  expect(view.data.canGenerate).toBe(true);
});

test("detail keeps the same intent for an uncertain PUT and retryable completion", async () => {
  const image: PrivateImage = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    mimeType: "image/jpeg", sizeBytes: 4 };
  let intentCalls = 0;
  let completeCalls = 0;
  const page = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: async () => image,
    createRenderingUploadIntent: async () => { intentCalls++; return { intentId: STYLE.id,
      uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }; },
    putRenderingBytes: async () => { throw new ApiRequestError(0, "COS_PUT_UNCERTAIN", "未知"); },
    completeRenderingUploadWithRetry: async () => {
      completeCalls++;
      if (completeCalls === 1) throw new ApiRequestError(409, "RENDERING_UPLOAD_PROCESSING", "处理中");
      return { fileId: STYLE.id, status: "ready" };
    },
  });
  const view = Object.assign(page, { setData(patch: Record<string, unknown>) { Object.assign(page.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  await view.upload("room");
  expect(view.data.roomUploadStatus).toBe("retry_complete");
  await view.retryComplete("room");
  expect(view.data.roomUploadStatus).toBe("ready");
  expect(intentCalls).toBe(1);
  expect(completeCalls).toBe(2);
});

test("upload maps 401 and missing-company 409 without attempting a COS PUT", async () => {
  const image: PrivateImage = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    mimeType: "image/jpeg", sizeBytes: 4 };
  const errors = [
    new ApiRequestError(401, "AUTH_REQUIRED", "token"),
    new ApiRequestError(409, "RENDERING_TENANT_CONTEXT_REQUIRED", "company"),
  ];
  let putCalls = 0;
  const page = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: async () => image,
    createRenderingUploadIntent: async () => { throw errors.shift(); },
    putRenderingBytes: async () => { putCalls++; },
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "ready" }),
  });
  const view = Object.assign(page, { setData(patch: Record<string, unknown>) { Object.assign(page.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  await view.upload("room");
  expect(view.data.roomUploadMessage).toContain("登录状态已失效");
  await view.upload("room");
  expect(view.data.roomUploadMessage).toContain("选择装修公司");
  expect(putCalls).toBe(0);
});

test("undeclared album scope is shown as a configuration issue before intent", async () => {
  let intents = 0;
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: async () => {
      throw new ApiRequestError(0, "IMAGE_PRIVACY_SCOPE_UNDECLARED", "图片选择能力未在平台隐私协议声明");
    },
    createRenderingUploadIntent: async () => { intents++; throw new Error("unexpected intent"); },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "ready" }),
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  await view.upload("room");
  expect(view.data.roomUploadMessage).toContain("图片选择暂不可用");
  expect(view.data.roomUploadMessage).not.toContain("上传失败");
  expect(intents).toBe(0);
});

test("422 clears rejected intent so selecting a replacement issues a new ID", async () => {
  const image: PrivateImage = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    mimeType: "image/jpeg", sizeBytes: 4 };
  let intentCalls = 0;
  let completes = 0;
  const page = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: async () => image,
    createRenderingUploadIntent: async () => { intentCalls++; return { intentId: STYLE.id,
      uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }; },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => {
      completes++;
      if (completes === 1) throw new ApiRequestError(422, "RENDERING_IMAGE_REJECTED", "bad");
      return { fileId: STYLE.id, status: "ready" };
    },
  });
  const view = Object.assign(page, { setData(patch: Record<string, unknown>) { Object.assign(page.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  await view.upload("room");
  expect(view.data.roomUploadStatus).toBe("error");
  expect(view.data.roomUploadMessage).toContain("图片不合格");
  await view.upload("room");
  expect(intentCalls).toBe(2);
  expect(view.data.roomUploadStatus).toBe("ready");
});

test("leaving detail before image selection resolves prevents a stale intent request", async () => {
  let resolveImage!: (image: PrivateImage) => void;
  let intents = 0;
  const page = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: () => new Promise((resolve) => { resolveImage = resolve; }),
    createRenderingUploadIntent: async () => { intents++; throw new Error("stale request"); },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "ready" }),
  });
  const view = Object.assign(page, { setData(patch: Record<string, unknown>) { Object.assign(page.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  const upload = view.upload("room");
  await flush();
  view.onUnload();
  resolveImage({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    mimeType: "image/jpeg", sizeBytes: 4 });
  await upload;
  expect(intents).toBe(0);
  expect(view.data.roomFileId).toBe("");
});

test("selection resumes after the native picker hides and shows the detail page", async () => {
  let resolveImage!: (image: PrivateImage) => void;
  let intents = 0;
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: () => new Promise((resolve) => { resolveImage = resolve; }),
    createRenderingUploadIntent: async () => { intents++; return { intentId: STYLE.id,
      uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }; },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "ready" }),
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  const upload = view.upload("room");
  await flush();
  view.onHide();
  view.onShow();
  await flush();
  resolveImage({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    mimeType: "image/jpeg", sizeBytes: 4 });
  await upload;
  expect(intents).toBe(1);
  expect(view.data.roomUploadStatus).toBe("ready");
});

test("selection waits for the detail page to show before starting a private upload", async () => {
  let resolveImage!: (image: PrivateImage) => void;
  let intents = 0;
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: () => new Promise((resolve) => { resolveImage = resolve; }),
    createRenderingUploadIntent: async () => { intents++; return { intentId: STYLE.id,
      uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }; },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "ready" }),
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  const upload = view.upload("room");
  await flush();
  view.onHide();
  resolveImage({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    mimeType: "image/jpeg", sizeBytes: 4 });
  await flush();
  expect(intents).toBe(0);
  view.onShow();
  await upload;
  expect(intents).toBe(1);
  expect(view.data.roomUploadStatus).toBe("ready");
});

test("picker failure after a native hide becomes visible when detail shows again", async () => {
  let rejectImage!: (error: ApiRequestError) => void;
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: () => new Promise((_resolve, reject) => { rejectImage = reject; }),
    createRenderingUploadIntent: async () => { throw new Error("unexpected intent"); },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "ready" }),
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  const upload = view.upload("room");
  await flush();
  view.onHide();
  rejectImage(new ApiRequestError(0, "UNSUPPORTED_PRIVATE_IMAGE", "仅支持静态 JPEG、PNG 或 WebP 图片"));
  await flush();
  view.onShow();
  await upload;
  expect(view.data.roomUploadStatus).toBe("error");
  expect(view.data.roomUploadMessage).toContain("仅支持静态 JPEG");
});

test("an uncertain PUT followed by missing raw asks for a new image instead of blaming its format", async () => {
  const image: PrivateImage = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    mimeType: "image/jpeg", sizeBytes: 4 };
  const page = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: async () => image,
    createRenderingUploadIntent: async () => ({ intentId: STYLE.id,
      uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }),
    putRenderingBytes: async () => { throw new ApiRequestError(0, "COS_PUT_UNCERTAIN", "unknown"); },
    completeRenderingUploadWithRetry: async () => {
      throw new ApiRequestError(422, "RENDERING_IMAGE_REJECTED", "raw missing");
    },
  });
  const view = Object.assign(page, { setData(patch: Record<string, unknown>) { Object.assign(page.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  await view.upload("room");
  expect(view.data.roomUploadStatus).toBe("error");
  expect(view.data.roomUploadMessage).toContain("上传未完成");
  expect(view.data.roomUploadMessage).not.toContain("图片不合格");
});

test("returning while PUT is in flight waits for that PUT before confirming the same ID", async () => {
  const api = {} as never;
  const image: PrivateImage = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    mimeType: "image/jpeg", sizeBytes: 4 };
  let finishPut!: () => void;
  let completeCalls = 0;
  let intentCalls = 0;
  const dependencies = {
    getApp: () => ({ api, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: async () => image,
    createRenderingUploadIntent: async () => { intentCalls++; return { intentId: STYLE.id,
      uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }; },
    putRenderingBytes: () => new Promise<void>((resolve) => { finishPut = resolve; }),
    completeRenderingUploadWithRetry: async () => { completeCalls++;
      return { fileId: STYLE.id, status: "ready" as const }; },
  };
  const definition = createRenderingStyleDetailPageDefinition(dependencies);
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  const upload = view.upload("room");
  await flush();
  view.onHide();
  view.onShow();
  await flush();
  const retry = view.retryComplete("room");
  await flush();
  expect(completeCalls).toBe(0);
  finishPut();
  await Promise.all([upload, retry]);
  expect(completeCalls).toBe(1);
  expect(intentCalls).toBe(1);
});

test("unloading and reopening keeps an in-flight intent ID scoped to the app session", async () => {
  const api = {} as never;
  let intentCalls = 0;
  let completeCalls = 0;
  const dependencies = {
    getApp: () => ({ api, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: async () => ({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
      mimeType: "image/jpeg", sizeBytes: 4 }) as PrivateImage,
    createRenderingUploadIntent: async () => { intentCalls++; return { intentId: STYLE.id,
      uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }; },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => { completeCalls++;
      if (completeCalls === 1) throw new ApiRequestError(409, "RENDERING_UPLOAD_PROCESSING", "处理中");
      return { fileId: STYLE.id, status: "ready" as const }; },
  };
  const first = createRenderingStyleDetailPageDefinition(dependencies);
  const firstView = Object.assign(first, { setData(patch: Record<string, unknown>) { Object.assign(first.data, patch); } });
  firstView.onLoad({ id: STYLE.id });
  await flush();
  await firstView.upload("room");
  firstView.onUnload();
  const second = createRenderingStyleDetailPageDefinition(dependencies);
  const secondView = Object.assign(second, { setData(patch: Record<string, unknown>) { Object.assign(second.data, patch); } });
  secondView.onLoad({ id: STYLE.id });
  await flush();
  expect(secondView.data.roomUploadStatus).toBe("retry_complete");
  await secondView.retryComplete("room");
  expect(secondView.data.roomFileId).toBe(STYLE.id);
  expect(intentCalls).toBe(1);
});

test("reopening detail keeps a confirmed room file and allows a deliberate replacement", async () => {
  const api = {} as never;
  let intentCalls = 0;
  const dependencies = {
    getApp: () => ({ api, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: async () => ({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
      mimeType: "image/jpeg", sizeBytes: 4 }) as PrivateImage,
    createRenderingUploadIntent: async () => { intentCalls++; return { intentId: STYLE.id,
      uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }; },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "ready" as const }),
    fetchRenderingUploadStatus: async () => ({ fileId: STYLE.id, status: "ready" as const, reviewState: null }),
  };
  const first = createRenderingStyleDetailPageDefinition(dependencies);
  const firstView = Object.assign(first, { setData(patch: Record<string, unknown>) { Object.assign(first.data, patch); } });
  firstView.onLoad({ id: STYLE.id });
  await flush();
  await firstView.upload("room");
  firstView.onUnload();

  const second = createRenderingStyleDetailPageDefinition(dependencies);
  const secondView = Object.assign(second, { setData(patch: Record<string, unknown>) { Object.assign(second.data, patch); } });
  secondView.onLoad({ id: STYLE.id });
  await flush();
  expect(secondView.data.roomFileId).toBe(STYLE.id);
  expect(secondView.data.roomUploadStatus).toBe("ready");
  await secondView.upload("room");
  expect(intentCalls).toBe(2);
});

test("terminal missing, conflicted or unauthorized intent lets the user start fresh", async () => {
  const image: PrivateImage = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    mimeType: "image/jpeg", sizeBytes: 4 };
  for (const error of [new ApiRequestError(404, "RENDERING_INPUT_NOT_FOUND", "missing"),
    new ApiRequestError(409, "RENDERING_INPUT_STATE_CONFLICT", "conflict"),
    new ApiRequestError(401, "AUTH_REQUIRED", "expired")]) {
    let intentCalls = 0;
    let completeCalls = 0;
    const definition = createRenderingStyleDetailPageDefinition({
      getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
        recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
      fetchPublishedStyleDetail: async () => STYLE,
      navigateToList: async () => undefined,
      showToast: () => undefined,
      choosePrivateImage: async () => image,
      createRenderingUploadIntent: async () => { intentCalls++; return { intentId: STYLE.id,
        uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }; },
      putRenderingBytes: async () => undefined,
      completeRenderingUploadWithRetry: async () => { completeCalls++;
        if (completeCalls === 1) throw error;
        return { fileId: STYLE.id, status: "ready" }; },
    });
    const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
    view.onLoad({ id: STYLE.id });
    await flush();
    await view.upload("room");
    expect(view.data.roomUploadStatus).toBe("error");
    await view.upload("room");
    expect(intentCalls).toBe(2);
    expect(view.data.roomUploadStatus).toBe("ready");
  }
});

test("completed upload immediately allows Ark generation and displays the private AI reference result", async () => {
  const image: PrivateImage = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    mimeType: "image/jpeg", sizeBytes: 4 };
  const submitted: unknown[] = [];
  const previews: Array<{ urls: string[]; current?: string }> = [];
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: async () => image,
    createRenderingUploadIntent: async () => ({ intentId: STYLE.id,
      uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }),
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "ready" }),
    fetchRenderingUploadStatus: async () => ({ fileId: STYLE.id, status: "ready", reviewState: null }),
    fetchRenderingUploadPreview: async () => "https://private.example.com/room.webp",
    previewImage: ({ urls, current }) => { previews.push({ urls, current }); },
    createIdempotencyKey: () => "22222222-2222-4222-8222-222222222222",
    createRenderingJob: async (_client, input) => { submitted.push(input); return { jobId: STYLE.id, status: "succeeded" }; },
    fetchRenderingJobStatus: async () => ({ jobId: STYLE.id, status: "succeeded",
      result: { url: "https://private.example.com/result.webp", expiresAt: "2099-01-01T00:00:00Z", sizeBytes: 42 } }),
    resolveRecoveryIdentity: async () => OWNER,
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  await view.upload("room");
  await flush();
  expect(view.data.roomUploadMessage).toContain("已就绪");
  expect(view.data.roomPreviewUrl).toContain("room.webp");
  expect(view.data.canGenerate).toBe(true);
  view.onSelectMode({ currentTarget: { dataset: { value: "renovation" } } });
  view.onKeepNotesInput({ detail: { value: "保留木地板" } });
  await view.submitJob();
  expect(submitted).toEqual([{ style_asset_id: STYLE.id, room_file_id: STYLE.id,
    space: "living_room", mode: "renovation", keep_notes: "保留木地板",
    idempotency_key: "22222222-2222-4222-8222-222222222222" }]);
  expect(view.data.jobStatus).toBe("succeeded");
  expect(view.data.resultUrl).toContain("result.webp");
  await view.previewComparison("result");
  expect(previews).toEqual([{
    urls: ["https://private.example.com/room.webp", "https://private.example.com/result.webp"],
    current: "https://private.example.com/result.webp",
  }]);
});

test("queued and processing jobs expose recoverable busy presentation without fake progress", async () => {
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: async () => { throw new Error("unused"); },
    createRenderingUploadIntent: async () => { throw new Error("unused"); },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => { throw new Error("unused"); },
    readRenderingRecovery: () => ({ styleId: STYLE.id, roomIntentId: null, floorIntentId: null,
      roomFileId: STYLE.id, floorFileId: null, jobRequest: null, jobId: STYLE.id, savedAt: Date.now() }),
    fetchRenderingUploadStatus: async () => ({ fileId: STYLE.id, status: "ready", reviewState: null }),
    fetchRenderingUploadPreview: async () => "https://private.example.com/room.webp",
    fetchRenderingJobStatus: async () => ({ jobId: STYLE.id, status: "processing", result: null }),
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  expect(view.data).toMatchObject({
    jobStatus: "processing",
    jobMessage: "AI 参考效果图生成中，页面会自动更新进度",
    jobRefreshAvailable: false,
  });
});

test("Ark content refusal gives a retryable explanation without exposing provider details", async () => {
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined, showToast: () => undefined,
    choosePrivateImage: async () => { throw new Error("unused"); },
    createRenderingUploadIntent: async () => { throw new Error("unused"); },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => { throw new Error("unused"); },
    resolveRecoveryIdentity: async () => OWNER,
    readRenderingRecovery: () => ({ styleId: STYLE.id, roomIntentId: null, floorIntentId: null,
      roomFileId: STYLE.id, floorFileId: null, jobRequest: null, jobId: STYLE.id, savedAt: Date.now() }),
    fetchRenderingUploadStatus: async () => ({ fileId: STYLE.id, status: "ready", reviewState: null }),
    fetchRenderingJobStatus: async () => ({ jobId: STYLE.id, status: "failed", result: null,
      failureReason: "content_rejected" }),
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  expect(view.data.jobMessage).toContain("模型未接受当前图片或描述");
  expect(view.data.resultUrl).toBe("");
});

test("unknown job submission keeps the persisted request and retries with its original idempotency key", async () => {
  const saved = new Map<string, unknown>();
  const storage = { read: (key: string) => saved.get(key),
    write: (key: string, value: unknown) => { saved.set(key, value); },
    remove: (key: string) => { saved.delete(key); } };
  const requests: unknown[] = [];
  const makeIntegratedPage = () => {
    const definition = createRenderingStyleDetailPageDefinition({
      getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
        recordAnalytics: () => undefined }) as never,
      fetchPublishedStyleDetail: async () => STYLE,
      navigateToList: async () => undefined,
      showToast: () => undefined,
      choosePrivateImage: async () => { throw new Error("unused"); },
      createRenderingUploadIntent: async () => { throw new Error("unused"); },
      putRenderingBytes: async () => undefined,
      completeRenderingUploadWithRetry: async () => { throw new Error("unused"); },
      fetchRenderingUploadStatus: async () => ({ fileId: STYLE.id, status: "ready", reviewState: null }),
      readRenderingRecovery: (identity, id) => readRenderingRecovery(identity, id, storage),
      writeRenderingRecovery: (identity, record) => writeRenderingRecovery(identity, record, storage),
      resolveRecoveryIdentity: async () => OWNER,
      createIdempotencyKey: () => "33333333-3333-4333-8333-333333333333",
      createRenderingJob: async (_client, input) => {
        requests.push(input);
        if (requests.length === 1) throw new ApiRequestError(0, "NETWORK_ERROR", "unknown");
        return { jobId: STYLE.id, status: "succeeded" };
      },
      fetchRenderingJobStatus: async () => ({ jobId: STYLE.id, status: "succeeded", result: null }),
    });
    return Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  };
  writeRenderingRecovery(OWNER, { styleId: STYLE.id, roomIntentId: null, floorIntentId: null,
    roomFileId: STYLE.id, floorFileId: null, jobRequest: null, jobId: null, savedAt: Date.now() }, storage);
  const first = makeIntegratedPage();
  first.onLoad({ id: STYLE.id });
  await flush();
  expect(first.data.canGenerate).toBe(true);
  await first.submitJob();
  expect(first.data.jobMessage).toContain("继续提交同一任务");
  first.onUnload();
  const reopened = makeIntegratedPage();
  reopened.onLoad({ id: STYLE.id });
  await flush();
  expect(reopened.data.jobDraftLocked).toBe(true);
  await reopened.submitJob();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
});

test("account switch clears the prior result and draft, then loads only the new owner's recovery", async () => {
  let identity = OWNER;
  const values = new Map<string, unknown>();
  const storage = { read: (key: string) => values.get(key),
    write: (key: string, value: unknown) => { values.set(key, value); },
    remove: (key: string) => { values.delete(key); } };
  const request = { style_asset_id: STYLE.id, room_file_id: STYLE.id, space: "living_room" as const,
    mode: "renovation" as const, keep_notes: "A 的私有备注", idempotency_key: STYLE.id };
  writeRenderingRecovery(OWNER, { styleId: STYLE.id, roomIntentId: null, floorIntentId: null,
    roomFileId: STYLE.id, floorFileId: null, jobRequest: request, jobId: STYLE.id, savedAt: Date.now() }, storage);
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => identity,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined, showToast: () => undefined,
    choosePrivateImage: async () => { throw new Error("unused"); },
    createRenderingUploadIntent: async () => { throw new Error("unused"); },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => { throw new Error("unused"); },
    readRenderingRecovery: (owner, id) => readRenderingRecovery(owner, id, storage),
    writeRenderingRecovery: (owner, record) => writeRenderingRecovery(owner, record, storage),
    fetchRenderingUploadStatus: async () => ({ fileId: STYLE.id, status: "ready", reviewState: null }),
    fetchRenderingJobStatus: async () => ({ jobId: STYLE.id, status: "succeeded", result: {
      url: "https://private.example.com/A.webp", expiresAt: "2099-01-01T00:00:00Z", sizeBytes: 42 } }),
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  expect(view.data.resultUrl).toContain("A.webp");
  expect(view.data.keepNotes).toBe("A 的私有备注");
  view.onHide();
  expect(view.data.resultUrl).toBe("");
  expect(view.data.keepNotes).toBe("");
  expect(view.data.roomFileId).toBe("");
  expect(view.data.jobId).toBe("");
  identity = OTHER;
  view.onShow();
  expect(view.data.keepNotes).toBe("");
  expect(view.data.roomFileId).toBe("");
  await flush();
  expect(view.data.resultUrl).toBe("");
  expect(view.data.keepNotes).toBe("");
  expect(view.data.roomFileId).toBe("");
  expect(view.data.jobId).toBe("");
  expect(view.data.jobDraftLocked).toBe(false);
});

test("missing job unlocks draft while temporary job errors retain its idempotency request", async () => {
  let missing = false;
  const request = { style_asset_id: STYLE.id, room_file_id: STYLE.id, space: "living_room" as const,
    mode: "renovation" as const, idempotency_key: STYLE.id };
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined, showToast: () => undefined,
    choosePrivateImage: async () => { throw new Error("unused"); },
    createRenderingUploadIntent: async () => { throw new Error("unused"); },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => { throw new Error("unused"); },
    readRenderingRecovery: () => ({ styleId: STYLE.id, roomIntentId: null, floorIntentId: null,
      roomFileId: STYLE.id, floorFileId: null, jobRequest: request, jobId: STYLE.id, savedAt: Date.now() }),
    writeRenderingRecovery: () => true,
    fetchRenderingUploadStatus: async () => ({ fileId: STYLE.id, status: "ready", reviewState: null }),
    fetchRenderingJobStatus: async () => { throw new ApiRequestError(missing ? 404 : 0,
      missing ? "RENDERING_JOB_NOT_FOUND" : "NETWORK_ERROR", "failed"); },
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id }); await flush();
  expect(view.data.jobDraftLocked).toBe(true);
  expect(view.data.jobId).toBe(STYLE.id);
  missing = true;
  await view.refreshJob(true);
  expect(view.data.jobDraftLocked).toBe(false);
  expect(view.data.jobId).toBe("");
  expect(view.data.resultUrl).toBe("");
});

test("unconfirmed identity neither replays stored IDs nor submits a paid job", async () => {
  let reads = 0;
  let submits = 0;
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => null,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined, showToast: () => undefined,
    choosePrivateImage: async () => { throw new Error("unused"); },
    createRenderingUploadIntent: async () => { throw new Error("unused"); },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => { throw new Error("unused"); },
    readRenderingRecovery: () => { reads++; return null; },
    createRenderingJob: async () => { submits++; return { jobId: STYLE.id, status: "queued" }; },
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id }); await flush();
  expect(reads).toBe(0);
  expect(view.data.canGenerate).toBe(false);
  await view.submitJob();
  expect(submits).toBe(0);
});

test("missing upload clears its file ID but a temporary review error preserves it", async () => {
  let missing = false;
  const persisted: unknown[] = [];
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => OWNER,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined, showToast: () => undefined,
    choosePrivateImage: async () => { throw new Error("unused"); },
    createRenderingUploadIntent: async () => { throw new Error("unused"); },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => { throw new Error("unused"); },
    readRenderingRecovery: () => ({ styleId: STYLE.id, roomIntentId: null, floorIntentId: null,
      roomFileId: STYLE.id, floorFileId: null, jobRequest: null, jobId: null, savedAt: Date.now() }),
    writeRenderingRecovery: (_owner, record) => { persisted.push(record); return true; },
    fetchRenderingUploadStatus: async () => { throw new ApiRequestError(missing ? 404 : 0,
      missing ? "RENDERING_INPUT_NOT_FOUND" : "NETWORK_ERROR", "failed"); },
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id }); await flush();
  expect(view.data.roomFileId).toBe(STYLE.id);
  missing = true;
  await view.refreshUploads();
  expect(view.data.roomFileId).toBe("");
  expect((persisted[persisted.length - 1] as { roomFileId: string | null }).roomFileId).toBeNull();
});

test("an old account's late job response cannot write into the new account's page", async () => {
  let identity = OWNER;
  let finishJob!: (value: { jobId: string; status: "succeeded" }) => void;
  const job = new Promise<{ jobId: string; status: "succeeded" }>((resolve) => { finishJob = resolve; });
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    resolveRecoveryIdentity: async () => identity,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined, showToast: () => undefined,
    choosePrivateImage: async () => { throw new Error("unused"); },
    createRenderingUploadIntent: async () => { throw new Error("unused"); },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => { throw new Error("unused"); },
    readRenderingRecovery: (owner) => owner.subjectHash === OWNER.subjectHash ? {
      styleId: STYLE.id, roomIntentId: null, floorIntentId: null, roomFileId: STYLE.id,
      floorFileId: null, jobRequest: null, jobId: null, savedAt: Date.now() } : null,
    writeRenderingRecovery: () => true,
    fetchRenderingUploadStatus: async () => ({ fileId: STYLE.id, status: "ready", reviewState: null }),
    createRenderingJob: async () => job,
    fetchRenderingJobStatus: async () => ({ jobId: STYLE.id, status: "succeeded", result: {
      url: "https://private.example.com/A.webp", expiresAt: "2099-01-01T00:00:00Z", sizeBytes: 42 } }),
  });
  const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
  view.onLoad({ id: STYLE.id }); await flush();
  expect(view.data.canGenerate).toBe(true);
  const submission = view.submitJob(); await flush();
  view.onHide(); identity = OTHER; view.onShow(); await flush();
  finishJob({ jobId: STYLE.id, status: "succeeded" });
  await submission;
  expect(view.data.jobId).toBe("");
  expect(view.data.resultUrl).toBe("");
  expect(view.data.jobDraftLocked).toBe(false);
  expect(view.data.roomFileId).toBe("");
});

function makePage(fetchPublishedStyleDetail: ReturnType<typeof mock>) {
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }),
    resolveRecoveryIdentity: async () => OWNER,
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
