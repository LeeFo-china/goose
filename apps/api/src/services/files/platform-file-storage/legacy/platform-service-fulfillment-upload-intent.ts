import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  createPublicEmployeeUploadIntent,
  type PublicEmployeeUploadIntentClaims,
  type PublicEmployeeUploadIntentInput,
  verifyPublicEmployeeUploadIntent,
} from "./public-employee-upload-intent";
import type {
  DirectUploadInput,
  RegisterExistingCosObjectInput,
} from "./shared";

const OPTIONS = {
  expectedScene: "tenant_service_fulfillment_attachment",
  keyDerivationLabel: "gooes:platform-service-fulfillment-upload-intent:v1",
} as const;

type PlatformServiceFulfillmentUploadIntentInput =
  PublicEmployeeUploadIntentInput;
export type PlatformServiceFulfillmentUploadIntentClaims =
  PublicEmployeeUploadIntentClaims;

export function createPlatformServiceFulfillmentUploadIntent(
  input: PlatformServiceFulfillmentUploadIntentInput & {
    expiresAtSeconds: number;
  },
) {
  return createPublicEmployeeUploadIntent(input, OPTIONS);
}

export function createDirectPlatformServiceFulfillmentUploadIntent(
  input: DirectUploadInput,
  signing: {
    secretKey: string;
    objectKey: string;
    expiresAtSeconds: number;
  },
) {
  return createPlatformServiceFulfillmentUploadIntent({
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

export function verifyPlatformServiceFulfillmentUploadIntent(
  input: PlatformServiceFulfillmentUploadIntentInput & {
    token: string;
    nowSeconds: number;
  },
) {
  return verifyPublicEmployeeUploadIntent(input, OPTIONS);
}

export function assertValidPlatformServiceFulfillmentUploadIntent(
  input: RegisterExistingCosObjectInput,
  secretKey: string,
) {
  if (verifyPlatformServiceFulfillmentUploadIntent({
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
    "履约附件上传凭证无效或已过期",
    ErrorCodes.FILE_STORAGE_UPLOAD_FAILED,
  );
}
