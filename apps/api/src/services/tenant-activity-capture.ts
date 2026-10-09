import type { JwtPayload } from "@/utils/jwt";
import { getTenantActivityEventKey } from "@/utils/tenant-activity-evidence";

export type ActivityChannel = "admin_web" | "wechat_mini";
export type BusinessActivityKind = "customer_created" | "follow_up_created" | "project_created"
  | "construction_log_created" | "acceptance_handled";
export type CapturedTenantActivity = { kind: "login"; token: string; eventKey?: string }
  | { kind: BusinessActivityKind; eventKey: string };
const LOGIN_ROUTES = new Set([
  "/admin/auth/login", "/auth/phone-login/verify", "/auth/phone-login/select", "/auth/verify-role",
]);
const BUSINESS_ROUTES: Record<string, BusinessActivityKind> = {
  "/customers": "customer_created",
  "/customers/:id/follow_ups": "follow_up_created",
  "/projects": "project_created",
  "/project-logs": "construction_log_created",
  "/project-acceptances/:id/submit": "acceptance_handled",
  "/project-acceptances/:id/approve": "acceptance_handled",
  "/project-acceptances/:id/reject": "acceptance_handled",
  "/project-acceptances/:id/rectification": "acceptance_handled",
};
export function isTenantActivityRoute(method: string, route: string): boolean {
  return method === "POST" && (LOGIN_ROUTES.has(route) || Object.hasOwn(BUSINESS_ROUTES, route));
}
export function classifyTenantActivityResponse(
  method: string, route: string, payload: unknown,
): CapturedTenantActivity | null {
  if (!isTenantActivityRoute(method, route)) return null;
  const root = asRecord(payload);
  if (root?.success === false || root?.error) return null;
  const data = asRecord(root?.data);
  if (!data) return null;
  const eventKey = getTenantActivityEventKey(data);
  if (LOGIN_ROUTES.has(route)) {
    const auth = asRecord(data.auth) ?? data;
    if (auth.is_platform_staff === true || auth.is_platform_admin === true
      || auth.mode && auth.mode !== "employee" && auth.mode !== "tenant_employee") return null;
    // Role names in admin response are business roles; the signed token is authoritative.
    return typeof auth.token === "string" && auth.token.length > 0
      ? { kind: "login", token: auth.token, ...(eventKey ? { eventKey } : {}) } : null;
  }
  const kind = BUSINESS_ROUTES[route];
  if (!kind || typeof data.id !== "string" || !UUID.test(data.id)) return null;
  if (kind === "acceptance_handled") {
    if (eventKey) return { kind, eventKey };
    // Rectification adds an action without changing the acceptance row's version.
    if (route.endsWith("/rectification")) return null;
    if (typeof data.status !== "string" || typeof data.updated_at !== "string") return null;
    return { kind, eventKey: `${kind}:${data.id}:${data.status}:${data.updated_at}` };
  }
  // Persisted resource ID makes client retries of the same write idempotent.
  return { kind, eventKey: `${kind}:${data.id}` };
}
export function resolveActivityChannel(user: JwtPayload | undefined): ActivityChannel | null {
  if (!user?.sub || !user.roles?.includes("employee") || user.customer_id
    || user.roles.some((role) => role === "platform_admin" || role === "partner")
    || user.token_type && user.token_type !== "auth") return null;
  if (user.login_channel === "admin_web") return "admin_web";
  if ((user.login_channel === "wechat" || !user.login_channel) && user.openid) return "wechat_mini";
  return null;
}
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
