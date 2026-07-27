import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  buildSupplierBusinessLicenseEmployeePrefix,
  buildTenantOnboardingLicenseVisitorPrefix,
} from "@/services/files/platform-file-storage";

const PROJECT_REQUIRED_UPLOAD_SCENES = new Set([
  "project_log",
  "project_acceptance",
  "project_payment",
]);

const BRAND_LOGO_EXTENSION_BY_MIMETYPE: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const BRAND_LOGO_OBJECT_SUFFIX_PATTERN =
  /^\d{4}\/\d{2}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export type DirectUploadActorContext = {
  tenantId: string | null;
  employeeId: string | null;
  customerId: string | null;
  visitorId: string | null;
  isPlatformAdmin: boolean;
};

export function isProjectRequiredUploadScene(scene: string): boolean {
  return PROJECT_REQUIRED_UPLOAD_SCENES.has(scene);
}

export function assertDirectObjectKeyBelongsToActor(input: {
  objectKey: string;
  scene: string;
  actorContext: DirectUploadActorContext;
  projectId?: string;
  mimetype?: string;
}): void {
  const expectedPrefix = buildExpectedPrefix(input.scene, input.actorContext);
  if (!input.objectKey.startsWith(expectedPrefix)) {
    throw ownershipError("上传对象不属于当前登录身份");
  }

  if (input.scene === "brand_logo") {
    const suffix = input.objectKey.slice(expectedPrefix.length);
    const expectedExtension =
      BRAND_LOGO_EXTENSION_BY_MIMETYPE[input.mimetype ?? ""];
    const matchedExtension =
      BRAND_LOGO_OBJECT_SUFFIX_PATTERN.exec(suffix)?.[1];
    if (
      !expectedExtension ||
      matchedExtension !== expectedExtension
    ) {
      throw ownershipError("品牌 Logo 上传对象路径无效");
    }
  }

  if (isProjectRequiredUploadScene(input.scene)) {
    const expectedProjectSegment = `/projects/${input.projectId}/`;
    if (
      !input.projectId ||
      !input.objectKey.includes(expectedProjectSegment)
    ) {
      throw ownershipError("上传对象不属于当前项目");
    }
  }
}

function buildExpectedPrefix(
  scene: string,
  actorContext: DirectUploadActorContext,
): string {
  if (scene === "tenant_onboarding_license") {
    return buildTenantOnboardingLicenseVisitorPrefix(actorContext.visitorId);
  }
  if (scene === "supplier_business_license") {
    return buildSupplierBusinessLicenseEmployeePrefix(actorContext.employeeId);
  }
  const actorPrefix = actorContext.tenantId
    ? `tenants/${actorContext.tenantId}`
    : "public";
  return `${actorPrefix}/${scene.replace(/_/g, "-")}/`;
}

function ownershipError(message: string) {
  return Errors.business(403, message, ErrorCodes.FORBIDDEN);
}
