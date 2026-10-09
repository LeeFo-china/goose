import type { AdminSession } from "@/lib/backend";
import { ADMIN_SESSION_STORAGE_PREFIX } from "./admin-session-scope";

export type ActivityScreen = "customers" | "projects" | "dashboard" | "finance";
const DEDUP_INTERVAL_MS = 5 * 60 * 1000;
const ACTIVITY_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
});
const UUID_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const DETAIL_ROUTE = new RegExp(`^/(customers|projects)/${UUID_SEGMENT}$`, "i");
const FINANCE_ROUTES = new Set([
  "/finance", "/finance/reports", "/finance/reports/difference-sources", "/finance/diagnostics",
  "/finance/audits", "/finance/wechat-pay", "/finance/wechat-pay/orders",
  "/finance/wechat-pay/applyment", "/finance/ledger", "/finance/reconciliation", "/finance/receivables",
]);

export function getActivityScreen(pathname: string): ActivityScreen | null {
  if (pathname === "/dashboard") return "dashboard";
  if (FINANCE_ROUTES.has(pathname)) return "finance";
  if (pathname === "/customers" || DETAIL_ROUTE.test(pathname) && pathname.startsWith("/customers/")) return "customers";
  if (pathname === "/projects" || pathname === "/projects/health" || DETAIL_ROUTE.test(pathname) && pathname.startsWith("/projects/")) return "projects";
  return null;
}

const SCREEN_PERMISSION: Record<ActivityScreen, string> = {
  customers: "customer.read", projects: "project.read",
  dashboard: "dashboard.read", finance: "finance.reports.read",
};

export function getPermittedActivityScreen(
  pathname: string,
  permissions: AdminSession["permissions"],
): ActivityScreen | null {
  const screen = getActivityScreen(pathname);
  return screen && permissions.some(({ code }) => code === SCREEN_PERMISSION[screen]) ? screen : null;
}

export function getActivityStorageScope(session: AdminSession): string | null {
  if (session.is_platform_staff || session.is_platform_super_admin
    || session.roles.some((role) => role === "platform_admin" || role === "platform_staff")
    || !session.tenant?.id || !session.employee.id || !session.user_id) return null;
  return `${ADMIN_SESSION_STORAGE_PREFIX}tenant:${encodeURIComponent(session.tenant.id)}:user:${encodeURIComponent(session.user_id)}:employee:${encodeURIComponent(session.employee.id)}:activity-view`;
}

export function isActivityViewAcknowledged(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)
    || ("success" in payload && payload.success === false) || "error" in payload
    || !("data" in payload)) return false;
  const data = payload.data;
  return typeof data === "object" && data !== null && !Array.isArray(data)
    && "recorded" in data && typeof data.recorded === "boolean";
}

type ReporterOptions = {
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  now: () => number;
  send: (screen: ActivityScreen) => Promise<boolean>;
};

export function createActivityViewReporter({ storage, now, send }: ReporterOptions) {
  const inFlight = new Set<string>();
  const successful = new Map<string, number>();
  return async (scope: string, screen: ActivityScreen): Promise<void> => {
    const key = `${scope}:${screen}`;
    if (inFlight.has(key)) return;
    let previous = successful.get(key);
    try {
      const stored = storage?.getItem(key);
      const timestamp = Number(stored);
      if (stored != null && stored !== "" && Number.isFinite(timestamp) && timestamp <= now()) {
        previous = Math.max(previous ?? timestamp, timestamp);
      }
    } catch {
      // Storage may be disabled; keep the successful in-memory dedup for this tab.
    }
    const currentTime = now();
    // A visible resume after Beijing midnight must establish activity for the new day.
    if (previous != null && currentTime >= previous && currentTime - previous < DEDUP_INTERVAL_MS
      && ACTIVITY_DAY_FORMATTER.format(previous) === ACTIVITY_DAY_FORMATTER.format(currentTime)) return;
    inFlight.add(key);
    try {
      if (!await send(screen)) return;
      // A late response must not move the original view into the next activity day.
      successful.set(key, currentTime);
      try {
        storage?.setItem(key, String(currentTime));
      } catch {
        // Reporting succeeded; the memory fallback still prevents repeated events.
      }
    } catch {
      // Telemetry is nonblocking. Retry only when a new navigation/visibility event calls us.
    } finally {
      inFlight.delete(key);
    }
  };
}
