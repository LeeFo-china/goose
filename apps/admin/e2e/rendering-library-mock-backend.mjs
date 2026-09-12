import { createServer } from 'node:http';
import { employeeId, fileId, initialStyles, serviceAccess, sessionFor, styleId, tenantId } from './rendering-library-mock-fixture.mjs';

let rows = initialStyles();
let events = [];
let options = {};
let uploads = 100;
let nextStyle = 1000;
let publishedSnapshots = new Map();
let publishKeys = new Map();
const prefix = '/tenant/rendering-library';
function send(response, status, data, code) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
  response.end(JSON.stringify(code ? { success: false, code, message: data } : { success: true, data }));
}
async function read(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 11 * 1024 * 1024) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function preview(id) {
  return { file_id: id, url: `https://rendering-preview.example.test/${id}.webp?v=${Date.now()}`,
    expires_at: new Date(Date.now() + 120000).toISOString() };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1:3988');
  const path = url.pathname;
  if (path === '/health') return send(response, 200, {});
  if (path === '/__test/reset') { rows = initialStyles(); events = []; options = {}; uploads = 100; nextStyle = 1000; publishedSnapshots = new Map(); publishKeys = new Map(); return send(response, 200, {}); }
  if (path === '/__test/options') { options = { ...options, ...JSON.parse((await read(request))?.toString() || '{}') }; return send(response, 200, {}); }
  if (path === '/__test/events') return send(response, 200, events);
  if (path === '/__test/snapshots') return send(response, 200, Object.fromEntries(publishedSnapshots));
  if (path === '/admin/auth/me') return send(response, 200, sessionFor(request.headers.authorization || ''));
  if (path === '/employee/service-access') return send(response, 200, serviceAccess);
  if (path === '/notifications/summary') return send(response, 200, { unread_count: 0 });
  if (path === '/notifications') return send(response, 200, { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  if (!path.startsWith(prefix + '/')) return send(response, 404, '测试路由不存在', 'NOT_FOUND');
  const token = request.headers.authorization || '';
  if (token.includes('denied')) return send(response, 403, '无权访问装修效果库', 'FORBIDDEN');
  const body = request.method === 'GET' ? null : await read(request);
  const input = request.headers['content-type']?.includes('application/json') ? JSON.parse(body?.toString() || '{}') : null;
  events.push({ method: request.method, path, query: url.search, input });
  if (path === `${prefix}/styles` && request.method === 'GET') {
    if (options.list_failure) return send(response, 503, '素材列表暂不可用', 'RENDERING_UNAVAILABLE');
    const page = Number(url.searchParams.get('page') || 1);
    const pageSize = Number(url.searchParams.get('pageSize') || 20);
    if (page < 1 || pageSize < 1 || pageSize > 100) return send(response, 400, '无效分页', 'BAD_REQUEST');
    const filtered = (options.empty ? [] : rows).filter((row) => ['space', 'style', 'status'].every((key) => !url.searchParams.get(key) || url.searchParams.get(key) === row[key]));
    return send(response, 200, { list: filtered.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, total: filtered.length, totalPages: Math.ceil(filtered.length / pageSize) } });
  }
  if (path === `${prefix}/files/previews`) {
    if (options.preview_failure) return send(response, 503, '预览暂不可用', 'RENDERING_STORAGE_UNAVAILABLE');
    return send(response, 200, { items: input.file_ids.map(preview) });
  }
  if (request.method === 'GET' && /\/files\/[^/]+\/preview$/.test(path)) return send(response, 200, preview(path.split('/').at(-2)));
  if (token.includes('viewer') && request.method !== 'GET') return send(response, 403, '无权管理素材', 'FORBIDDEN');
  if (path === `${prefix}/files` && request.method === 'POST') {
    uploads += 1;
    return send(response, 200, { file_id: fileId(uploads), mime_type: 'image/webp', size_bytes: 500, width: 800, height: 600 });
  }
  if (path === `${prefix}/styles` && request.method === 'POST') {
    if (options.fail_create_title && input.title.includes(options.fail_create_title)) {
      options.fail_create_title = null;
      return send(response, 500, '保存素材资料失败', 'DB_ERROR');
    }
    if (rows.some((row) => row.file_id === input.file_id)) return send(response, 409, '该原图已用于装修效果素材', 'RENDERING_STYLE_FILE_USED');
    const row = { ...initialStyles()[0], ...input, id: styleId(++nextStyle), tenant_id: tenantId, created_by_employee_id: employeeId, version: 1, status: 'draft' };
    rows.unshift(row);
    return send(response, 200, row);
  }
  const match = path.match(/^\/tenant\/rendering-library\/styles\/([^/]+)(\/(?:hide|publish))?$/);
  if (match) {
    if (options.delete_next) { options.delete_next = false; rows = rows.filter((entry) => entry.id !== match[1]); }
    const row = rows.find((entry) => entry.id === match[1]);
    if (!row) return send(response, 404, '素材不存在', 'NOT_FOUND');
    if (request.method === 'GET') return send(response, 200, row);
    if (options.conflict_next) { options.conflict_next = false; row.version += 1; row.title = '其他员工已修改的素材'; }
    if (match[2] === '/publish') {
      if (options.idempotency_conflict_next) { options.idempotency_conflict_next = false;
        return send(response, 409, '测试幂等键冲突', 'RENDERING_STYLE_PUBLISH_IDEMPOTENCY_CONFLICT'); }
      const prior = publishKeys.get(input.idempotency_key);
      if (prior && (prior.styleId !== row.id || prior.expectedVersion !== input.expected_version))
        return send(response, 409, '发布幂等键已用于其他请求', 'RENDERING_STYLE_PUBLISH_IDEMPOTENCY_CONFLICT');
      if (prior) return send(response, 200, row);
      if (input.responsibility_confirmed !== true) return send(response, 400, '请确认发布责任', 'BAD_REQUEST');
      if (input.expected_version !== row.version) return send(response, 409, '素材已被其他人修改，请刷新后重试', 'RENDERING_STYLE_VERSION_CONFLICT');
      if (options.fail_publish_next) { options.fail_publish_next = false; return send(response, 503, '发布结果尚未确认', 'RENDERING_STORAGE_UNAVAILABLE'); }
      const snapshot = { title: row.title, space: row.space, style: row.style, source_type: row.source_type,
        color_notes: row.color_notes, material_notes: row.material_notes, file_id: row.file_id, version: row.version + 1 };
      publishedSnapshots.set(row.id, snapshot);
      publishKeys.set(input.idempotency_key, { styleId: row.id, expectedVersion: input.expected_version });
      Object.assign(row, { status: 'published', published_version: row.version + 1,
        published_at: new Date().toISOString(), published_by_employee_id: employeeId, version: row.version + 1 });
      return send(response, 200, row);
    }
    if (input.expected_version !== row.version) return send(response, 409, '素材已被其他人修改，请刷新后重试', 'RENDERING_STYLE_VERSION_CONFLICT');
    if (request.method === 'DELETE') { rows = rows.filter((entry) => entry.id !== row.id); return send(response, 200, { id: row.id, deleted: true }); }
    const { expected_version, ...changes } = input;
    Object.assign(row, match[2] ? { status: 'hidden' } : changes, { version: row.version + 1 });
    return send(response, 200, row);
  }
  return send(response, 404, '测试路由不存在', 'NOT_FOUND');
});
server.listen(3988, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
