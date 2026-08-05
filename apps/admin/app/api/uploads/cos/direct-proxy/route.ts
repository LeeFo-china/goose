import { NextResponse } from "next/server";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, type BackendResponse } from "@/lib/backend";

export const runtime = "nodejs";

const MAX_PROXY_UPLOAD_SIZE = 10 * 1024 * 1024;

type DirectUploadInitResult = {
  object_key: string;
  storage_path?: string;
  upload_url: string;
  method?: "PUT";
  headers?: Record<string, string>;
  upload_intent?: string;
};

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json(
    {
      success: false,
      message,
      code,
    },
    { status },
  );
}

async function readBackendJson<T>(response: Response) {
  return response.json().catch(() => ({})) as Promise<BackendResponse<T>>;
}

async function requestUploadBackend<T>(
  path: string,
  token: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(buildBackendUrl(path), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await readBackendJson<T>(response);
  return { response, payload };
}

export async function POST(request: Request) {
  const token = await getAdminToken();
  if (!token) {
    return jsonError("缺少登录凭证", 401, "TOKEN_MISSING");
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return jsonError("上传请求格式不正确", 400, "UPLOAD_PROXY_FORM_INVALID");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError("缺少上传文件", 400, "UPLOAD_PROXY_FILE_MISSING");
  }
  if (file.size <= 0 || file.size > MAX_PROXY_UPLOAD_SIZE) {
    return jsonError("上传文件大小无效", 400, "UPLOAD_PROXY_FILE_SIZE_INVALID");
  }

  const rawPayload = formData.get("payload");
  const payload = typeof rawPayload === "string" ? parseUploadPayload(rawPayload) : null;
  if (!payload) {
    return jsonError("上传参数不正确", 400, "UPLOAD_PROXY_PAYLOAD_INVALID");
  }

  let initResult: Awaited<ReturnType<
    typeof requestUploadBackend<DirectUploadInitResult>
  >>;
  try {
    initResult = await requestUploadBackend<DirectUploadInitResult>(
      "/uploads/cos/direct-init",
      token,
      payload,
    );
  } catch {
    return uploadProxyNetworkError();
  }
  const { response: initResponse, payload: initPayload } = initResult;
  if (!initResponse.ok || initPayload.success === false || !initPayload.data?.upload_url) {
    return NextResponse.json(initPayload, { status: initResponse.status });
  }

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(initPayload.data.upload_url, {
      method: initPayload.data.method || "PUT",
      headers: initPayload.data.headers || {
        "content-type": String(
          payload.mimetype || file.type || "application/octet-stream",
        ),
      },
      body: await file.arrayBuffer(),
    });
  } catch {
    return uploadProxyNetworkError();
  }
  if (!uploadResponse.ok) {
    return jsonError(
      "上传文件到存储服务失败，请稍后重试",
      502,
      "UPLOAD_PROXY_COS_FAILED",
    );
  }

  const completeBody = {
    ...payload,
    object_key: initPayload.data.object_key,
    etag: uploadResponse.headers.get("etag") || undefined,
    upload_intent: initPayload.data.upload_intent,
  };
  let completeResult: Awaited<ReturnType<
    typeof requestUploadBackend<Record<string, unknown>>
  >>;
  try {
    completeResult = await requestUploadBackend<Record<string, unknown>>(
      "/uploads/cos/direct-complete",
      token,
      completeBody,
    );
  } catch {
    return uploadProxyNetworkError();
  }
  const { response: completeResponse, payload: completePayload } =
    completeResult;

  if (
    completeResponse.ok &&
    completePayload.success !== false &&
    completePayload.data
  ) {
    return NextResponse.json({
      ...completePayload,
      data: {
        init: initPayload.data,
        completed: {
          ...completePayload.data,
          object_key: initPayload.data.object_key,
          storage_path: initPayload.data.storage_path ??
            initPayload.data.object_key,
        },
      },
    }, { status: completeResponse.status });
  }
  return NextResponse.json(completePayload, { status: completeResponse.status });
}

function uploadProxyNetworkError() {
  return jsonError(
    "上传服务暂不可用，请稍后重试",
    502,
    "UPLOAD_PROXY_NETWORK_FAILED",
  );
}

function parseUploadPayload(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
