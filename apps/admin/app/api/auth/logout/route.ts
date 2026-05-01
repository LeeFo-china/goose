import { NextResponse } from "next/server";
import { ADMIN_TOKEN_COOKIE } from "@/lib/backend";

export async function POST() {
  const response = NextResponse.json({
    success: true,
    data: { success: true },
    message: "已退出登录",
  });
  response.cookies.delete(ADMIN_TOKEN_COOKIE);
  return response;
}
