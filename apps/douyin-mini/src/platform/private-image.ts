import { ApiRequestError } from "../api/request";
import type { RenderingUploadMime } from "../api/rendering-uploads";

export type PrivateImage = { bytes: ArrayBuffer; mimeType: RenderingUploadMime; sizeBytes: number };
const MAX_BYTES = 10 * 1024 * 1024;

export function inspectPrivateImageBytes(bytes: ArrayBuffer): PrivateImage {
  const data = new Uint8Array(bytes);
  if (data.length < 1 || data.length > MAX_BYTES) {
    throw new ApiRequestError(0, "INVALID_IMAGE_SIZE", "每张图片最多 10 MiB");
  }
  let mimeType: RenderingUploadMime;
  if (startsWith(data, [0xff, 0xd8, 0xff])) mimeType = "image/jpeg";
  else if (startsWith(data, [137, 80, 78, 71, 13, 10, 26, 10])) {
    if (hasPngAnimation(data)) throw unsupported("请选择静态图片");
    mimeType = "image/png";
  } else if (startsWith(data, [82, 73, 70, 70]) && startsWith(data.subarray(8), [87, 69, 66, 80])) {
    if (hasWebpAnimation(data)) throw unsupported("请选择静态图片");
    mimeType = "image/webp";
  } else if (startsWith(data.subarray(4), [102, 116, 121, 112])) {
    throw unsupported("HEIC 图片需先真实转为 JPEG、PNG 或 WebP");
  } else throw unsupported("仅支持静态 JPEG、PNG 或 WebP 图片");
  return { bytes, mimeType, sizeBytes: data.length };
}

export async function choosePrivateImage(
  chooseImage: typeof tt.chooseImage = tt.chooseImage,
  readFile: ReturnType<typeof tt.getFileSystemManager>["readFile"] = tt.getFileSystemManager().readFile,
  getFileInfo: ReturnType<typeof tt.getFileSystemManager>["getFileInfo"] = tt.getFileSystemManager().getFileInfo,
): Promise<PrivateImage> {
  const selected = await new Promise<{ path: string; size: number }>((resolve, reject) => {
    chooseImage({ count: 1, sourceType: ["album", "camera"], sizeType: ["original"],
      success: (result) => {
        const file = result.tempFiles?.[0];
        if (file?.path) resolve(file);
        else reject(unsupported("未取得所选图片"));
      },
      fail: (error) => reject(chooseImageError(error)),
    });
  });
  assertImageSize(selected.size);
  const actualSize = await new Promise<number>((resolve, reject) => {
    getFileInfo({ filePath: selected.path, success: (result) => resolve(result.size),
      fail: () => reject(unsupported("无法读取图片大小")) });
  });
  assertImageSize(actualSize);
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    readFile({ filePath: selected.path, success: (result) => {
      const data: unknown = result.data;
      if (data instanceof ArrayBuffer) resolve(data);
      else reject(unsupported("无法读取图片原始字节"));
    }, fail: () => reject(unsupported("无法读取图片原始字节")) });
  });
  return inspectPrivateImageBytes(bytes);
}

function assertImageSize(size: number): void {
  if (!Number.isInteger(size) || size < 1 || size > MAX_BYTES) {
    throw new ApiRequestError(0, "INVALID_IMAGE_SIZE", "每张图片最多 10 MiB");
  }
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function hasWebpAnimation(bytes: Uint8Array): boolean {
  if (startsWith(bytes.subarray(12), [86, 80, 56, 88]) && bytes.length > 20 && (bytes[20] & 2) !== 0) return true;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    if (startsWith(bytes.subarray(offset), [65, 78, 73, 77])) return true;
    const length = readLittleEndian32(bytes, offset + 4);
    offset += 8 + length + (length % 2);
  }
  return false;
}

function hasPngAnimation(bytes: Uint8Array): boolean {
  for (let offset = 8; offset + 8 <= bytes.length;) {
    const length = readBigEndian32(bytes, offset);
    if (startsWith(bytes.subarray(offset + 4), [97, 99, 84, 76])) return true;
    if (length > bytes.length - offset - 12) break;
    offset += 12 + length;
  }
  return false;
}

function readLittleEndian32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24) >>> 0;
}

function readBigEndian32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function unsupported(message: string): ApiRequestError {
  return new ApiRequestError(0, "UNSUPPORTED_PRIVATE_IMAGE", message);
}

function chooseImageError(error: { errMsg: string; errNo?: number }): ApiRequestError {
  const message = error.errMsg ?? "";
  if (message.includes("cancel")) {
    return new ApiRequestError(0, "IMAGE_SELECTION_CANCELLED", "未选择图片");
  }
  if (error.errNo === 10202 || message.includes("api scope is not declared in the privacy agreement")) {
    return new ApiRequestError(0, "IMAGE_PRIVACY_SCOPE_UNDECLARED", "图片选择能力未在平台隐私协议声明");
  }
  if (error.errNo === 10201 || message.includes("privacy permission is not authorized")) {
    return new ApiRequestError(0, "IMAGE_PRIVACY_NOT_AUTHORIZED", "请先同意小程序隐私协议");
  }
  return new ApiRequestError(0, "IMAGE_SELECTION_FAILED", "无法选择图片");
}
