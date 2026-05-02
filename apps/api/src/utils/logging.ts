import type { FastifyRequest } from "fastify";

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

  return {
    requestId: request.id,
    method: request.method,
    path: getLogPath(request.url),
    route: request.routeOptions?.url ?? null,
    queryKeys: getLogQueryKeys(request.url),
    authUserId: authContext?.authUserId || request.user?.sub || null,
    employeeId: authContext?.employeeId || null,
    roleCodes: authContext?.roleCodes || request.user?.roles || [],
    remoteAddress: request.ip,
  };
}
