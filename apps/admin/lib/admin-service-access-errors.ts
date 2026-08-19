const BACKEND_PROXY_PREFIX = "/api/backend";
const NEXT_PATH_DELIMITER_PATTERN = /[/#?]|%(?:2f|23|3f|5c)/gi;
const PATH_NORMALIZATION_ORIGIN = "http://admin.invalid";
const SERVICE_ACCESS_PATH = "/service-access";

const RECOVERY_API_EXACT_PATHS = [
  "/employee/service-access",
  "/employee/service-access/purchase-link",
] as const;

const RECOVERY_API_SCOPES = ["/billing"] as const;

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

function parseInternalUrl(path: string): URL | null {
  try {
    const url = new URL(path, PATH_NORMALIZATION_ORIGIN);
    return url.origin === PATH_NORMALIZATION_ORIGIN ? url : null;
  } catch {
    return null;
  }
}

function decodeNextPathParameters(pathname: string): string | null {
  try {
    return pathname.split("/").map((segment) => (
      decodeURIComponent(segment).replace(
        NEXT_PATH_DELIMITER_PATTERN,
        (delimiter) => encodeURIComponent(delimiter),
      )
    )).join("/");
  } catch {
    return null;
  }
}

function normalizeBackendPath(path: string): string | null {
  const sourceUrl = parseInternalUrl(path);
  if (!sourceUrl) return null;
  const decodedPathname = decodeNextPathParameters(sourceUrl.pathname);
  if (!decodedPathname) return null;
  const backendUrl = parseInternalUrl(decodedPathname);
  if (!backendUrl) return null;

  const { pathname } = backendUrl;
  if (pathname === BACKEND_PROXY_PREFIX) return "/";
  if (pathname.startsWith(`${BACKEND_PROXY_PREFIX}/`)) {
    return pathname.slice(BACKEND_PROXY_PREFIX.length);
  }
  return pathname;
}

function isRecoveryApiPath(path: string): boolean {
  const pathname = normalizeBackendPath(path);
  if (!pathname) return false;
  return RECOVERY_API_EXACT_PATHS.some((recoveryPath) => (
    pathname === recoveryPath
  )) || RECOVERY_API_SCOPES.some((scope) => isPathInScope(pathname, scope));
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
