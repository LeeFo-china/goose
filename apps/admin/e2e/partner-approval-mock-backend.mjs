// Loopback-only fixture: no real accounts, database access or production writes.
import { createServer } from 'node:http';

const partnerId = '11111111-1111-4111-8111-111111111111';
const level = { id: '22222222-2222-4222-8222-222222222222', code: 'verified', name: '认证合伙人',
  status: 'active', tenant_recharge_commission_bps: 100, lead_service_fee_commission_bps: 100,
  lead_service_fee_default_rate_bps: 250, settlement_cycle: 'monthly', settlement_method: 'manual', sort_order: 1 };
const region = { adcode: '411525', name: '固始县', full_name: '河南省 信阳市 固始县', level: 'district', parent_adcode: '411500' };
let options, partner, journal;
function reset(input = {}) {
  options = input;
  journal = [];
  partner = { id: partnerId, name: '审核验收合伙人', subject_type: 'personal', contact_name: '验收联系人',
    phone: '13000000001', status: input.status || 'pending', level_id: level.id, level,
    region_codes: input.noRegion ? [] : [region.adcode], region_version: 1,
    contract_status: 'pending', settlement_account_status: 'pending', settlement_account: {},
    remark: '创建时备注', created_at: '2026-09-06T00:00:00Z', updated_at: '2026-09-06T00:00:00Z' };
}
reset();
function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}
const ok = (res, data) => json(res, 200, { success: true, data });
const fail = (res, status, code, message) => json(res, status, { success: false, code, message });
async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
function paged(records, url) {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || 20)));
  return { list: records.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total: records.length, totalPages: Math.ceil(records.length / pageSize) } };
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:3989');
    const path = url.pathname;
    if (path === '/health') return ok(res, {});
    if (path === '/__test/reset') { reset(await body(req)); return ok(res, {}); }
    if (path === '/__test/state') return ok(res, { partner, journal });
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!['manage', 'read'].includes(token)) return fail(res, 401, 'UNAUTHORIZED', '未登录');
    if (path === '/admin/auth/me') return ok(res, {
      user_id: 'partner-approval-smoke', login_channel: 'admin_web', tenant: null, roles: ['platform_admin'],
      employee: { id: '33333333-3333-4333-8333-333333333333', name: '审核验收员', status: 'active',
        tenant_department_id: null, department_name: null, post_id: null, post_name: null, avatar: null },
      permissions: (token === 'manage' ? ['platform.partner.read', 'platform.partner.manage'] : ['platform.partner.read'])
        .map((code) => ({ code, scope: 'all' })),
    });
    if (path.includes('notification')) return ok(res, { ...paged([], url), unread_count: 0 });
    if (path === '/platform/partners/levels') return ok(res, [level]);
    if (path === '/platform/administrative-areas') return ok(res, paged([region], url));
    if (path === '/platform/partners') {
      const status = url.searchParams.get('status');
      return ok(res, paged(!status || status === partner.status ? [partner] : [], url));
    }
    if (path === `/platform/partners/${partnerId}` && req.method === 'GET') return ok(res, partner);
    if (path === `/platform/partners/${partnerId}/status` && req.method === 'PATCH') {
      const payload = await body(req);
      journal.push({ path, payload });
      if (options.delay) await new Promise((resolve) => setTimeout(resolve, 350));
      if (token !== 'manage' || options.forbidden) return fail(res, 403, 'FORBIDDEN', '缺少合伙人管理权限');
      if (options.conflict) return fail(res, 409, 'PLATFORM_PARTNER_REGION_CONFLICT', '该区县已有启用的合伙人');
      if (payload.status !== 'active' || typeof payload.reason !== 'string' || !payload.reason.trim() || payload.reason.trim().length > 300) {
        return fail(res, 400, 'VALIDATION_ERROR', '审核说明需为 1–300 字');
      }
      partner.status = 'active';
      partner.remark = payload.reason;
      return ok(res, partner);
    }
    return fail(res, 404, 'NOT_FOUND', path);
  } catch {
    return fail(res, 500, 'MOCK_ERROR', '验收请求格式错误');
  }
});
server.listen(3989, '127.0.0.1');
process.on('SIGTERM', () => server.close());
