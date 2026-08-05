import { ErrorCodes, Errors } from "./shared";
import type {
  DirectUploadInput,
  RegisterExistingCosObjectInput,
} from "./shared";
import { getPlatformServiceFulfillmentAttachmentUploadPolicy } from
  "./direct-upload-scene-policy";
import { normalizePrivateUploadMimeType } from "./private-upload-intent";
import { assertValidPlatformServiceFulfillmentUploadIntent } from
  "./platform-service-fulfillment-upload-intent";

export const PLATFORM_SERVICE_FULFILLMENT_ATTACHMENT_SCENE =
  "tenant_service_fulfillment_attachment";

export function getPlatformServiceFulfillmentAttachmentPrivatePolicy(
  input: Pick<DirectUploadInput, "scene" | "visibility">,
) {
  return input.visibility === "private"
    ? getPlatformServiceFulfillmentAttachmentUploadPolicy(input.scene)
    : null;
}

export function isPrivatePlatformServiceFulfillmentAttachmentUpload(
  input: Pick<DirectUploadInput, "scene" | "visibility">,
) {
  return input.scene === PLATFORM_SERVICE_FULFILLMENT_ATTACHMENT_SCENE &&
    input.visibility === "private";
}

export function assertPlatformServiceFulfillmentAttachmentDirectUpload(
  input: Pick<
    DirectUploadInput,
    "scene" | "visibility" | "employeeId" | "tenantId" | "mimetype" | "sizeBytes"
  >,
) {
  if (
    input.scene === PLATFORM_SERVICE_FULFILLMENT_ATTACHMENT_SCENE &&
    (!isPrivatePlatformServiceFulfillmentAttachmentUpload(input) ||
      !input.employeeId ||
      input.tenantId)
  ) throw Errors.forbidden();

  const policy = getPlatformServiceFulfillmentAttachmentPrivatePolicy(input);
  if (!policy) return;

  const mimeType = normalizePrivateUploadMimeType(input.mimetype);
  if (
    !Number.isInteger(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > policy.maxSizeBytes
  ) throw privateUploadError(policy.sizeError);
  if (!policy.mimeTypes.has(mimeType)) {
    throw privateUploadError(policy.typeError);
  }
}

export function assertPlatformServiceFulfillmentAttachmentCompletion(
  input: RegisterExistingCosObjectInput,
  secretKey: string,
) {
  if (
    input.scene === PLATFORM_SERVICE_FULFILLMENT_ATTACHMENT_SCENE &&
    (!isPrivatePlatformServiceFulfillmentAttachmentUpload(input) ||
      !input.employeeId ||
      input.tenantId)
  ) throw Errors.forbidden();

  if (isPrivatePlatformServiceFulfillmentAttachmentUpload(input)) {
    assertValidPlatformServiceFulfillmentUploadIntent(input, secretKey);
  }
}

function privateUploadError(message: string) {
  return Errors.business(
    400,
    message,
    ErrorCodes.FILE_STORAGE_UPLOAD_FAILED,
  );
}
