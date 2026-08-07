import { NextResponse } from "next/server";
import {
  clearAdminTokenCookie,
  clearAdminTokenCookieOnUnauthorized,
} from "@/lib/admin-auth-cookie";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl } from "@/lib/backend";

export async function GET() {
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

  let response: Response;
  try {
    response = await fetch(buildBackendUrl("/admin/auth/me"), {
      headers: {
        authorization: `Bearer ${token}`,
      },
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
  const payload = await response.json().catch(() => ({}));

  return clearAdminTokenCookieOnUnauthorized(
    NextResponse.json(payload, { status: response.status }),
  );
}
