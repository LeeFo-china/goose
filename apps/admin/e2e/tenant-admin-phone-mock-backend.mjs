// Synthetic loopback fixture only. No database, SMS provider or real user access.
import { createServer } from "node:http";

const tenantId = "11111111-1111-4111-8111-111111111111";
let options, admins, journal, challenges, results;
function reset(input = {}) {
  options = input;
  journal = [];
  challenges = new Map();
  results = new Map();
  admins = Array.from({ length: input.empty ? 0 : 21 }, (_, index) => ({
    id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
    name: `合成管理员${index + 1}`, phone_masked: "130****0001", status: "active", version: 7,
    has_login_binding: index % 2 === 0, can_change: index !== 1,
    disabled_reason: index === 1 ? "管理员已停用" : null,
  }));
}
reset();
const json = (res, status, payload) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(payload)); };
const ok = (res, data) => json(res, 200, { success: true, data });
const fail = (res, status, message) => json(res, status, { success: false, message });
async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}
function paged(list, url) {
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = Math.min(100, Number(url.searchParams.get("pageSize") || 20));
  return { list: list.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total: list.length, totalPages: Math.ceil(list.length / pageSize) } };
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1:3996");
    const path = url.pathname;
    if (path === "/health") return ok(res, {});
    if (path === "/__test/reset") { reset(await body(req)); return ok(res, {}); }
    if (path === "/__test/state") return ok(res, { admins, journal });
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!["manage", "read"].includes(token)) return fail(res, 401, "未登录");
    if (path === "/admin/auth/me") return ok(res, {
      user_id: "synthetic-platform-admin", login_channel: "admin_web", tenant: null,
      roles: ["platform_admin"], is_platform_staff: true, is_platform_super_admin: token === "manage",
      employee: { id: "33333333-3333-4333-8333-333333333333", name: "合成平台人员", status: "active",
        tenant_department_id: null, department_name: null, post_id: null, post_name: null, avatar: null },
      permissions: [{ code: "platform.tenant.read", scope: "all" }],
    });
    if (path.includes("notification")) return ok(res, { ...paged([], url), unread_count: 0 });
    if (path === `/platform/tenants/${tenantId}`) return ok(res, {
      id: tenantId, name: "合成换号验收租户", slug: "synthetic-phone-change", status: "active", roles: [],
      initialization: { admin_employee: { id: "initial-admin", name: "初始化管理员（历史）", phone: "130****0099", status: "active" },
        admin_role: { name: "初始角色" }, template_code: "fixture", template_version: "1" },
    });
    if (path === "/platform/tenant-service-areas") return ok(res, paged([], url));
    if (path.startsWith("/platform/service-provider-publications/")) return ok(res, null);
    if (path === `/platform/tenants/${tenantId}/admins`) {
      if (options.listFailure) { options.listFailure = false; return fail(res, 503, "合成列表加载失败"); }
      journal.push({ path, query: url.search });
      return ok(res, paged(admins.map((admin) => ({ ...admin,
        can_change: token === "manage" && admin.can_change,
        disabled_reason: token === "read" ? "仅平台超管可变更" : admin.disabled_reason,
      })), url));
    }
    const match = path.match(/\/admins\/([^/]+)\/phone-change\/(send-code|confirm)$/);
    if (match && req.method === "POST") {
      const input = await body(req);
      journal.push({ path, payload: input });
      const admin = admins.find((item) => item.id === match[1]);
      if (token !== "manage" || !admin?.can_change) return fail(res, 403, "无权变更");
      if (options.delay) await new Promise((resolve) => setTimeout(resolve, 700));
      if (match[2] === "send-code") {
        const challenge = { challenge_id: `synthetic-challenge-${challenges.size + 1}`,
          expires_at: new Date(Date.now() + 300_000).toISOString(), cooldown_seconds: options.cooldown ?? 60 };
        challenges.set(challenge.challenge_id, input);
        return ok(res, challenge);
      }
      if (results.has(input.idempotency_key)) return ok(res, { ...results.get(input.idempotency_key), idempotent: true });
      if (options.conflict) { options.conflict = false; admin.version += 1; return fail(res, 409, "管理员版本已变化"); }
      if (input.expected_version !== admin.version) return fail(res, 409, "版本冲突");
      const challenge = challenges.get(input.challenge_id);
      if (!challenge || challenge.new_phone !== input.new_phone) return fail(res, 409, "请重新发送验证码");
      if (input.code !== "123456") return fail(res, 400, "验证码错误");
      if (!input.reason?.trim() || input.reason.length > 500 || input.same_person_confirmed !== true) return fail(res, 400, "请核实身份和原因");
      admin.phone_masked = `${input.new_phone.slice(0, 3)}****${input.new_phone.slice(-4)}`;
      admin.version += 1;
      const result = { employee_id: admin.id, phone_masked: admin.phone_masked, version: admin.version,
        changed_at: new Date().toISOString(), idempotent: false };
      results.set(input.idempotency_key, result);
      if (options.unknown) { options.unknown = false; return fail(res, 503, "合成响应中断，结果未知"); }
      return ok(res, result);
    }
    return fail(res, 404, "合成接口不存在");
  } catch {
    return fail(res, 500, "合成请求格式错误");
  }
});
server.listen(3996, "127.0.0.1");
process.on("SIGTERM", () => server.close());
