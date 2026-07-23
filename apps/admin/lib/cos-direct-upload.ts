import {
  getPayloadMessage,
  requestBackendJson,
  type BackendClientPayload,
} from "@/lib/backend-client";

export type DirectUploadInitResult = {
  object_key: string;
  storage_path?: string;
  upload_url: string;
  method?: "PUT";
  headers?: Record<string, string>;
  upload_intent?: string;
};

export type DirectUploadCompleteResult = {
  file_id?: string;
  url?: string;
  public_url?: string;
  path?: string;
  object_key?: string;
  storage_path?: string;
};

export type DirectUploadResult = {
  fileId?: string;
  storagePath: string;
  objectKey?: string;
  url?: string;
  publicUrl?: string;
  init: DirectUploadInitResult;
  completed: DirectUploadCompleteResult;
};

export function buildUploadPreviewUrl(value: string) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("blob:") || value.startsWith("data:")) {
    return value;
  }
  return `/api/backend/uploads/public-url?path=${encodeURIComponent(value)}`;
}

export function validateUploadFile(
  file: File,
  input: {
    allowedTypes?: ReadonlySet<string>;
    maxSizeBytes?: number;
    typeMessage?: string;
    sizeMessage?: string;
  },
) {
  if (input.allowedTypes && !input.allowedTypes.has(file.type)) {
    throw new Error(input.typeMessage || "文件类型不支持");
  }

  if (input.maxSizeBytes != null && file.size > input.maxSizeBytes) {
    throw new Error(input.sizeMessage || "文件大小超过限制");
  }
}

export async function uploadDirectToCos(
  file: File,
  input: {
    scene: string;
    payload?: Record<string, unknown>;
    filename?: string;
    mimetype?: string;
    uploadErrorLabel?: string;
    initFallbackMessage?: string;
    completeFallbackMessage?: string;
    missingStorageMessage?: string;
  },
): Promise<DirectUploadResult> {
  const filename = input.filename || file.name;
  const mimetype = input.mimetype || file.type || "application/octet-stream";
  const commonPayload = {
    scene: input.scene,
    filename,
    mimetype,
    size_bytes: file.size,
    ...(input.payload || {}),
  };

  const init = await requestBackendJson<DirectUploadInitResult>("/uploads/cos/direct-init", {
    method: "POST",
    body: JSON.stringify(commonPayload),
    fallbackMessage: input.initFallbackMessage || "初始化文件直传失败",
  });

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(init.upload_url, {
      method: init.method || "PUT",
      headers: init.headers || { "content-type": mimetype },
      body: file,
    });
  } catch (error) {
    if (!isBrowserDirectUploadNetworkError(error)) throw error;

    const completed = await uploadDirectToCosProxy<DirectUploadCompleteResult>(
      file,
      commonPayload,
      input.completeFallbackMessage || "登记文件直传结果失败",
    );
    return buildDirectUploadResult(completed, init, input.missingStorageMessage);
  }
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    throw new Error(
      `${input.uploadErrorLabel || "上传文件"}到 COS 失败(${uploadResponse.status})${
        detail.trim() ? `：${detail.trim().slice(0, 120)}` : ""
      }`,
    );
  }

  const completed = await requestBackendJson<DirectUploadCompleteResult>(
    "/uploads/cos/direct-complete",
    {
      method: "POST",
      body: JSON.stringify({
        ...commonPayload,
        object_key: init.object_key,
        etag: uploadResponse.headers.get("etag") || undefined,
        upload_intent: init.upload_intent,
      }),
      fallbackMessage: input.completeFallbackMessage || "登记文件直传结果失败",
    },
  );

  return buildDirectUploadResult(completed, init, input.missingStorageMessage);
}

function buildDirectUploadResult(
  completed: DirectUploadCompleteResult,
  init: DirectUploadInitResult,
  missingStorageMessage?: string,
): DirectUploadResult {
  const storagePath = completed.storage_path || completed.object_key || init.storage_path ||
    init.object_key;
  if (typeof storagePath !== "string" || !storagePath) {
    throw new Error(missingStorageMessage || "文件上传成功但未返回地址");
  }

  return {
    fileId: completed.file_id,
    storagePath,
    objectKey: completed.object_key || init.object_key,
    url: completed.url,
    publicUrl: completed.public_url,
    init,
    completed,
  };
}

function isBrowserDirectUploadNetworkError(error: unknown) {
  if (!(error instanceof TypeError)) return false;
  return /fetch|network|failed/i.test(error.message);
}

async function uploadDirectToCosProxy<T>(
  file: File,
  commonPayload: Record<string, unknown>,
  fallbackMessage: string,
) {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("payload", JSON.stringify(commonPayload));
  for (const [key, value] of Object.entries(commonPayload)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      formData.set(key, String(value));
    }
  }

  const response = await fetch("/api/uploads/cos/direct-proxy", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => ({})) as BackendClientPayload<T>;
  if (!response.ok || payload.success === false) {
    throw Object.assign(
      new Error(getPayloadMessage(payload, fallbackMessage || `请求失败(${response.status})`)),
      {
        status: response.status,
        code: payload.code,
        requestId: payload.requestId,
        payload,
      },
    );
  }

  return payload.data as T;
}
