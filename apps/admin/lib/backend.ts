export const ADMIN_TOKEN_COOKIE = "gooes_admin_token";

export type BackendResponse<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  code?: string;
  requestId?: string;
};

export type AdminEmployee = {
  id: string | null;
  name: string | null;
  phone?: string | null;
  status: string | null;
  tenant_department_id: string | null;
  department_name: string | null;
  post_id: string | null;
  post_name: string | null;
  avatar: string | null;
};

export type AdminPermission = {
  code: string;
  scope: "self" | "assigned" | "department" | "all";
};

export type AdminTenant = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
};

export type AdminSession = {
  user_id: string;
  login_channel: "admin_web";
  employee: AdminEmployee;
  tenant: AdminTenant | null;
  roles: string[];
  permissions: AdminPermission[];
  is_platform_staff?: boolean;
  is_platform_super_admin?: boolean;
  token?: string;
  expires_at?: string;
};

export function getBackendBaseUrl() {
  return (
    process.env.GOOES_API_BASE_URL ||
    process.env.NEXT_PUBLIC_GOOES_API_BASE_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export function buildBackendUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getBackendBaseUrl()}${normalizedPath}`;
}

export function shouldUseSecureAdminCookie(request: Request) {
  const override = process.env.ADMIN_COOKIE_SECURE?.trim().toLowerCase();
  if (override === "true" || override === "1" || override === "yes") {
    return true;
  }
  if (override === "false" || override === "0" || override === "no") {
    return false;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto?.split(",")[0]?.trim() === "https") {
    return true;
  }

  const host = request.headers.get("host")?.split(":")[0] || "";
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return false;
  }

  return process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:";
}

export async function parseBackendJson<T>(response: Response) {
  const payload = await response.json().catch(() => ({})) as BackendResponse<T>;

  if (!response.ok || payload.success === false) {
    const message = payload.message || `请求失败(${response.status})`;
    throw Object.assign(new Error(message), {
      status: response.status,
      code: payload.code,
      payload,
    });
  }

  return payload;
}
