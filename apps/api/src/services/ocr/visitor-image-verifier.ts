import sharp from "sharp";

import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type {
  VisitorOcrPlatformFileObjectRecord,
} from "@/repositories/visitor-onboarding-file-objects";

const VISITOR_OCR_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_INPUT_PIXELS = 64 * 1024 * 1024;
const SHARP_INPUT_OPTIONS = {
  failOn: "error",
  limitInputPixels: MAX_INPUT_PIXELS,
} as const;

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
type SignedUrlResolver = (
  file: Pick<VisitorOcrPlatformFileObjectRecord, "provider" | "object_key">,
) => Promise<string>;

export type VerifiedVisitorOcrImage = {
  signedUrl: string;
  mimeType: "image/jpeg" | "image/png";
  sizeBytes: number;
  width: number;
  height: number;
};

export async function verifyVisitorOcrImage(input: {
  file: VisitorOcrPlatformFileObjectRecord;
  maxSizeBytes: number;
  signedUrlResolver?: SignedUrlResolver;
  fetcher?: Fetcher;
}): Promise<VerifiedVisitorOcrImage> {
  const recordedMimeType = normalizeMimeType(input.file.mime_type);
  if (!recordedMimeType) return unsupportedFormat();
  if (
    !Number.isSafeInteger(input.file.size_bytes) ||
    input.file.size_bytes <= 0 ||
    input.file.size_bytes > input.maxSizeBytes
  ) return fileTooLarge();

  const signedUrlResolver = input.signedUrlResolver ?? defaultSignedUrlResolver;
  const fetcher = input.fetcher ?? fetch;
  let signedUrl: string;
  let response: Response;
  try {
    signedUrl = await signedUrlResolver(input.file);
    response = await fetcher(signedUrl, {
      headers: {
        ...(input.file.checksum
          ? { "if-match": quoteEtag(input.file.checksum) }
          : {}),
        range: `bytes=0-${input.maxSizeBytes}`,
      },
      redirect: "error",
    });
  } catch {
    return fileAccessDenied();
  }

  if (!response.ok) return fileAccessDenied();
  const responseMimeType = normalizeMimeType(response.headers.get("content-type"));
  if (!responseMimeType || responseMimeType !== recordedMimeType) {
    return unsupportedFormat();
  }
  if (
    input.file.checksum &&
    normalizeEtag(response.headers.get("etag")) !==
      normalizeEtag(input.file.checksum)
  ) {
    return fileAccessDenied();
  }

  const bytes = await readBoundedBody(response, input.maxSizeBytes);
  if (bytes.length !== input.file.size_bytes) return fileAccessDenied();

  try {
    const metadata = await sharp(bytes, SHARP_INPUT_OPTIONS).metadata();
    const decodedMimeType = toMimeType(metadata.format);
    if (
      decodedMimeType !== recordedMimeType ||
      !isPositiveInteger(metadata.width) ||
      !isPositiveInteger(metadata.height) ||
      (metadata.pages !== undefined && metadata.pages > 1)
    ) return unsupportedFormat();

    await sharp(bytes, SHARP_INPUT_OPTIONS)
      .rotate()
      .resize(1, 1, { fit: "fill" })
      .raw()
      .toBuffer();

    return {
      signedUrl,
      mimeType: decodedMimeType,
      sizeBytes: bytes.length,
      width: metadata.width,
      height: metadata.height,
    };
  } catch {
    return unsupportedFormat();
  }
}

async function defaultSignedUrlResolver(
  file: Pick<VisitorOcrPlatformFileObjectRecord, "provider" | "object_key">,
) {
  const { resolveOcrStoredFileUrl } = await import(
    "@/services/files/file-url-resolver"
  );
  return resolveOcrStoredFileUrl(file);
}

async function readBoundedBody(
  response: Response,
  maxSizeBytes: number,
): Promise<Buffer> {
  const declaredLength = parseContentLength(response.headers.get("content-length"));
  if (declaredLength !== null && declaredLength > maxSizeBytes) {
    return fileTooLarge();
  }
  if (!response.body) return fileAccessDenied();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let exceededLimit = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxSizeBytes) {
        exceededLimit = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  } catch {
    return fileAccessDenied();
  } finally {
    reader.releaseLock();
  }
  if (exceededLimit) return fileTooLarge();
  return Buffer.concat(chunks, totalBytes);
}

function normalizeMimeType(value: string | null) {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return VISITOR_OCR_IMAGE_MIME_TYPES.has(normalized)
    ? normalized as VerifiedVisitorOcrImage["mimeType"]
    : null;
}

function toMimeType(format: string | undefined) {
  if (format === "jpeg") return "image/jpeg" as const;
  if (format === "png") return "image/png" as const;
  return null;
}

function normalizeEtag(value: string | null) {
  return value?.trim().replace(/^"+|"+$/g, "") || null;
}

function quoteEtag(value: string) {
  return `"${normalizeEtag(value)}"`;
}

function parseContentLength(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function isPositiveInteger(value: number | undefined): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function unsupportedFormat(): never {
  throw Errors.business(
    400,
    "OCR文件格式不支持",
    ErrorCodes.OCR_FILE_FORMAT_UNSUPPORTED,
  );
}

function fileTooLarge(): never {
  throw Errors.business(400, "OCR文件过大", ErrorCodes.OCR_FILE_TOO_LARGE);
}

function fileAccessDenied(): never {
  throw Errors.business(
    403,
    "OCR文件不可访问",
    ErrorCodes.OCR_FILE_ACCESS_DENIED,
  );
}
