import {
  PROJECT_ACCEPTANCE_STAGE_LABELS,
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  PROJECT_LOG_STAGE_CODE_VALUES,
  type ProjectAcceptanceStatus,
} from "@gooes/domain";
import { buildUploadPreviewUrl, uploadDirectToCos } from "@/lib/cos-direct-upload";
import { requestBackendJson } from "@/lib/backend-client";

export const stageOptions = PROJECT_LOG_STAGE_CODE_VALUES
  .filter((value) => value !== PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE)
  .map((value) => ({
    value,
    label: PROJECT_ACCEPTANCE_STAGE_LABELS[value],
  }));

export const openAcceptanceStatuses = new Set<ProjectAcceptanceStatus>([
  "draft",
  "submitted",
  "leader_approved",
  "rejected",
]);

export function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function requestBackend<T>(
  path: string,
  input?: { method?: "GET" | "POST" | "PATCH" | "DELETE"; payload?: unknown },
) {
  return requestBackendJson<T>(path, {
    method: input?.method || "GET",
    body: input?.payload ? JSON.stringify(input.payload) : undefined,
    fallbackMessage: "请求失败",
  });
}

export async function uploadAcceptanceImageDirect(file: File, projectId: string) {
  const mimetype = file.type || "image/jpeg";
  const uploaded = await uploadDirectToCos(file, {
    scene: "project_acceptance",
    mimetype,
    payload: { project_id: projectId },
    uploadErrorLabel: "上传验收图片",
    missingStorageMessage: "验收图片上传成功但未返回图片地址",
  });

  return {
    path: uploaded.storagePath,
    preview: uploaded.url || uploaded.storagePath,
  };
}

export function getPreviewImageSrc(image: string) {
  return buildUploadPreviewUrl(image);
}
