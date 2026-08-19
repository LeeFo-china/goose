const BACKEND_PROXY_PREFIX = "/api/backend";
const SERVICE_ACCESS_PATH = "/service-access";

const RECOVERY_API_SCOPES = [
  "/employee/service-access",
  "/billing",
] as const;

const RECOVERY_PAGE_SCOPES = [SERVICE_ACCESS_PATH, "/billing"] as const;

export type AdminServiceAccessErrorKind =
  | "redirect"
  | "readonly"
  | "capability"
  | "none";

export type AdminServiceAccessFailure = {
  path: string;
  status: number;
  code?: string;
};

function isPathInScope(pathname: string, scope: string): boolean {
  return pathname === scope || pathname.startsWith(`${scope}/`);
}

function normalizeBackendPath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  if (pathname === BACKEND_PROXY_PREFIX) return "/";
  if (pathname.startsWith(`${BACKEND_PROXY_PREFIX}/`)) {
    return pathname.slice(BACKEND_PROXY_PREFIX.length);
  }
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function isRecoveryApiPath(path: string): boolean {
  const pathname = normalizeBackendPath(path);
  return RECOVERY_API_SCOPES.some((scope) => isPathInScope(pathname, scope));
}

function isRecoveryPage(pathname: string): boolean {
  return RECOVERY_PAGE_SCOPES.some((scope) => isPathInScope(pathname, scope));
}

export function classifyAdminServiceAccessError(
  failure: AdminServiceAccessFailure,
): AdminServiceAccessErrorKind {
  if (failure.status === 401 || failure.code === "TOKEN_EXPIRED") return "none";
  if (failure.status <= 0 || failure.status >= 500) return "none";
  if (isRecoveryApiPath(failure.path)) return "none";

  if (
    failure.status === 402
    && failure.code === "TENANT_SERVICE_ACCESS_EXPIRED"
  ) return "redirect";
  if (failure.status !== 403) return "none";
  if (failure.code === "TENANT_SERVICE_READ_ONLY") return "readonly";
  if (failure.code === "TENANT_SERVICE_HARD_BLOCKED") return "redirect";
  if (failure.code === "TENANT_SERVICE_CAPABILITY_NOT_INCLUDED") {
    return "capability";
  }
  return "none";
}

let hasRedirectedAdminServiceAccess = false;

export function handleBrowserAdminServiceAccessError(
  failure: AdminServiceAccessFailure,
): AdminServiceAccessErrorKind {
  const kind = classifyAdminServiceAccessError(failure);
  if (
    kind === "redirect"
    && typeof window !== "undefined"
    && !hasRedirectedAdminServiceAccess
    && !isRecoveryPage(window.location.pathname)
  ) {
    hasRedirectedAdminServiceAccess = true;
    window.location.replace(SERVICE_ACCESS_PATH);
  }
  return kind;
}

export function resetAdminServiceAccessRedirectForTests(): void {
  hasRedirectedAdminServiceAccess = false;
}
