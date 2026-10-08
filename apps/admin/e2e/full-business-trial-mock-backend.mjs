// Synthetic loopback fixture: no database or billable provider access.
import { createServer } from "node:http";
const tenantId = "11111111-1111-4111-8111-111111111111";
const trialId = "22222222-2222-4222-8222-222222222222";
const core = ["core.projects", "core.customers", "core.employees", "core.workflows", "core.files", "core.notifications"];
const tenant = { id: tenantId, name: "合成范围验收租户", slug: "scope-fixture", status: "active", created_at: "2026-10-01T00:00:00Z" };
let options, trial, journal;
function reset(input = {}) {
  options = input; journal = [];
  trial = { id: trialId, tenant_id: tenantId, tenant, status: input.status || "active", persisted_status: input.status || "active",
    source: "platform_grant", trial_type: "standard", version: 7, scope: { version: 1, capabilities: [...core] },
    starts_at: "2026-10-01T00:00:00Z", trial_ends_at: "2026-10-31T00:00:00Z", grace_ends_at: "2026-11-07T00:00:00Z",
    extension_count: 2, assignee: null, assignee_employee_id: null, events: [] };
}
reset();
const json = (res, status, payload) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(payload)); };
const ok = (res, data) => json(res, 200, { success: true, data });
const fail = (res, status, message) => json(res, status, { success: false, message });
const actions = () => ({ update_scope: { enabled: !options.denied, disabled_reason: options.denied ? "无试用管理权限" : null },
  review: { enabled: true, disabled_reason: null } });
async function body(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString() || "{}"); }
const paged = (list) => ({ list, pagination: { page: 1, pageSize: 20, total: list.length, totalPages: 1 } });
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:3997");
  const path = url.pathname;
  if (path === "/health") return ok(res, {});
  if (path === "/__test/reset") { reset(await body(req)); return ok(res, {}); }
  if (path === "/__test/state") return ok(res, { journal, trial });
  if (path === "/admin/auth/me") return ok(res, { user_id: "synthetic", tenant: null, roles: ["platform_admin"],
    is_platform_staff: true, is_platform_super_admin: true, login_channel: "admin_web",
    employee: { id: "synthetic", name: "验收人员", status: "active" }, permissions: [] });
  if (path.includes("notification")) return ok(res, { ...paged([]), unread_count: 0 });
  if (req.method === "POST" && path === "/platform/tenants") { journal.push({ path, payload: await body(req) }); return ok(res, tenant); }
  if (path === "/platform/tenants") return ok(res, { ...paged([{ ...tenant, service_access: {
    mode: "trial", trial_id: trialId, trial_status: trial.status, version: 1,
    trial_ends_at: trial.trial_ends_at, grace_ends_at: trial.grace_ends_at, can_extend: false,
  } }]), trial_creation: { enabled: true, disabled_reason: null } });
  if (path === `/platform/billing/service-trials/${trialId}`) {
    if (options.loadFailure) { options.loadFailure = false; return fail(res, 503, "合成详情加载失败"); }
    return ok(res, { trial, available_actions: actions(), server_time: "2026-10-08T00:00:00Z" });
  }
  if (path === `/platform/billing/service-trials/${trialId}/scope` && req.method === "PUT") {
    const input = await body(req); journal.push({ path, payload: input });
    if (options.delay) await new Promise((resolve) => setTimeout(resolve, 800));
    if (options.failure) return fail(res, 503, "合成保存失败");
    if (options.conflict) { options.conflict = false; trial.version += 1; return fail(res, 409, "版本冲突"); }
    if (options.denied) return fail(res, 403, "无试用管理权限");
    if (input.expected_version !== trial.version) return fail(res, 409, "版本冲突");
    if (Object.keys(input).sort().join() !== ["scope", "expected_version", "idempotency_key", "reason"].sort().join()) return fail(res, 400, "命令字段错误");
    trial.scope = input.scope; trial.version += 1;
    const { tenant: _tenant, events: _events, ...snapshot } = trial;
    return ok(res, { trial: snapshot, idempotent: false, available_actions: actions(), server_time: "2026-10-08T00:00:00Z" });
  }
  if (path === "/platform/billing/service-trials/summary") return ok(res, { pending_review_count: 0, current_active_count: 1,
    expiring_within_7_days_count: 0, month_converted_count: 0, server_time: "2026-10-08T00:00:00Z" });
  if (path === "/platform/billing/service-trials/assignee-candidates") return ok(res, paged([]));
  if (path.endsWith("/follow-ups")) return ok(res, paged([]));
  if (path === "/platform/billing/service-trials") return ok(res, { ...paged([{ ...trial, available_actions: actions() }]), server_time: "2026-10-08T00:00:00Z" });
  if (path === "/platform/billing/service-trial-policy") return ok(res, { policy: { version: 1, trial_days: 30, grace_days: 7,
    reminder_days: [7, 3, 1], max_trial_days: 60, max_grace_days: 14, max_schedule_days: 30, max_extension_count: 3,
    max_extension_days: 30, reapply_cooldown_days: 30, allow_repeat: false, standard_scope: { version: 1, capabilities: core },
    guided_scope: { version: 1, capabilities: core } }, available_actions: { update_policy: { enabled: true, disabled_reason: null } } });
  return ok(res, paged([]));
}).listen(3997, "127.0.0.1");
