import { NextResponse } from "next/server";
import {
  clearAdminTokenCookie,
  clearAdminTokenCookieOnUnauthorized,
} from "@/lib/admin-auth-cookie";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl } from "@/lib/backend";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

const RETRYABLE_METHODS = new Set(["GET", "HEAD"]);
function isAiSecretPath(path: string) {
  return /^\/platform\/ai-config\/secret-settings(?:[/?]|$)/.test(path);
}
const REDIRECT_RESPONSE_HEADERS = [
  "location",
  "cache-control",
  "pragma",
  "referrer-policy",
] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildBackendHeaders(request: Request, token: string) {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);

  const accept = request.headers.get("accept");
  if (accept) {
    headers.set("accept", accept);
  }

  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) {
    headers.set("idempotency-key", idempotencyKey);
  }

  return headers;
}

async function fetchBackendWithRetry(input: {
  url: string;
  method: string;
  headers: Headers;
  body?: ArrayBuffer;
  path: string;
}) {
  const maxAttempts = RETRYABLE_METHODS.has(input.method) ? 2 : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetch(input.url, {
        method: input.method,
        headers: input.headers,
        body: input.body,
        cache: "no-store",
        redirect: "manual",
      });
    } catch (error) {
      lastError = error;
      const isSecret = isAiSecretPath(input.path);
      console.error("[admin-backend-proxy] backend fetch failed", {
        path: isSecret ? "/platform/ai-config/secret-settings/:key" : input.path,
        method: input.method,
        attempt,
        maxAttempts,
        error: isSecret ? "密钥配置后端连接失败" : error instanceof Error ? error.message : String(error),
      });

      if (attempt < maxAttempts) {
        await sleep(300);
      }
    }
  }

  throw lastError;
}

async function fetchProxiedBackend(request: Request, context: RouteContext) {
  const token = await getAdminToken();
  if (!token) {
    return clearAdminTokenCookie(NextResponse.json(
      {
        success: false,
        message: "缺少登录凭证",
        code: "TOKEN_MISSING",
      },
      { status: 401 },
    ));
  }

  const params = await context.params;
  const sourceUrl = new URL(request.url);
  const path = `/${params.path.join("/")}${sourceUrl.search}`;
  const headers = buildBackendHeaders(request, token);

  const method = request.method.toUpperCase();
  let response: Response;
  try {
    response = await fetchBackendWithRetry({
      url: buildBackendUrl(path),
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
      path,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "后端服务未连接，请确认 gooes 后端已启动",
        code: "BACKEND_UNAVAILABLE",
      },
      { status: 502 },
    );
  }
  if (response.status >= 300 && response.status < 400) {
    const redirectHeaders = new Headers();
    for (const name of REDIRECT_RESPONSE_HEADERS) {
      const value = response.headers.get(name);
      if (value) redirectHeaders.set(name, value);
    }

    return new NextResponse(null, {
      status: response.status,
      headers: redirectHeaders,
    });
  }

  const payload = response.status === 204 || response.status === 304
    ? null
    : await response.arrayBuffer();
  const responseHeaders = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) {
    responseHeaders.set("content-type", contentType);
  }

  return clearAdminTokenCookieOnUnauthorized(new NextResponse(payload, {
    status: response.status,
    headers: responseHeaders,
  }));
}

async function proxyBackend(request: Request, context: RouteContext) {
  const response = await fetchProxiedBackend(request, context);
  const { path } = await context.params;
  // Private images and secret configuration must remain non-cacheable, including
  // early errors, without changing unrelated proxy routes.
  if (path[0] === "tenant" && path[1] === "rendering-library"
    || path[0] === "platform" && path[1] === "ai-config" && path[2] === "secret-settings") {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
  }
  return response;
}

export async function GET(request: Request, context: RouteContext) {
  return proxyBackend(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyBackend(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return proxyBackend(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return proxyBackend(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return proxyBackend(request, context);
}
