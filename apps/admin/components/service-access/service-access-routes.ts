import type { TenantServiceAccessLoadResult } from "@/lib/tenant-service-access";

const SERVICE_RECOVERY_ROUTE_PREFIXES = [
  "/service-access",
  "/billing",
] as const;

export type ServiceAccessView =
  | "workspace"
  | "readonly"
  | "recovery"
  | "replace"
  | "unavailable";

export function isServiceRecoveryRoute(pathname: string): boolean {
  return SERVICE_RECOVERY_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isServiceStatusRoute(pathname: string): boolean {
  return pathname === "/service-access"
    || pathname.startsWith("/service-access/");
}

export function decideServiceAccessView(
  loadResult: TenantServiceAccessLoadResult,
  pathname: string,
): ServiceAccessView {
  if (loadResult.kind === "bypass") return "workspace";
  if (loadResult.kind === "unavailable") return "unavailable";
  if (loadResult.summary.accessStatus === "workspace_available") {
    return "workspace";
  }
  if (loadResult.summary.accessStatus === "grace_period") return "readonly";
  if (loadResult.summary.accessStatus === "hard_blocked") {
    return isServiceStatusRoute(pathname) ? "recovery" : "replace";
  }
  return isServiceRecoveryRoute(pathname) ? "recovery" : "replace";
}
