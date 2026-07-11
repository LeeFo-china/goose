import { NextResponse } from "next/server";

import { bytesToArrayBuffer, readBoundedBody, type BodyReadResult } from "./bounded-body";
import { buildSignedClientIpHeaders } from "./proxy-client-ip";

export const MAX_PUBLIC_BODY_BYTES = 32 * 1024;

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
  const proxySecret = process.env.GOOES_WEB_PROXY_SHARED_SECRET;
  if (process.env.NODE_ENV === "production" && !proxySecret) {
    return proxyConfigurationErrorResponse();
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PUBLIC_BODY_BYTES) {
    await cancelBody(request.body);
    return payloadTooLargeResponse();
  }

  let requestBody: BodyReadResult;
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
      headers: buildPublicHeaders(request, options.visitorDeviceId, proxySecret),
      body: bytesToArrayBuffer(requestBody.bytes),
      cache: "no-store",
      redirect: "manual",
      signal: abortController.signal,
    });

    const responseBody = await readBoundedBody(
      backendResponse.body,
      undefined,
      abortController.signal,
    );

    const responseHeaders = new Headers();
    const contentType = backendResponse.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);

    return new NextResponse(bytesToArrayBuffer(responseBody.bytes), {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return backendUnavailableResponse();
  } finally {
    clearTimeout(timeout);
  }
}

function buildPublicHeaders(
  request: Request,
  visitorDeviceId?: string,
  proxySecret = process.env.GOOES_WEB_PROXY_SHARED_SECRET,
): Headers {
  const headers = new Headers();

  for (const headerName of PUBLIC_REQUEST_HEADERS) {
    if (visitorDeviceId && headerName.includes("device-id")) continue;
    const value = request.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }
  if (visitorDeviceId) headers.set("x-visitor-device-id", visitorDeviceId);
  if (proxySecret) {
    const signedClientIpHeaders = buildSignedClientIpHeaders(
      request.headers.get("x-real-ip"),
      proxySecret,
    );
    for (const [name, value] of signedClientIpHeaders) headers.set(name, value);
  }

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

function proxyConfigurationErrorResponse(): Response {
  return NextResponse.json(
    {
      success: false,
      message: "官网代理配置错误，请稍后再试",
      code: "PROXY_CONFIGURATION_ERROR",
    },
    { status: 502 },
  );
}
