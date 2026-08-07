import { handleBrowserAdminSessionExpiry } from "@/lib/admin-session-expiry";

export type BackendClientPayload<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: string;
  details?: unknown;
  requestId?: string;
};

type BackendClientInit = RequestInit & {
  fallbackMessage?: string;
};

export function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    if ("message" in payload) {
      const message = (payload as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }

    if ("error" in payload) {
      const error = (payload as { error?: unknown }).error;
      if (typeof error === "string" && error.trim()) return error;
    }
  }

  return fallback;
}

export function buildBackendProxyPath(path: string) {
  if (path.startsWith("/api/backend")) return path;
  return `/api/backend${path.startsWith("/") ? path : `/${path}`}`;
}

export async function requestBackendJson<T = unknown>(
  path: string,
  init: BackendClientInit = {},
) {
  const { fallbackMessage = "操作失败", headers, ...requestInit } = init;
  const response = await fetch(buildBackendProxyPath(path), {
    ...requestInit,
    headers: {
      ...(requestInit.body ? { "content-type": "application/json" } : {}),
      ...(headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as BackendClientPayload<T>;

  if (!response.ok || payload.success === false) {
    handleBrowserAdminSessionExpiry({
      status: response.status,
      code: payload.code,
    });
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
