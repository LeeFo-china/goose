import { NextResponse } from "next/server";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, type BackendResponse } from "@/lib/backend";

export const runtime = "nodejs";

const MAX_PROXY_UPLOAD_SIZE = 5 * 1024 * 1024;

type DirectUploadInitResult = {
  object_key: string;
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

  const { response: initResponse, payload: initPayload } =
    await requestUploadBackend<DirectUploadInitResult>(
      "/uploads/cos/direct-init",
      token,
      payload,
    );
  if (!initResponse.ok || initPayload.success === false || !initPayload.data?.upload_url) {
    return NextResponse.json(initPayload, { status: initResponse.status });
  }

  const uploadResponse = await fetch(initPayload.data.upload_url, {
    method: initPayload.data.method || "PUT",
    headers: initPayload.data.headers || {
      "content-type": String(payload.mimetype || file.type || "application/octet-stream"),
    },
    body: await file.arrayBuffer(),
  });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    return jsonError(
      `上传文件到 COS 失败(${uploadResponse.status})${
        detail.trim() ? `：${detail.trim().slice(0, 120)}` : ""
      }`,
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
  const { response: completeResponse, payload: completePayload } =
    await requestUploadBackend(
      "/uploads/cos/direct-complete",
      token,
      completeBody,
    );

  return NextResponse.json(completePayload, { status: completeResponse.status });
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
