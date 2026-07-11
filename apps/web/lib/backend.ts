import { NextResponse } from "next/server";

export const MAX_PUBLIC_BODY_BYTES = 32 * 1024;

const PUBLIC_REQUEST_HEADERS = [
  "accept",
  "content-type",
  "x-device-id",
  "x-visitor-device-id",
  "x-client-device-id",
] as const;

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

export async function proxyPublicPost(
  request: Request,
  backendPath: string,
): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PUBLIC_BODY_BYTES) {
    return payloadTooLargeResponse();
  }

  const requestBody = await request.arrayBuffer();
  if (requestBody.byteLength > MAX_PUBLIC_BODY_BYTES) {
    return payloadTooLargeResponse();
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(buildBackendUrl(backendPath), {
      method: "POST",
      headers: buildPublicHeaders(request),
      body: requestBody,
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "后端服务未连接，请稍后再试",
        code: "BACKEND_UNAVAILABLE",
      },
      { status: 502 },
    );
  }

  const responseBody = await backendResponse.arrayBuffer();
  const responseHeaders = new Headers();
  const contentType = backendResponse.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);

  return new NextResponse(responseBody, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}

function buildPublicHeaders(request: Request): Headers {
  const headers = new Headers();

  for (const headerName of PUBLIC_REQUEST_HEADERS) {
    const value = request.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }

  return headers;
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
