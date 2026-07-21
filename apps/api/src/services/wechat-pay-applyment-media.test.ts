import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";

import type { WechatPayApplymentMediaRecord } from "@/repositories/wechat-pay-applyments";
import type { WechatPayApplymentGatewayProfile } from "./wechat-pay-applyment-gateway";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "11111111-1111-4111-8111-111111111111";
const applymentId = "22222222-2222-4222-8222-222222222222";
const objectKey =
  `tenants/${tenantId}/wechat-pay-applyment/unassigned/2026/07/21/license.jpg`;
const signedUrl =
  `https://bucket-1.cos.ap-guangzhou.myqcloud.com/${objectKey}?sign=test`;
const profile = {
  merchantId: "1561816121",
  serialNo: "MERCHANT_CERT_SERIAL",
  privateKeyPem: "merchant-private-key",
  wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
  wechatPayPublicKeyPem: "wechat-public-key",
  baseUrl: "https://api.mch.weixin.qq.com",
} satisfies WechatPayApplymentGatewayProfile;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("png-content"),
]);
const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from("jpeg-content"),
]);
const bmp = Buffer.concat([
  Buffer.from([0x42, 0x4d]),
  Buffer.from("bmp-content"),
]);

const findMediaByDigest = mock(
  async (): Promise<WechatPayApplymentMediaRecord | null> => null,
);
const upsertMedia = mock(async (input: Record<string, unknown>) => ({
  id: "media-record-1",
  applyment_id: applymentId,
  object_key: String(input.object_key),
  sha256: String(input.sha256),
  media_id: String(input.media_id),
  request_id: input.request_id as string | null,
}));
const uploadMedia = mock(async () => ({
  mediaId: "wechat-media-1",
  requestId: "wechat-request-1",
}));
const signedUrlResolver = mock(async () => signedUrl);
const fetchImpl = mock(async () => imageResponse(png));

describe("WechatPayApplymentMediaService", () => {
  beforeEach(() => {
    findMediaByDigest.mockClear();
    upsertMedia.mockClear();
    uploadMedia.mockClear();
    signedUrlResolver.mockClear();
    fetchImpl.mockClear();
    findMediaByDigest.mockImplementation(async () => null);
    uploadMedia.mockImplementation(async () => ({
      mediaId: "wechat-media-1",
      requestId: "wechat-request-1",
    }));
    signedUrlResolver.mockImplementation(async () => signedUrl);
    fetchImpl.mockImplementation(async () => imageResponse(png));
  });

  test.each([
    ["jpg", "image/jpeg", jpeg],
    ["png", "image/png", png],
    ["bmp", "image/bmp", bmp],
  ] as const)(
    "detects %s by magic bytes and normalizes the upload filename",
    async (extension, mimeType, bytes) => {
      fetchImpl.mockImplementationOnce(async () => imageResponse(bytes));
      const service = await createService();

      await expect(service.resolveMedia(resolveInput())).resolves.toEqual({
        mediaId: "wechat-media-1",
      });

      expect(uploadMedia).toHaveBeenCalledWith(expect.objectContaining({
        profile,
        filename: `license_copy.${extension}`,
        contentType: mimeType,
        file: bytes,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      }));
    },
  );

  test("reuses an existing MediaID for the same object key and digest", async () => {
    const sha256 = createHash("sha256").update(png).digest("hex");
    findMediaByDigest.mockImplementationOnce(async () => ({
      id: "media-record-cached",
      applyment_id: applymentId,
      object_key: objectKey,
      sha256,
      media_id: "wechat-media-cached",
      request_id: "wechat-request-cached",
    }));
    const service = await createService();

    await expect(service.resolveMedia(resolveInput())).resolves.toEqual({
      mediaId: "wechat-media-cached",
    });

    expect(findMediaByDigest).toHaveBeenCalledWith({
      tenantId,
      applymentId,
      objectKey,
      sha256,
    });
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(upsertMedia).not.toHaveBeenCalled();
  });

  test("uploads and persists a replacement when its digest changes", async () => {
    const service = await createService();

    await service.resolveMedia(resolveInput());

    const sha256 = createHash("sha256").update(png).digest("hex");
    expect(findMediaByDigest).toHaveBeenCalledWith(expect.objectContaining({
      objectKey,
      sha256,
    }));
    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(upsertMedia).toHaveBeenCalledWith({
      tenant_id: tenantId,
      applyment_id: applymentId,
      category: "license_copy",
      object_key: objectKey,
      sha256,
      media_id: "wechat-media-1",
      mime_type: "image/png",
      size_bytes: png.byteLength,
      request_id: "wechat-request-1",
    });
  });

  test.each([
    Buffer.from("RIFF1234WEBPunsupported"),
    Buffer.from("00000000ftypheicunsupported"),
  ])("rejects unsupported WebP or HEIC content", async (bytes) => {
    fetchImpl.mockImplementationOnce(async () => imageResponse(bytes));
    const service = await createService();

    await expect(service.resolveMedia(resolveInput())).rejects.toMatchObject({
      code: "WECHAT_PAY_APPLYMENT_MEDIA_TYPE_UNSUPPORTED",
    });
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  test("rejects a response larger than the conservative 2MB limit", async () => {
    fetchImpl.mockImplementationOnce(async () => new Response(png, {
      headers: { "content-length": String(2 * 1024 * 1024 + 1) },
    }));
    const service = await createService();

    await expect(service.resolveMedia(resolveInput())).rejects.toMatchObject({
      code: "WECHAT_PAY_APPLYMENT_MEDIA_TOO_LARGE",
    });
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  test.each([
    "https://attacker.example/license.jpg",
    "tenants/another-tenant/wechat-pay-applyment/license.jpg",
    `tenants/${tenantId}/wechat-pay-applyment/../other/license.jpg`,
  ])("rejects a non-owned object key: %s", async (untrustedKey) => {
    const service = await createService();

    await expect(service.resolveMedia(resolveInput(untrustedKey)))
      .rejects.toMatchObject({
        code: "WECHAT_PAY_APPLYMENT_OBJECT_KEY_INVALID",
      });
    expect(signedUrlResolver).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("rejects redirects to a non-COS host", async () => {
    fetchImpl.mockImplementationOnce(async () => new Response(null, {
      status: 302,
      headers: { location: "https://attacker.example/license.png" },
    }));
    const service = await createService();

    await expect(service.resolveMedia(resolveInput())).rejects.toMatchObject({
      code: "WECHAT_PAY_APPLYMENT_MEDIA_REDIRECT_FORBIDDEN",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

async function createService() {
  const { WechatPayApplymentMediaService } = await import(
    "./wechat-pay-applyment-media"
  );
  return new WechatPayApplymentMediaService({
    repository: { findMediaByDigest, upsertMedia },
    gateway: { uploadMedia },
    signedUrlResolver,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    requestTimeoutMs: 1_000,
  });
}

function resolveInput(key = objectKey) {
  return {
    tenantId,
    applymentId,
    profile,
    attachment: {
      category: "license_copy" as const,
      object_key: key,
      file_name: "营业执照.jpg",
    },
  };
}

function imageResponse(bytes: Uint8Array) {
  return new Response(bytes, {
    headers: { "content-length": String(bytes.byteLength) },
  });
}
