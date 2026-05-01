import { NextResponse } from "next/server";
import { buildBackendUrl } from "@/lib/backend";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  let response: Response;
  try {
    response = await fetch(buildBackendUrl("/admin/auth/send-code"), {
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
  const payload = await response.json().catch(() => ({}));

  return NextResponse.json(payload, { status: response.status });
}
