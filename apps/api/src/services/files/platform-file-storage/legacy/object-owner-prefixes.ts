import { createHash } from "node:crypto";

import { Errors } from "@/errors/error-factory";

export function buildSupplierBusinessLicenseEmployeePrefix(
  employeeId: string | null | undefined,
): string {
  const normalizedEmployeeId = employeeId?.trim();
  if (!normalizedEmployeeId) {
    throw Errors.forbidden();
  }
  const employeeHash = createHash("sha256")
    .update(normalizedEmployeeId)
    .digest("hex");
  return `private/supplier-business-license/employees/${employeeHash}/`;
}

export function buildPlatformServiceFulfillmentAttachmentEmployeePrefix(
  employeeId: string | null | undefined,
): string {
  const normalizedEmployeeId = employeeId?.trim();
  if (!normalizedEmployeeId) {
    throw Errors.forbidden();
  }
  const employeeHash = createHash("sha256")
    .update(normalizedEmployeeId)
    .digest("hex");
  return `private/tenant-service-fulfillment-attachments/platform-employees/${employeeHash}/`;
}

export function buildTenantOnboardingLicenseVisitorPrefix(
  visitorId: string | null | undefined,
): string {
  const normalizedVisitorId = visitorId?.trim();
  if (!normalizedVisitorId) {
    throw Errors.forbidden();
  }
  const visitorHash = createHash("sha256")
    .update(normalizedVisitorId)
    .digest("hex");
  return `private/tenant-onboarding-license/visitors/${visitorHash}/`;
}
