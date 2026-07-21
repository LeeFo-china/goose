import { createHash } from "node:crypto";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { WechatPayApplymentAttachmentCategorySchema } from "@/schema/wechat-pay-applyments";
import { resolveSignedStoredFileUrl } from "@/services/files/file-url-resolver";
import type {
  UploadApplymentMediaInput,
  WechatPayApplymentGatewayPort,
  WechatPayApplymentGatewayProfile,
} from "@/services/wechat-pay-applyment-gateway";
import type { WechatPayApplymentMediaRepositoryPort } from "@/services/wechat-pay-applyments-types";

const MAX_MEDIA_SIZE_BYTES = 2 * 1024 * 1024;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 2;

type FetchImpl = typeof fetch;
type MediaGatewayPort = Pick<WechatPayApplymentGatewayPort, "uploadMedia">;

type WechatPayApplymentMediaServiceDependencies = {
  repository: WechatPayApplymentMediaRepositoryPort;
  gateway: MediaGatewayPort;
  signedUrlResolver?: typeof resolveSignedStoredFileUrl;
  fetchImpl?: FetchImpl;
  requestTimeoutMs?: number;
};

export type WechatPayApplymentAttachment = {
  category: string;
  object_key: string;
  file_name?: string | null;
};

export class WechatPayApplymentMediaService {
  private readonly repository: WechatPayApplymentMediaRepositoryPort;
  private readonly gateway: MediaGatewayPort;
  private readonly signedUrlResolver: typeof resolveSignedStoredFileUrl;
  private readonly fetchImpl: FetchImpl;
  private readonly requestTimeoutMs: number;

  constructor(dependencies: WechatPayApplymentMediaServiceDependencies) {
    this.repository = dependencies.repository;
    this.gateway = dependencies.gateway;
    this.signedUrlResolver = dependencies.signedUrlResolver ??
      resolveSignedStoredFileUrl;
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.requestTimeoutMs = normalizeTimeout(dependencies.requestTimeoutMs);
  }

  async resolveMedia(input: {
    tenantId: string;
    applymentId: string;
    profile: WechatPayApplymentGatewayProfile;
    attachment: WechatPayApplymentAttachment;
  }): Promise<{ mediaId: string }> {
    const category = parseCategory(input.attachment.category);
    const objectKey = assertOwnedObjectKey(
      input.attachment.object_key,
      input.tenantId,
    );
    const signedUrl = await this.signedUrlResolver(objectKey, {
      ttlSeconds: 120,
    });
    const bytes = await this.downloadMedia(signedUrl);
    const mediaType = detectMediaType(bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const cached = await this.repository.findMediaByDigest({
      tenantId: input.tenantId,
      applymentId: input.applymentId,
      objectKey,
      sha256,
    });
    if (cached) return { mediaId: cached.media_id };

    const uploaded = await this.gateway.uploadMedia({
      profile: input.profile,
      filename: `${category}.${mediaType.extension}`,
      contentType: mediaType.contentType,
      sha256,
      file: bytes,
    } satisfies UploadApplymentMediaInput);
    await this.repository.upsertMedia({
      tenant_id: input.tenantId,
      applyment_id: input.applymentId,
      category,
      object_key: objectKey,
      sha256,
      media_id: uploaded.mediaId,
      mime_type: mediaType.contentType,
      size_bytes: bytes.byteLength,
      request_id: uploaded.requestId,
    });
    return { mediaId: uploaded.mediaId };
  }

  private async downloadMedia(signedUrl: string): Promise<Buffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await this.fetchFromTrustedCos(
        signedUrl,
        controller.signal,
      );
      assertResponseSize(response);
      return await readBoundedBody(response);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw Errors.business(
          504,
          "微信支付进件附件下载超时",
          "WECHAT_PAY_APPLYMENT_MEDIA_DOWNLOAD_TIMEOUT",
        );
      }
      if (error instanceof AppError) throw error;
      throw Errors.business(
        502,
        "微信支付进件附件下载失败",
        "WECHAT_PAY_APPLYMENT_MEDIA_DOWNLOAD_FAILED",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchFromTrustedCos(
    signedUrl: string,
    signal: AbortSignal,
  ): Promise<Response> {
    const initialUrl = parseTrustedCosUrl(signedUrl);
    if (!initialUrl) throwMediaSourceForbidden();
    let currentUrl: URL = initialUrl;

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const response: Response = await this.fetchImpl(currentUrl.toString(), {
        method: "GET",
        headers: { Accept: "image/jpeg,image/png,image/bmp" },
        redirect: "manual",
        signal,
      });
      if (!isRedirect(response.status)) {
        if (!response.ok) {
          throw Errors.business(
            502,
            "微信支付进件附件下载失败",
            "WECHAT_PAY_APPLYMENT_MEDIA_DOWNLOAD_FAILED",
            { status: response.status },
          );
        }
        return response;
      }

      const location: string | null = response.headers.get("location");
      const redirectedUrl: URL | null = location
        ? parseTrustedCosUrl(new URL(location, currentUrl).toString())
        : null;
      if (!redirectedUrl || redirects === MAX_REDIRECTS) {
        throw Errors.business(
          502,
          "微信支付进件附件重定向地址不可信",
          "WECHAT_PAY_APPLYMENT_MEDIA_REDIRECT_FORBIDDEN",
        );
      }
      currentUrl = redirectedUrl;
    }
    throwMediaSourceForbidden();
  }
}

