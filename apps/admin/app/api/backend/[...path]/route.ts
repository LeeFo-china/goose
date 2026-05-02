import { NextResponse } from "next/server";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl } from "@/lib/backend";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

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
    response = await fetch(buildBackendUrl(path), {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
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
