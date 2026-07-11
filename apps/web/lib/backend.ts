import { NextResponse } from "next/server";

export const MAX_PUBLIC_BODY_BYTES = 32 * 1024;
export const MAX_PUBLIC_RESPONSE_BYTES = 256 * 1024;

const DEFAULT_UPSTREAM_TIMEOUT_MS = 8_000;
const VISITOR_COOKIE_NAME = "gooes_visitor_device_id";
const VISITOR_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_REQUEST_HEADERS = [
  "accept",
  "content-type",
  "x-device-id",
  "x-visitor-device-id",
  "x-client-device-id",
] as const;

interface ProxyPublicPostOptions {
  readonly upstreamTimeoutMs?: number;
  readonly visitorDeviceId?: string;
}

type BoundedBodyResult =
  | { readonly status: "ok"; readonly bytes: Uint8Array }
  | { readonly status: "too_large" };

export function getBackendBaseUrl(): string {
  return (
    process.env.GOOES_API_BASE_URL ??
    process.env.NEXT_PUBLIC_GOOES_API_BASE_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export function buildBackendUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${getBackendBaseUrl()}${normalizedPath}`;
}

export async function proxyVisitorPublicPost(
  request: Request,
  backendPath: string,
): Promise<Response> {
  const existingVisitorId = readVisitorId(request.headers.get("cookie"));
  const visitorId = existingVisitorId ?? crypto.randomUUID();
  const response = await proxyPublicPost(request, backendPath, {
    visitorDeviceId: `web_${visitorId}`,
  });

  if (!existingVisitorId) {
    response.headers.append("set-cookie", buildVisitorCookie(request, visitorId));
  }

  return response;
}

export async function proxyPublicPost(
  request: Request,
  backendPath: string,
  options: ProxyPublicPostOptions = {},
): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PUBLIC_BODY_BYTES) {
    await cancelBody(request.body);
    return payloadTooLargeResponse();
  }

  let requestBody: BoundedBodyResult;
  try {
    requestBody = await readBoundedBody(request.body, MAX_PUBLIC_BODY_BYTES);
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "请求内容读取失败",
        code: "INVALID_REQUEST_BODY",
      },
      { status: 400 },
    );
  }
  if (requestBody.status === "too_large") return payloadTooLargeResponse();

  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(new DOMException("upstream timeout", "TimeoutError")),
    options.upstreamTimeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS,
  );

  try {
    const backendResponse = await fetch(buildBackendUrl(backendPath), {
      method: "POST",
      headers: buildPublicHeaders(request, options.visitorDeviceId),
      body: toArrayBuffer(requestBody.bytes),
      cache: "no-store",
      redirect: "manual",
      signal: abortController.signal,
    });

    const declaredResponseLength = Number(
      backendResponse.headers.get("content-length"),
    );
    if (
      Number.isFinite(declaredResponseLength) &&
      declaredResponseLength > MAX_PUBLIC_RESPONSE_BYTES
    ) {
      await cancelBody(backendResponse.body);
      return backendUnavailableResponse();
    }

    const responseBody = await readBoundedBody(
      backendResponse.body,
      MAX_PUBLIC_RESPONSE_BYTES,
      abortController.signal,
    );
    if (responseBody.status === "too_large") {
      return backendUnavailableResponse();
    }

    const responseHeaders = new Headers();
    const contentType = backendResponse.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);

    return new NextResponse(toArrayBuffer(responseBody.bytes), {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return abortController.signal.aborted
      ? backendTimeoutResponse()
      : backendUnavailableResponse();
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<BoundedBodyResult> {
  if (!body) return { status: "ok", bytes: new Uint8Array() };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let rejectOnAbort: ((reason?: unknown) => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectOnAbort = reject;
  });
  const handleAbort = () => {
    rejectOnAbort?.(signal?.reason);
    void reader.cancel(signal?.reason).catch(() => undefined);
  };
  signal?.addEventListener("abort", handleAbort, { once: true });

  try {
    while (true) {
      if (signal?.aborted) throw signal.reason;
      const { done, value } = await (signal
        ? Promise.race([reader.read(), aborted])
        : reader.read());
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: "too_large" };
      }
      chunks.push(value);
    }
  } finally {
    signal?.removeEventListener("abort", handleAbort);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { status: "ok", bytes };
}

function buildPublicHeaders(
  request: Request,
  visitorDeviceId?: string,
): Headers {
  const headers = new Headers();

  for (const headerName of PUBLIC_REQUEST_HEADERS) {
    if (visitorDeviceId && headerName.includes("device-id")) continue;
    const value = request.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }
  if (visitorDeviceId) headers.set("x-visitor-device-id", visitorDeviceId);

  return headers;
}

function readVisitorId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== VISITOR_COOKIE_NAME) continue;
    const value = rawValue.join("=").trim();
    return UUID_PATTERN.test(value) ? value : null;
  }

  return null;
}

function buildVisitorCookie(request: Request, visitorId: string): string {
  const isSecure =
    process.env.NODE_ENV === "production" ||
    new URL(request.url).protocol === "https:";
  return [
    `${VISITOR_COOKIE_NAME}=${visitorId}`,
    "Path=/",
    `Max-Age=${VISITOR_COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
    isSecure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  await body?.cancel().catch(() => undefined);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function payloadTooLargeResponse(): Response {
  return NextResponse.json(
    {
      success: false,
      message: "请求内容不能超过 32KB",
      code: "PAYLOAD_TOO_LARGE",
    },
    { status: 413 },
  );
}

function backendUnavailableResponse(): Response {
  return NextResponse.json(
    {
      success: false,
      message: "后端服务未连接，请稍后再试",
      code: "BACKEND_UNAVAILABLE",
    },
    { status: 502 },
  );
}

function backendTimeoutResponse(): Response {
  return NextResponse.json(
    {
      success: false,
      message: "后端服务响应超时，请稍后再试",
      code: "BACKEND_TIMEOUT",
    },
    { status: 504 },
  );
}
