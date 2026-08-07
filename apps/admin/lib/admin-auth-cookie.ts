import type { NextResponse } from "next/server";
import { ADMIN_TOKEN_COOKIE } from "@/lib/backend";

export function clearAdminTokenCookie<T extends NextResponse>(response: T): T {
  response.cookies.delete(ADMIN_TOKEN_COOKIE);
  return response;
}

export function clearAdminTokenCookieOnUnauthorized<T extends NextResponse>(response: T): T {
  return response.status === 401 ? clearAdminTokenCookie(response) : response;
}
