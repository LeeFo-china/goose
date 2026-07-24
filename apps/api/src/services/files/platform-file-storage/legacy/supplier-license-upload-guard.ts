import { ErrorCodes, Errors } from "./shared";
import type {
  DirectUploadInput,
  RegisterExistingCosObjectInput,
} from "./shared";
import { buildSupplierBusinessLicenseEmployeePrefix } from "./paths";
import { normalizePrivateUploadMimeType } from "./private-upload-intent";
import { getSupplierBusinessLicenseUploadPolicy } from "./direct-upload-scene-policy";
import { verifySupplierLicenseUploadIntent } from "./supplier-license-upload-intent";

export function assertSupplierLicenseUploadDeclaration(
  input: Pick<DirectUploadInput, "tenantId" | "employeeId" | "mimetype" | "sizeBytes">,
  policy: NonNullable<ReturnType<typeof getSupplierBusinessLicenseUploadPolicy>>,
) {
  const mimeType = normalizePrivateUploadMimeType(input.mimetype);
  if (
    input.tenantId ||
    !input.employeeId ||
    !Number.isInteger(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > policy.maxSizeBytes
  ) throw supplierLicenseUploadError(policy.sizeError);
  if (!policy.mimeTypes.has(mimeType)) {
    throw supplierLicenseUploadError(policy.typeError);
  }
}

export function assertPrivateSupplierLicenseIntent(input: {
  input: RegisterExistingCosObjectInput;
  secretKey: string;
}) {
  const policy = getSupplierBusinessLicenseUploadPolicy(input.input.scene)!;
  assertSupplierLicenseUploadDeclaration({
    tenantId: input.input.tenantId,
    employeeId: input.input.employeeId,
    mimetype: input.input.mimetype ?? "",
    sizeBytes: input.input.sizeBytes ?? 0,
  }, policy);
  const expectedPrefix = buildSupplierBusinessLicenseEmployeePrefix(
    input.input.employeeId,
  );
  if (!input.input.objectKey.startsWith(expectedPrefix)) {
    throw supplierLicenseUploadError("供应商营业执照对象路径无效");
  }
  if (!verifySupplierLicenseUploadIntent({
    token: input.input.uploadIntent?.trim() || "",
    secretKey: input.secretKey,
    scene: input.input.scene,
    employeeId: input.input.employeeId!,
    objectKey: input.input.objectKey,
    mimeType: input.input.mimetype ?? "",
    sizeBytes: input.input.sizeBytes ?? 0,
    nowSeconds: Math.floor(Date.now() / 1000),
  })) {
    throw supplierLicenseUploadError("供应商营业执照上传凭证无效或已过期");
  }
}

function supplierLicenseUploadError(message: string) {
  return Errors.business(
    400,
    message,
    ErrorCodes.FILE_STORAGE_UPLOAD_FAILED,
  );
}
