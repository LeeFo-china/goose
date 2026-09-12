import type { FastifyRequest } from "fastify";

export function isAiSecretSettingsRequest(url: string): boolean {
  return /^\/platform\/ai-config\/secret-settings(?:[/?]|$)/.test(url);
}

export function getLogPath(url: string) {
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return url.split("?")[0] || url;
  }
}

export function getLogQueryKeys(url: string) {
  try {
    return Array.from(
      new Set(new URL(url, "http://localhost").searchParams.keys()),
    ).sort();
  } catch {
    return [];
  }
}

export function getRequestLogContext(request: FastifyRequest) {
  const authContext = request.authContext;
  const isSecretRequest = isAiSecretSettingsRequest(request.url);

  return {
    requestId: request.id,
    method: request.method,
    path: isSecretRequest ? "/platform/ai-config/secret-settings/:key" : getLogPath(request.url),
    route: request.routeOptions?.url ?? null,
    queryKeys: isSecretRequest ? [] : getLogQueryKeys(request.url),
    authUserId: authContext?.authUserId || request.user?.sub || null,
    employeeId: authContext?.employeeId || null,
    roleCodes: authContext?.roleCodes || request.user?.roles || [],
    remoteAddress: request.ip,
  };
}
