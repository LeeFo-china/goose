import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";

export const VIRTUAL_GOODS_IMAGE_POLICY = {
  mimeTypes: new Set(["image/jpeg", "image/png"]),
  maxSizeBytes: 2 * 1024 * 1024,
  width: 200,
  height: 200,
} as const;

export function assertVirtualGoodsImageDeclaration(input: {
  mimeType: string;
  sizeBytes: number;
}) {
  if (
    !VIRTUAL_GOODS_IMAGE_POLICY.mimeTypes.has(input.mimeType) ||
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > VIRTUAL_GOODS_IMAGE_POLICY.maxSizeBytes
  ) invalidVirtualGoodsImage();
}

export function assertVirtualGoodsImageProperties(input: {
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
}) {
  assertVirtualGoodsImageDeclaration(input);
  if (
    input.width !== VIRTUAL_GOODS_IMAGE_POLICY.width ||
    input.height !== VIRTUAL_GOODS_IMAGE_POLICY.height
  ) invalidVirtualGoodsImage();
}

export function invalidVirtualGoodsImage(): never {
  throw Errors.business(
    400,
    "虚拟商品图片无效，必须为 200×200 的 JPG 或 PNG 图片",
    ErrorCodes.FILE_STORAGE_UPLOAD_FAILED,
  );
}
