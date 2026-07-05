import { NextResponse } from "next/server";
import { buildBackendUrl } from "@/lib/backend";

export async function POST(request: Request) {
  let backendResponse: Response;
  try {
    backendResponse = await fetch(buildBackendUrl("/public/partner-applications"), {
      method: "POST",
      headers: buildPublicHeaders(request),
      body: await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "后端服务未连接，请稍后再提交申请",
        code: "BACKEND_UNAVAILABLE",
      },
      { status: 502 },
    );
  }

  const payload = await backendResponse.arrayBuffer();
  const headers = new Headers();
  const contentType = backendResponse.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  return new NextResponse(payload, {
    status: backendResponse.status,
    headers,
  });
}

function buildPublicHeaders(request: Request) {
  const headers = new Headers();
  const accept = request.headers.get("accept");
  const contentType = request.headers.get("content-type");
  headers.set("accept", accept || "application/json");
  headers.set("content-type", contentType || "application/json");
  return headers;
}
