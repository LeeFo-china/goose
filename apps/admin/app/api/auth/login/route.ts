import { NextResponse } from "next/server";
import {
  ADMIN_TOKEN_COOKIE,
  buildBackendUrl,
  type BackendResponse,
  type AdminSession,
} from "@/lib/backend";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  let response: Response;
  try {
    response = await fetch(buildBackendUrl("/admin/auth/login"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
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
  const payload = await response.json().catch(() => ({})) as BackendResponse<AdminSession>;
  const nextResponse = NextResponse.json(payload, { status: response.status });

  if (response.ok && payload.data?.token) {
    nextResponse.cookies.set({
      name: ADMIN_TOKEN_COOKIE,
      value: payload.data.token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: payload.data.expires_at
        ? new Date(payload.data.expires_at)
        : undefined,
    });
  }

  return nextResponse;
}
