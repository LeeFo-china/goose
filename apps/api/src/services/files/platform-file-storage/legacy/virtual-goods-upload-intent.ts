import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  createPublicEmployeeUploadIntent,
  type PublicEmployeeUploadIntentInput,
  verifyPublicEmployeeUploadIntent,
} from "./public-employee-upload-intent";
import type {
  DirectUploadInput,
  RegisterExistingCosObjectInput,
} from "./shared";

const OPTIONS = {
  expectedScene: "branding_virtual_goods",
  keyDerivationLabel: "gooes:virtual-goods-upload-intent:v1",
} as const;

type VirtualGoodsUploadIntentInput = PublicEmployeeUploadIntentInput;

export function createVirtualGoodsUploadIntent(
  input: VirtualGoodsUploadIntentInput & { expiresAtSeconds: number },
) {
  return createPublicEmployeeUploadIntent(input, OPTIONS);
}

export function createDirectVirtualGoodsUploadIntent(
  input: DirectUploadInput,
  signing: {
    secretKey: string;
    objectKey: string;
    expiresAtSeconds: number;
  },
) {
  return createVirtualGoodsUploadIntent({
    secretKey: signing.secretKey,
    scene: input.scene,
    tenantId: input.tenantId ?? null,
    employeeId: input.employeeId!,
    objectKey: signing.objectKey,
    mimeType: input.mimetype,
    sizeBytes: input.sizeBytes,
    expiresAtSeconds: signing.expiresAtSeconds,
  });
}

export function verifyVirtualGoodsUploadIntent(
  input: VirtualGoodsUploadIntentInput & {
    token: string;
    nowSeconds: number;
  },
) {
  return verifyPublicEmployeeUploadIntent(input, OPTIONS);
}

export function assertValidVirtualGoodsUploadIntent(
  input: RegisterExistingCosObjectInput,
  secretKey: string,
) {
  if (verifyVirtualGoodsUploadIntent({
    token: input.uploadIntent?.trim() || "",
    secretKey,
    scene: input.scene,
    tenantId: input.tenantId ?? null,
    employeeId: input.employeeId!,
    objectKey: input.objectKey,
    mimeType: input.mimetype ?? "",
    sizeBytes: input.sizeBytes ?? 0,
    nowSeconds: Math.floor(Date.now() / 1000),
  })) return;
  throw Errors.business(
    400,
    "虚拟商品图片上传凭证无效或已过期",
    ErrorCodes.FILE_STORAGE_UPLOAD_FAILED,
  );
}
