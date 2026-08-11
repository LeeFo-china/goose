import {
  TENANT_SERVICE_ROUTE_ACCESS_VALUES,
  type PlatformServiceTrialCapability,
  type TenantServiceRouteAccess,
} from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import { resolveTenantServiceRouteCapability } from "@/services/tenant-service-capability-map";

export type TenantServiceRouteAccessRequest = {
  readonly method: string;
  readonly routeOptions?: {
    readonly url?: string;
    readonly config?: {
      readonly tenantServiceAccess?: unknown;
    };
  };
};

export interface TenantServiceRouteAccessResolution {
  access: TenantServiceRouteAccess;
  isMissing: boolean;
}

const ROUTE_ACCESS_VALUES = new Set<string>(
  TENANT_SERVICE_ROUTE_ACCESS_VALUES,
);

export function resolveTenantServiceRouteAccess(
  request: TenantServiceRouteAccessRequest,
): TenantServiceRouteAccessResolution {
  const configuredAccess = request.routeOptions?.config?.tenantServiceAccess;
  if (configuredAccess === undefined) {
    return {
      access: isReadMethod(request.method) ? "read" : "write",
      isMissing: true,
    };
  }

  if (!isTenantServiceRouteAccess(configuredAccess)) {
    throw Errors.business(
      500,
      "路由租户服务访问类别无效",
      "TENANT_SERVICE_ROUTE_ACCESS_INVALID",
    );
  }

  return { access: configuredAccess, isMissing: false };
}

export function getTenantServiceRouteAccess(
  request: TenantServiceRouteAccessRequest,
): TenantServiceRouteAccess {
  return resolveTenantServiceRouteAccess(request).access;
}

export function getTenantServiceAuthOptions(
  request: TenantServiceRouteAccessRequest,
): {
  tenantServiceAccess: TenantServiceRouteAccess;
  requiredCapability: PlatformServiceTrialCapability | null;
} {
  const tenantServiceAccess = getTenantServiceRouteAccess(request);
  const resolution = resolveTenantServiceRouteCapability({
    method: request.method,
    url: request.routeOptions?.url ?? "",
    access: tenantServiceAccess,
  });
  return {
    tenantServiceAccess,
    requiredCapability: resolution.kind === "capability"
      ? resolution.capability
      : null,
  };
}

function isTenantServiceRouteAccess(
  value: unknown,
): value is TenantServiceRouteAccess {
  return typeof value === "string" && ROUTE_ACCESS_VALUES.has(value);
}

function isReadMethod(method: string) {
  const normalizedMethod = method.toUpperCase();
  return normalizedMethod === "GET" || normalizedMethod === "HEAD";
}
