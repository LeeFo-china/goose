import { NextResponse } from "next/server";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl } from "@/lib/backend";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

const RETRYABLE_METHODS = new Set(["GET", "HEAD"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      });
    } catch (error) {
      lastError = error;
      console.error("[admin-backend-proxy] backend fetch failed", {
        path: input.path,
        method: input.method,
        attempt,
        maxAttempts,
        error: error instanceof Error ? error.message : String(error),
      });

      if (attempt < maxAttempts) {
        await sleep(300);
      }
    }
  }

  throw lastError;
}

async function proxyBackend(request: Request, context: RouteContext) {
  const token = await getAdminToken();
  if (!token) {
    return NextResponse.json(
      {
        success: false,
        message: "缺少登录凭证",
        code: "TOKEN_MISSING",
      },
      { status: 401 },
    );
  }

  const params = await context.params;
  const sourceUrl = new URL(request.url);
  const path = `/${params.path.join("/")}${sourceUrl.search}`;
  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.delete("host");
  headers.delete("cookie");
  headers.delete("content-length");

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
  const payload = await response.text();

  return new NextResponse(payload, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "application/json",
    },
  });
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