function assertOwnedObjectKey(value: string, tenantId: string): string {
  const normalized = value.trim();
  const expectedPrefix = `tenants/${tenantId}/wechat-pay-applyment/`;
  const segments = normalized.split("/");
  if (
    normalized !== value ||
    !normalized.startsWith(expectedPrefix) ||
    /^https?:\/\//i.test(normalized) ||
    normalized.includes("\\") ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw Errors.business(
      403,
      "微信支付进件附件对象不属于当前租户",
      "WECHAT_PAY_APPLYMENT_OBJECT_KEY_INVALID",
    );
  }
  return normalized;
}

function parseCategory(value: string) {
  const parsed = WechatPayApplymentAttachmentCategorySchema.safeParse(value);
  if (!parsed.success) {
    throw Errors.business(
      409,
      "微信支付进件附件类型无效",
      "WECHAT_PAY_APPLYMENT_MEDIA_CATEGORY_INVALID",
    );
  }
  return parsed.data;
}

function detectMediaType(bytes: Uint8Array): {
  extension: "jpg" | "png" | "bmp";
  contentType: "image/jpeg" | "image/png" | "image/bmp";
} {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { extension: "png", contentType: "image/png" };
  }
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { extension: "bmp", contentType: "image/bmp" };
  }
  throw Errors.business(
    400,
    "微信支付进件附件仅支持 JPG、PNG 或 BMP 图片",
    "WECHAT_PAY_APPLYMENT_MEDIA_TYPE_UNSUPPORTED",
  );
}

function assertResponseSize(response: Response): void {
  const value = response.headers.get("content-length");
  if (!value) return;
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_MEDIA_SIZE_BYTES) {
    throwMediaTooLarge();
  }
}

async function readBoundedBody(response: Response): Promise<Buffer> {
  if (!response.body) {
    throw Errors.business(
      502,
      "微信支付进件附件内容为空",
      "WECHAT_PAY_APPLYMENT_MEDIA_EMPTY",
    );
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MEDIA_SIZE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throwMediaTooLarge();
    }
    chunks.push(Buffer.from(value));
  }
  if (total === 0) {
    throw Errors.business(
      400,
      "微信支付进件附件内容为空",
      "WECHAT_PAY_APPLYMENT_MEDIA_EMPTY",
    );
  }
  return Buffer.concat(chunks, total);
}

function parseTrustedCosUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const isTencentCos = hostname.endsWith(".myqcloud.com") &&
      (hostname.includes(".cos.") || hostname.includes(".cos-internal."));
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      !isTencentCos
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function throwMediaTooLarge(): never {
  throw Errors.business(
    400,
    "微信支付进件附件不能超过 2MB",
    "WECHAT_PAY_APPLYMENT_MEDIA_TOO_LARGE",
  );
}

function throwMediaSourceForbidden(): never {
  throw Errors.business(
    502,
    "微信支付进件附件来源不可信",
    "WECHAT_PAY_APPLYMENT_MEDIA_SOURCE_FORBIDDEN",
  );
}

function normalizeTimeout(value: number | undefined) {
  return Number.isFinite(value) && (value ?? 0) > 0
    ? Math.floor(value as number)
    : DEFAULT_DOWNLOAD_TIMEOUT_MS;
}

function isRedirect(status: number) {
  return [301, 302, 303, 307, 308].includes(status);
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
