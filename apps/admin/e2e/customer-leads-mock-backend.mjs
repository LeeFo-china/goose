// Loopback-only UI fixture. No Supabase or real API writes occur in this smoke.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { currentServiceAccessSummary } from './supplier-catalog-mock-fixture.mjs';
import {
  CustomerLeadAssignSchema, CustomerLeadFollowUpSchema,
  CustomerLeadConvertSchema, CustomerLeadMarkInvalidSchema,
} from '../../../packages/domain/dist/index.js';

const examples = JSON.parse(readFileSync(new URL('../../../docs/customer-leads-api-examples.json', import.meta.url), 'utf8'));
const leadId = examples.detail.response.data.id;
const employeeId = examples.assign.body.assigned_employee_id;
let detail;
let options;
let journal;
let reads;
let refreshFailed;
function reset(input = {}) {
  options = input;
  detail = structuredClone(examples.detail.response.data);
  if (input.h5) {
    detail.source = 'h5';
    detail.source_label = 'H5活动';
    detail.source_context = { demand: '需要设计', attribution: {}, budget: null, ai: null,
      h5: { page_id: leadId, page_version_id: null, page_title: '秋季装修活动', page_slug: 'autumn' } };
  }
  detail.actions.convert = { enabled: true, reason: null };
  journal = [];
  reads = [];
  refreshFailed = false;
}
reset();
const json = (res, code, data) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
};
const ok = (res, data) => json(res, 200, { message: 'success', data });
const fail = (res, status, code, message) => json(res, status, { success: false, code, message, requestId: 'ui-smoke' });
async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
function session(token) {
  const resource = token === 'legacy' ? 'douyin_lead' : 'customer_lead';
  return {
    user_id: 'customer-lead-ui-smoke', login_channel: 'admin_web',
    employee: { id: employeeId, name: '示例员工', status: 'active', avatar: null,
      tenant_department_id: null, department_name: '客服部', post_id: null, post_name: '客服' },
    tenant: { id: '99999999-9999-4999-8999-999999999999', name: '线索验收租户', slug: 'lead-smoke', status: 'active' },
    roles: ['staff'], permissions: token === 'none' ? []
      : ['read', 'assign', 'follow_up', 'convert'].map((action) => ({ code: `${resource}.${action}`, scope: 'all' })),
  };
}
function page(records, url) {
  const current = Number(url.searchParams.get('page') || 1);
  const pageSize = Number(url.searchParams.get('pageSize') || 20);
  return { list: records.slice((current - 1) * pageSize, current * pageSize),
    pagination: { page: current, pageSize, total: records.length, totalPages: Math.ceil(records.length / pageSize) } };
}
function legacyRow(row) {
  const { id, name, phone_masked, community, status, version, created_at, followed_at, follow_remark, assignee } = row;
  return { id, name, phone_masked, community, status, version, created_at, followed_at, follow_remark, assignee,
    customer: null, latest_appointment: null };
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:3988');
    const path = url.pathname;
    if (path === '/health') return ok(res, {});
    if (path === '/__test/reset') { reset(await body(req)); return ok(res, {}); }
    if (path === '/__test/state') return ok(res, { journal, reads });
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!['generic', 'legacy', 'none'].includes(token)) return fail(res, 401, 'UNAUTHORIZED', '未登录');
    if (path === '/admin/auth/me') return ok(res, session(token));
    if (path === '/employee/service-access') return ok(res, currentServiceAccessSummary());
    if (path.includes('notification')) return ok(res, { list: [], unread_count: 0, pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    const legacy = path.startsWith('/tenant/douyin-miniapp/leads');
    const prefix = legacy ? '/tenant/douyin-miniapp/leads' : '/tenant/customer-leads';
    if (!path.startsWith(prefix)) return fail(res, 404, 'ROUTE_NOT_FOUND', path);
    if (token === 'none' || (legacy ? token !== 'legacy' : token !== 'generic')) return fail(res, 403, 'FORBIDDEN', '无权限');
    if (req.method === 'GET') reads.push(path + url.search);
    if (path.endsWith('/assignee-candidates') || path.endsWith('/assignee-filter-options')) {
      return ok(res, page(examples.assignee_candidates.response.data.list, url));
    }
    if (req.method === 'GET' && path === prefix) {
      if (options.failRefresh && journal.length && !refreshFailed) {
        refreshFailed = true;
        return fail(res, 503, 'UNAVAILABLE', '列表刷新暂时失败');
      }
      const rows = Array.from({ length: 21 }, (_, i) => ({ ...detail,
        ...(options.h5 && i % 2 === 1 ? { source: 'douyin_miniapp', source_label: '抖音小程序' } : {}),
        id: i ? `11111111-1111-4111-8111-${String(i).padStart(12, '0')}` : leadId,
        name: i ? `分页示例${i}` : detail.name,
      })).map(({ source_context, latest_appointment, appointments, follow_ups, actions, ...row }) => row);
      const keyword = url.searchParams.get('keyword') || '';
      const assignment = url.searchParams.get('assignment');
      const status = url.searchParams.get('status');
      const source = url.searchParams.get('source');
      const filtered = rows.filter((row) => row.name.includes(keyword)
        && (!source || row.source === source)
        && (!status || row.status === status)
        && (assignment !== 'assigned' || row.assigned_employee_id !== null)
        && (assignment !== 'unassigned' || row.assigned_employee_id === null));
      return ok(res, page(legacy ? filtered.map(legacyRow) : filtered, url));
    }
    if (req.method === 'GET' && path === `${prefix}/${leadId}`) {
      if (options.loseAccess && journal.some((entry) => entry.path.endsWith('/assign'))) return fail(res, 404, 'CUSTOMER_LEAD_NOT_FOUND', '客户线索不存在');
      return ok(res, legacy ? { ...legacyRow(detail), ...detail.source_context,
        appointments: { ...detail.appointments, truncated: false }, follow_ups: detail.follow_ups } : detail);
    }
    if (req.method === 'GET' && path.endsWith('/appointments')) return ok(res, page(detail.appointments.list, url));
    if (req.method === 'GET' && path.endsWith('/follow-ups')) return ok(res, page(detail.follow_ups.list, url));
    if (req.method === 'POST') {
      const payload = await body(req);
      const action = path.split('/').at(-1);
      const schemas = { assign: CustomerLeadAssignSchema, 'follow-ups': CustomerLeadFollowUpSchema,
        'convert-customer': CustomerLeadConvertSchema, 'mark-invalid': CustomerLeadMarkInvalidSchema };
      if (!schemas[action]?.safeParse(payload).success) return fail(res, 400, 'VALIDATION_ERROR', '命令格式无效');
      if (options.conflict) return fail(res, 409, 'CUSTOMER_LEAD_VERSION_CONFLICT', '线索已更新，请刷新后重试');
      if (payload.expected_lead_version !== detail.version) return fail(res, 409, 'CUSTOMER_LEAD_VERSION_CONFLICT', '线索已更新，请刷新后重试');
      journal.push({ path, payload });
      detail.version += 1;
      let result;
      if (action === 'follow-ups') {
        detail.status = 'contacted';
        detail.follow_ups.list.unshift({ ...examples.follow_ups.response.data.list[0], summary: payload.summary, result: payload.result });
        detail.follow_ups.pagination = { page: 1, pageSize: 20, total: detail.follow_ups.list.length, totalPages: 1 };
        result = examples.ordinary_follow_up.response.data;
      } else if (action === 'assign') {
        detail.assigned_employee_id = employeeId;
        detail.assignee = { name: '示例员工', avatar: null, status: 'active' };
        result = examples.assign.response.data;
      } else if (action === 'convert-customer') {
        detail.status = 'converted';
        result = examples.convert_existing_hidden.response.data;
      } else {
        detail.status = 'invalid';
        result = examples.mark_invalid.response.data;
      }
      return ok(res, { ...result, lead_version: detail.version });
    }
    return fail(res, 404, 'ROUTE_NOT_FOUND', path);
  } catch {
    return fail(res, 500, 'MOCK_ERROR', 'UI fixture 无法处理请求');
  }
});
server.listen(3988, '127.0.0.1');
process.on('SIGTERM', () => server.close());
