import { expect, mock, test } from "bun:test";
import type { PublishedRenderingStyle } from "../../api/rendering-styles";
import { ApiRequestError } from "../../api/request";
import type { PrivateImage } from "../../platform/private-image";
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

test("detail requires a room photo, then accepts an optional floor plan as private pending review", async () => {
  const purposes: string[] = [];
  const toasts: string[] = [];
  const image: PrivateImage = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    mimeType: "image/jpeg", sizeBytes: 4 };
  const page = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: ({ title }) => { toasts.push(title); },
    choosePrivateImage: async () => image,
    createRenderingUploadIntent: async (_client, input) => {
      purposes.push(input.purpose);
      return { intentId: STYLE.id, uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" };
    },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "pending_review" }),
  });
  const view = Object.assign(page, { setData(patch: Record<string, unknown>) { Object.assign(page.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  await view.upload("floor_plan");
  expect(purposes).toEqual([]);
  expect(toasts[0]).toContain("房间照");
  expect(view.data.floorUploadMessage).toContain("先上传房间照");
  await view.upload("room");
  expect(view.data.roomUploadStatus).toBe("pending_review");
  expect(view.data.roomFileId).toBe(STYLE.id);
  await view.upload("floor_plan");
  expect(purposes).toEqual(["room", "floor_plan"]);
  expect(view.data.floorUploadStatus).toBe("pending_review");
  expect(view.data.floorFileId).toBe(STYLE.id);
  expect("canGenerate" in view.data).toBe(false);
});

test("detail keeps the same intent for an uncertain PUT and retryable completion", async () => {
  const image: PrivateImage = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    mimeType: "image/jpeg", sizeBytes: 4 };
  let intentCalls = 0;
  let completeCalls = 0;
  const page = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
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
      return { fileId: STYLE.id, status: "pending_review" };
    },
  });
  const view = Object.assign(page, { setData(patch: Record<string, unknown>) { Object.assign(page.data, patch); } });
  view.onLoad({ id: STYLE.id });
  await flush();
  await view.upload("room");
  expect(view.data.roomUploadStatus).toBe("retry_complete");
  await view.retryComplete("room");
  expect(view.data.roomUploadStatus).toBe("pending_review");
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
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: async () => image,
    createRenderingUploadIntent: async () => { throw errors.shift(); },
    putRenderingBytes: async () => { putCalls++; },
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "pending_review" }),
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
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: async () => {
      throw new ApiRequestError(0, "IMAGE_PRIVACY_SCOPE_UNDECLARED", "图片选择能力未在平台隐私协议声明");
    },
    createRenderingUploadIntent: async () => { intents++; throw new Error("unexpected intent"); },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "pending_review" }),
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
      return { fileId: STYLE.id, status: "pending_review" };
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
  expect(view.data.roomUploadStatus).toBe("pending_review");
});

test("leaving detail before image selection resolves prevents a stale intent request", async () => {
  let resolveImage!: (image: PrivateImage) => void;
  let intents = 0;
  const page = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: () => new Promise((resolve) => { resolveImage = resolve; }),
    createRenderingUploadIntent: async () => { intents++; throw new Error("stale request"); },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "pending_review" }),
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
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: () => new Promise((resolve) => { resolveImage = resolve; }),
    createRenderingUploadIntent: async () => { intents++; return { intentId: STYLE.id,
      uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }; },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "pending_review" }),
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
  expect(view.data.roomUploadStatus).toBe("pending_review");
});

test("selection waits for the detail page to show before starting a private upload", async () => {
  let resolveImage!: (image: PrivateImage) => void;
  let intents = 0;
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: () => new Promise((resolve) => { resolveImage = resolve; }),
    createRenderingUploadIntent: async () => { intents++; return { intentId: STYLE.id,
      uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }; },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "pending_review" }),
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
  expect(view.data.roomUploadStatus).toBe("pending_review");
});

test("picker failure after a native hide becomes visible when detail shows again", async () => {
  let rejectImage!: (error: ApiRequestError) => void;
  const definition = createRenderingStyleDetailPageDefinition({
    getApp: () => ({ api: {}, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: () => new Promise((_resolve, reject) => { rejectImage = reject; }),
    createRenderingUploadIntent: async () => { throw new Error("unexpected intent"); },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "pending_review" }),
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
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: async () => image,
    createRenderingUploadIntent: async () => { intentCalls++; return { intentId: STYLE.id,
      uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }; },
    putRenderingBytes: () => new Promise<void>((resolve) => { finishPut = resolve; }),
    completeRenderingUploadWithRetry: async () => { completeCalls++;
      return { fileId: STYLE.id, status: "pending_review" as const }; },
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
      return { fileId: STYLE.id, status: "pending_review" as const }; },
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

test("reopening detail keeps a confirmed room file within the same app session", async () => {
  const api = {} as never;
  let intentCalls = 0;
  const dependencies = {
    getApp: () => ({ api, startup: Promise.resolve({ theme: { primary_color: "#191817" } }),
      recordAnalytics: () => undefined }) as never,
    fetchPublishedStyleDetail: async () => STYLE,
    navigateToList: async () => undefined,
    showToast: () => undefined,
    choosePrivateImage: async () => ({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
      mimeType: "image/jpeg", sizeBytes: 4 }) as PrivateImage,
    createRenderingUploadIntent: async () => { intentCalls++; return { intentId: STYLE.id,
      uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }; },
    putRenderingBytes: async () => undefined,
    completeRenderingUploadWithRetry: async () => ({ fileId: STYLE.id, status: "pending_review" as const }),
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
  expect(secondView.data.roomUploadStatus).toBe("pending_review");
  await secondView.upload("room");
  expect(intentCalls).toBe(1);
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
      fetchPublishedStyleDetail: async () => STYLE,
      navigateToList: async () => undefined,
      showToast: () => undefined,
      choosePrivateImage: async () => image,
      createRenderingUploadIntent: async () => { intentCalls++; return { intentId: STYLE.id,
        uploadUrl: "https://example.invalid/signed", headers: {}, expiresAt: "2099-01-01T00:00:00Z" }; },
      putRenderingBytes: async () => undefined,
      completeRenderingUploadWithRetry: async () => { completeCalls++;
        if (completeCalls === 1) throw error;
        return { fileId: STYLE.id, status: "pending_review" }; },
    });
    const view = Object.assign(definition, { setData(patch: Record<string, unknown>) { Object.assign(definition.data, patch); } });
    view.onLoad({ id: STYLE.id });
    await flush();
    await view.upload("room");
    expect(view.data.roomUploadStatus).toBe("error");
    await view.upload("room");
    expect(intentCalls).toBe(2);
    expect(view.data.roomUploadStatus).toBe("pending_review");
  }
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
