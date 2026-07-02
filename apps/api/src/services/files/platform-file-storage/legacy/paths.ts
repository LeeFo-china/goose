import { randomUUID } from "node:crypto";
import { getFileExtension, joinPublicUrl, trimSlashes } from "./shared";
import type {
  PlatformFileProvider,
  PlatformUploadResponse,
  PlatformUploadScene,
  UploadImageInput,
} from "./shared";

export function buildLegacyObjectPath(this: any, input: {
  scene: PlatformUploadScene;
  projectId?: string;
  extension: string;
}) {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const prefixByScene: Record<PlatformUploadScene, string> = {
    project_log: input.projectId?.trim() || "unassigned",
    project_log_comment: "project-log-comment",
    customer_follow_up_comment: "customer-follow-up-comment",
    customer_service: "customer-service",
    expense_request: "expense-request",
    referral_payment: "referral-payment",
    employee_avatar: "employee-avatar",
    customer_avatar: "customer-avatar",
    customer_douyin_screenshot: "customer-douyin-screenshots",
    h5_marketing_page: "h5-marketing-pages",
    project_acceptance: input.projectId?.trim()
      ? `${input.projectId.trim()}/acceptance`
      : "project-acceptance",
    project_payment: input.projectId?.trim()
      ? `${input.projectId.trim()}/payment`
      : "project-payment",
    wechat_pay_applyment: "wechat-pay-applyment",
    picture_library: "picture-library",
    picture_comment: "picture-comment",
  };

  return `${prefixByScene[input.scene]}/${year}/${month}/${day}/${randomUUID()}${input.extension}`;
}

export function buildCosObjectKey(this: any, input: Pick<
  UploadImageInput,
  "filename" | "mimetype" | "scene" | "projectId" | "tenantId"
>) {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const extension = getFileExtension(input);
  const tenantPrefix = input.tenantId
    ? `tenants/${input.tenantId}`
    : "public";
  const scene = input.scene.replace(/_/g, "-");
  const projectSegment = input.projectId?.trim()
    ? `projects/${input.projectId.trim()}`
    : "unassigned";

  return `${tenantPrefix}/${scene}/${projectSegment}/${year}/${month}/${day}/${randomUUID()}${extension}`;
}

export function buildCosPublicUrl(this: any, input: {
  publicBaseUrl: string;
  bucket: string;
  region: string;
  objectKey: string;
}) {
  if (input.publicBaseUrl) {
    return joinPublicUrl(input.publicBaseUrl, input.objectKey);
  }

  return `https://${input.bucket}.cos.${input.region}.myqcloud.com/${
    trimSlashes(input.objectKey)
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")
  }`;
}

export function toUploadResponse(this: any, input: {
  fileId?: string;
  provider: PlatformFileProvider;
  bucket: string;
  region: string | null;
  objectKey: string;
  publicUrl: string;
  accessUrl: string;
}): PlatformUploadResponse {
  return {
    url: input.accessUrl || input.publicUrl,
    path: input.objectKey,
    file_id: input.fileId,
    provider: input.provider,
    bucket: input.bucket,
    region: input.region,
    object_key: input.objectKey,
    storage_path: input.objectKey,
    public_url: input.publicUrl,
  };
}
