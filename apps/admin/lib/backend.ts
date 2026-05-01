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
  department_id: string | null;
  department_name: string | null;
  post_id: string | null;
  post_name: string | null;
  avatar: string | null;
};

export type AdminPermission = {
  code: string;
  scope: "self" | "assigned" | "department" | "all";
};

export type AdminSession = {
  user_id: string;
  login_channel: "admin_web";
  employee: AdminEmployee;
  roles: string[];
  permissions: AdminPermission[];
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
