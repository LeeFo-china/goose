import { clearAdminSessionScopedStorage } from "@/components/layout/admin-session-scope";

const SESSION_EXPIRED_LOGIN_PATH = "/login?reason=session_expired";

export type AdminAuthenticationFailure = {
  status: number;
  code?: string;
};

type SessionStorage = Pick<Storage, "key" | "length" | "removeItem">;

export function isAdminAuthenticationFailure(failure: AdminAuthenticationFailure) {
  return failure.status === 401;
}

export function createAdminSessionExpiryHandler(input: {
  storage: SessionStorage | null;
  replace: (url: string) => void;
}) {
  let hasRedirected = false;

  return (failure: AdminAuthenticationFailure) => {
    if (!isAdminAuthenticationFailure(failure)) return false;

    clearAdminSessionScopedStorage(input.storage);
    if (!hasRedirected) {
      hasRedirected = true;
      input.replace(SESSION_EXPIRED_LOGIN_PATH);
    }
    return true;
  };
}

let browserSessionExpiryHandler: ReturnType<typeof createAdminSessionExpiryHandler> | null = null;

export function handleBrowserAdminSessionExpiry(failure: AdminAuthenticationFailure) {
  if (typeof window === "undefined") return false;

  if (!browserSessionExpiryHandler) {
    let storage: SessionStorage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    browserSessionExpiryHandler = createAdminSessionExpiryHandler({
      storage,
      replace: (url) => window.location.replace(url),
    });
  }

  return browserSessionExpiryHandler(failure);
}
