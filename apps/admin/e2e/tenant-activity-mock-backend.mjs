// Loopback-only synthetic fixtures; never connects to a database or external provider.
import { createServer } from "node:http";
import { personaNames, serviceAccessSummary, sessions } from "./service-access-mock-fixture.mjs";

let calls = [];
const summary = {
  status: "ready", collection_started_at: "2026-10-01T00:00:00Z",
  window_start: "2026-10-03", window_end: "2026-10-09", observed_days: 7,
  last_active_at: "2026-10-09T03:12:00Z", active_employee_count: 3,
  admin_active_employee_count: 2, mini_active_employee_count: 2, active_days: 5,
  admin_login_count: 8, mini_login_count: 9,
  business_actions: { customer_created: 1, follow_up_created: 2, project_created: 3, construction_log_created: 4, acceptance_handled: 5 },
};
const tenants = ["ready", "collecting", "unavailable", "missing"].map((status, index) => ({
  id: `11111111-1111-4111-8111-11111111111${index}`, name: `合成租户 · ${status}`, slug: status, status: "active",
  created_at: "2026-09-01T00:00:00Z", roles: [], usage: { employee_count: 6, customer_count: 4, project_count: 3, h5_page_count: 0, camera_count: 0 },
  ...(status === "missing" ? {} : { activity: { ...summary, status,
    ...(status === "collecting" ? { observed_days: 2, active_days: 2, collection_started_at: "2026-10-08T00:00:00Z" } : {}),
  } }),
}));
const paged = (list) => ({ list, pagination: { page: 1, pageSize: 20, total: list.length, totalPages: 1 } });
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://127.0.0.1:3997").pathname;
  const ok = (data) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ data, message: "success" })); };
  if (path === "/health") return ok({});
  if (path === "/__test/reset") { calls = []; return ok({}); }
  if (path === "/__test/state") return ok(calls);
  const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
  const persona = token === "platform" ? personaNames.platformAdmin : token === "staff" ? personaNames.platformStaff
    : token === "blocked" ? personaNames.hardBlocked : token === "grace" ? personaNames.graceTenant : personaNames.normalTenant;
  if (path === "/admin/auth/me") return ok({ ...sessions[persona],
    permissions: token === "no-permission" ? [] : ["customer.read", "project.read", "dashboard.read", "finance.reports.read"].map((code) => ({ code, scope: "all" })),
  });
  if (path === "/employee/service-access") return ok(serviceAccessSummary(persona));
  if (path === "/tenant-activity/view") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    calls.push(JSON.parse(Buffer.concat(chunks).toString()));
    return ok({ recorded: true });
  }
  if (path === "/platform/tenants") return ok(paged(tenants));
  if (path.match(/^\/platform\/tenants\/[^/]+$/)) return ok(tenants.find((tenant) => path.endsWith(tenant.id)));
  if (path.endsWith("/admins") || path === "/platform/tenant-service-areas") return ok(paged([]));
  if (path.startsWith("/platform/service-provider-publications/")) return ok(null);
  if (path === "/usage/overview" || path === "/platform/usage/overview") return ok(null);
  if (path.includes("notification")) return ok({ ...paged([]), unread_count: 0 });
  return ok(paged([]));
});
server.listen(3997, "127.0.0.1");
process.on("SIGTERM", () => server.close());
