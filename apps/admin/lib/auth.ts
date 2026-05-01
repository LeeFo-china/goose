import { cookies } from "next/headers";
import { buildBackendUrl, parseBackendJson, type AdminSession, ADMIN_TOKEN_COOKIE } from "@/lib/backend";

export async function getAdminToken() {
  return (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value || null;
}

export async function getAdminSession() {
  const token = await getAdminToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(buildBackendUrl("/admin/auth/me"), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<AdminSession>(response);
    return payload.data ?? null;
  } catch {
    return null;
  }
}
