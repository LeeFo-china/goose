import { expect, mock, test } from "bun:test";
import { ApiRequestError } from "./request";
import { completeRenderingUpload, completeRenderingUploadWithRetry, createRenderingUploadIntent, putRenderingBytes } from "./rendering-uploads";

const ID = "11111111-1111-4111-8111-111111111111";
const URL = "https://private-123.cos.ap-shanghai.myqcloud.com/raw?q-signature=opaque";
const HEADERS = {
  "Content-Type": "image/jpeg",
  "Content-Length": "4",
  "x-cos-acl": "private",
  "x-cos-forbid-overwrite": "true",
};

test("intent and complete use the existing authenticated API client and validate private results", async () => {
  const request = mock(async (input: { method: string; path: string; data?: Record<string, unknown> }) =>
    input.path.endsWith("uploads:intent")
      ? { intent_id: ID, method: "PUT", upload_url: URL, headers: HEADERS, expires_at: "2026-09-13T10:10:00Z" }
      : { file_id: ID, status: "pending_review", mime_type: "image/webp", width: 8, height: 8, size_bytes: 42 });
  const client = { request } as never;
  const intent = await createRenderingUploadIntent(client, { purpose: "room", mimeType: "image/jpeg", sizeBytes: 4 });
  expect(intent.intentId).toBe(ID);
  expect(request.mock.calls[0]?.[0]).toEqual({ method: "POST", path: "/douyin-mini/renderings/uploads:intent",
    data: { purpose: "room", mime_type: "image/jpeg", size_bytes: 4 } });
  expect(await completeRenderingUpload(client, intent.intentId)).toEqual({ fileId: ID, status: "pending_review" });
  expect(request.mock.calls[1]?.[0]).toEqual({ method: "POST",
    path: `/douyin-mini/renderings/uploads/${ID}/complete`, data: {} });
  expect(await completeRenderingUpload(client, intent.intentId)).toEqual({ fileId: ID, status: "pending_review" });
});

test("raw COS PUT sends exact returned headers and ArrayBuffer without business authorization", async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;
  const request = mock((options: Parameters<typeof tt.request>[0]) => {
    options.success?.({ statusCode: 200, header: {}, data: "" } as never);
    return { abort: () => undefined } as never;
  });
  await putRenderingBytes({ uploadUrl: URL, headers: HEADERS, bytes, request: request as typeof tt.request });
  expect(request).toHaveBeenCalledTimes(1);
  const sent = request.mock.calls[0]?.[0];
  expect(sent?.method).toBe("PUT");
  expect(sent?.url).toBe(URL);
  expect(sent?.data).toBe(bytes);
  expect(sent?.header).toEqual(HEADERS);
  expect(Object.keys(sent?.header ?? {}).some((key) => key.toLowerCase() === "authorization")).toBe(false);
});

test("raw PUT rejects mismatched signed headers and never calls the network", async () => {
  const request = mock((options: Parameters<typeof tt.request>[0]) => {
    options.success?.({ statusCode: 200, header: {}, data: "" } as never);
    return { abort: () => undefined } as never;
  });
  await expect(putRenderingBytes({ uploadUrl: URL, headers: { ...HEADERS, "Content-Length": "5" },
    bytes: new ArrayBuffer(4), request: request as typeof tt.request })).rejects.toMatchObject({ code: "INVALID_UPLOAD_INTENT" });
  expect(request).not.toHaveBeenCalled();
  await expect(putRenderingBytes({ uploadUrl: URL, headers: { ...HEADERS, Authorization: "Bearer leak" },
    bytes: new ArrayBuffer(4), request: request as typeof tt.request })).rejects.toBeInstanceOf(ApiRequestError);
  await expect(putRenderingBytes({ uploadUrl: URL, headers: { ...HEADERS, "Content-Type": "image/png" },
    bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer, request: request as typeof tt.request }))
    .rejects.toMatchObject({ code: "INVALID_UPLOAD_INTENT" });
  expect(request).not.toHaveBeenCalled();
});

test("processing completion retries the same intent ID without issuing another intent", async () => {
  let attempts = 0;
  const request = mock(async (input: { path: string }) => {
    attempts++;
    if (attempts === 1) throw new ApiRequestError(409, "RENDERING_UPLOAD_PROCESSING", "处理中");
    return { file_id: ID, status: "pending_review", mime_type: "image/webp", width: 8, height: 8, size_bytes: 42 };
  });
  const result = await completeRenderingUploadWithRetry({ request } as never, ID, async () => undefined);
  expect(result.fileId).toBe(ID);
  expect(request.mock.calls.map(([input]) => input.path)).toEqual([
    `/douyin-mini/renderings/uploads/${ID}/complete`,
    `/douyin-mini/renderings/uploads/${ID}/complete`,
  ]);
});
