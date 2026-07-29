import type COS from "cos-nodejs-sdk-v5";

import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  assertBrandLogoImageProperties,
  assertBrandLogoUploadDeclaration,
  BRAND_LOGO_POLICY,
} from "@/services/branding-file-policy";
import { parseBrandLogoImageMetadata } from "@/services/branding-image-metadata";

type BrandLogoCosClient = Pick<COS, "headObject" | "getObject">;

export type VerifiedBrandLogoCosObject = {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  sizeBytes: number;
  width: number;
  height: number;
  etag: string;
};

type StrongEtag = {
  normalized: string;
  ifMatch: string;
};

export function validateBrandLogoDirectUpload(input: {
  scene: string;
  visibility?: string;
  employeeId?: string | null;
  mimetype?: string;
  sizeBytes?: number | null;
}): boolean {
  if (input.scene !== "brand_logo") return false;
  if (input.visibility !== "public" || !input.employeeId) {
    throw Errors.forbidden();
  }
  assertBrandLogoUploadDeclaration({
    mimeType: input.mimetype ?? "",
    sizeBytes: input.sizeBytes ?? 0,
  });
  return true;
}

export async function verifyBrandLogoCosObject(input: {
  cos: BrandLogoCosClient;
  bucket: string;
  region: string;
  objectKey: string;
  declaredMimeType: string;
  declaredSize: number;
  clientEtag?: string | null;
}): Promise<VerifiedBrandLogoCosObject> {
  assertBrandLogoUploadDeclaration({
    mimeType: input.declaredMimeType,
    sizeBytes: input.declaredSize,
  });

  const headObject = await loadHeadObject(input);
  const contentLength = parseContentLength(
    getHeader(headObject.headers, "content-length"),
  );
  const contentType = normalizeContentType(
    getHeader(headObject.headers, "content-type"),
  );
  if (
    contentLength === null ||
    contentLength !== input.declaredSize ||
    contentType !== input.declaredMimeType
  ) {
    return invalidBrandLogo();
  }

  const headEtag = parseStrongEtag(getResponseEtag(headObject));
  const clientEtag = input.clientEtag?.trim()
    ? parseStrongEtag(input.clientEtag)
    : null;
  if (
    !headEtag ||
    (input.clientEtag?.trim() && !clientEtag) ||
    (clientEtag && clientEtag.normalized !== headEtag.normalized)
  ) {
    return invalidBrandLogo();
  }

  const downloaded = await loadBoundedObject({
    ...input,
    ifMatch: headEtag.ifMatch,
  });
  if (
    downloaded.bytes.length !== contentLength ||
    downloaded.etag !== headEtag.normalized
  ) {
    return invalidBrandLogo();
  }

  const metadata = await parseBrandLogoImageMetadata(downloaded.bytes);
  if (metadata.mimeType !== contentType) {
    return invalidBrandLogo();
  }
  assertBrandLogoImageProperties({
    mimeType: metadata.mimeType,
    sizeBytes: downloaded.bytes.length,
    width: metadata.width,
    height: metadata.height,
  });

  return {
    mimeType: metadata.mimeType,
    sizeBytes: downloaded.bytes.length,
    width: metadata.width,
    height: metadata.height,
    etag: downloaded.etag,
  };
}

async function loadHeadObject(input: {
  cos: BrandLogoCosClient;
  bucket: string;
  region: string;
  objectKey: string;
}): Promise<COS.HeadObjectResult> {
  try {
    return await input.cos.headObject({
      Bucket: input.bucket,
      Region: input.region,
      Key: input.objectKey,
    });
  } catch {
    return invalidBrandLogo();
  }
}

async function loadBoundedObject(input: {
  cos: BrandLogoCosClient;
  bucket: string;
  region: string;
  objectKey: string;
  ifMatch: string;
}): Promise<{ bytes: Buffer; etag: string }> {
  try {
    const response = await input.cos.getObject({
      Bucket: input.bucket,
      Region: input.region,
      Key: input.objectKey,
      IfMatch: input.ifMatch,
      Range: `bytes=0-${BRAND_LOGO_POLICY.maxSizeBytes}`,
    });
    if (
      !Buffer.isBuffer(response?.Body) ||
      response.Body.length > BRAND_LOGO_POLICY.maxSizeBytes
    ) {
      return invalidBrandLogo();
    }
    const responseEtag = parseStrongEtag(getResponseEtag(response));
    if (!responseEtag) return invalidBrandLogo();
    return {
      bytes: response.Body,
      etag: responseEtag.normalized,
    };
  } catch {
    return invalidBrandLogo();
  }
}

function getHeader(headers: unknown, name: string): unknown {
  if (!isRecord(headers)) return undefined;
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name,
  );
  return entry?.[1];
}

function parseContentLength(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) &&
        value > 0 &&
        value <= BRAND_LOGO_POLICY.maxSizeBytes
      ? value
      : null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) &&
      parsed > 0 &&
      parsed <= BRAND_LOGO_POLICY.maxSizeBytes
    ? parsed
    : null;
}

function normalizeContentType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const canonical = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return BRAND_LOGO_POLICY.mimeTypes.has(canonical) ? canonical : null;
}

function getResponseEtag(response: {
  ETag?: unknown;
  headers?: unknown;
}): unknown {
  if (typeof response.ETag === "string" && response.ETag.trim()) {
    return response.ETag;
  }
  return getHeader(response.headers, "etag");
}

function parseStrongEtag(value: unknown): StrongEtag | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /^W\//i.test(trimmed)) return null;

  const hasOpeningQuote = trimmed.startsWith('"');
  const hasClosingQuote = trimmed.endsWith('"');
  if (hasOpeningQuote !== hasClosingQuote) return null;
  const normalized = hasOpeningQuote ? trimmed.slice(1, -1) : trimmed;
  if (!/^[\x21\x23-\x7e]+$/.test(normalized)) return null;

  return {
    normalized,
    ifMatch: `"${normalized}"`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function invalidBrandLogo(): never {
  throw Errors.business(
    400,
    "品牌 Logo 文件无效",
    ErrorCodes.BRANDING_LOGO_FILE_INVALID,
  );
}
