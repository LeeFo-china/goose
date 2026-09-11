import { createServer } from 'node:http';

// Local synthetic fixtures only. No real provider requests or persisted credentials.
const id = '10000000-0000-4000-8000-000000000001';
const initial = () => ({ id, code: 'ark', name: '方舟测试', provider_type: 'openai_compatible',
  endpoint_url: 'https://ark.example.test/api/v3', api_key_setting_key: 'ARK_API_KEY',
  status: 'active', sort_order: 0, version: 1, created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z' });
let provider = initial();
let options = {};
let configured = false;
let writes = [];
let deleted = false;
const providerList = () => options.paginated
  ? [...Array.from({ length: 20 }, (_, index) => ({ ...initial(), id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name: `保留供应商 ${index + 1}`, code: `retained_${index + 1}` })), ...(deleted ? [] : [provider])]
  : deleted ? [] : [provider];
const page = (list) => ({ list, pagination: { page: 1, pageSize: 20, total: list.length, totalPages: list.length ? 1 : 0 } });
const send = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'private, no-store' });
  res.end(JSON.stringify(status < 400 ? { success: true, data } : { success: false, code: 'TEST_REJECTED', message: '测试请求失败' }));
};
async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:3989');
  const path = url.pathname;
  if (path === '/health') return send(res, 200, {});
  if (path === '/__test/reset') { provider = initial(); options = {}; configured = false; writes = []; deleted = false; return send(res, 200, {}); }
  if (path === '/__test/options') { options = { ...options, ...await body(req) }; return send(res, 200, {}); }
  if (path === '/__test/writes') return send(res, 200, writes);
  if (path === '/admin/auth/me') return send(res, 200, {
    user_id: id, login_channel: 'admin_web', tenant: null,
    employee: { id: null, name: '密钥测试超管', status: 'active', tenant_department_id: null, department_name: null, post_id: null, post_name: null, avatar: null },
    roles: ['platform_admin'], is_platform_staff: true, is_platform_super_admin: !options.readonly_delete,
    permissions: ['platform.ai_config.read', ...(options.readonly_delete ? [] : ['platform.ai_config.manage']), 'platform.system_setting.read', 'platform.system_setting.manage'].map((code) => ({ code, scope: 'all' })),
  });
  if (path === '/notifications/summary') return send(res, 200, { unread_count: 0 });
  if (path === '/platform/payment/wechat-pay/profiles') return send(res, 200, { can_manage: false, profiles: [], error: null });
  if (path === '/admin/system-settings') {
    const setting = (key, name, group_code) => ({ key, name, group_code, description: null, value_type: 'string', stored_value: '******', effective_value: '******', source: 'database', effective_scope: 'platform', can_override_by_tenant: false, is_configured: true, is_secret: true, status: 'active', updated_at: '2026-09-11T00:00:00Z' });
    const ai = setting('ARK_API_KEY', '火山方舟接口密钥', 'ai');
    const sms = setting('SMS_TEST_SECRET', '短信测试密钥', 'sms');
    return send(res, 200, { list: [ai, sms], groups: { ai: [ai], sms: [sms] } });
  }
  if (path.startsWith('/admin/system-settings/') && req.method === 'PATCH') {
    const input = await body(req); writes.push({ path, cleared: input.value === null });
    return send(res, 200, {});
  }
  if (path === '/platform/ai-config') return send(res, 200, { counts: { providers: providerList().length, models: 0, routes: 0 } });
  if (path === '/platform/ai-config/routes') return send(res, 200, page([]));
  if (path === '/platform/ai-config/providers') {
    if (deleted && options.refresh_failure) return send(res, 503, null);
    const list = providerList();
    const current = Number(url.searchParams.get('page') || 1);
    const size = Number(url.searchParams.get('pageSize') || 20);
    return send(res, 200, { list: list.slice((current - 1) * size, current * size), pagination: { page: current, pageSize: size, total: list.length, totalPages: Math.ceil(list.length / size) } });
  }
  if (path === `/platform/ai-config/providers/${id}`) {
    const input = await body(req); writes.push({ path, input });
    if (req.method === 'DELETE') {
      if (options.delete_delay) await new Promise((resolve) => setTimeout(resolve, 800));
      if (options.delete_error || input.expected_version !== provider.version) {
        res.writeHead(409, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ success: false, code: options.delete_error || 'AI_CONFIG_VERSION_STALE', message: 'mock private upstream error' }));
      }
      deleted = true;
      return send(res, 200, { id, deleted: true });
    }
    if (options.save_delay) await new Promise((resolve) => setTimeout(resolve, 1500));
    provider = { ...provider, ...input, version: provider.version + 1 }; return send(res, 200, provider);
  }
  if (path.endsWith('/route-model-options')) return send(res, 200, page([]));
  if (path === '/platform/ai-config/secret-settings') {
    if (options.denied || options.load_failure) return send(res, options.denied ? 403 : 503, null);
    return send(res, 200, { can_manage: !options.readonly, list: [
      ['AI_API_KEY', 'AI 接口密钥'], ['DEEPSEEK_API_KEY', 'DeepSeek 接口密钥'],
      ['OPENROUTER_API_KEY', 'OpenRouter 接口密钥'], ['ARK_API_KEY', '火山方舟接口密钥'],
    ].map(([key, name]) => ({ key, name, source: configured ? 'database' : 'empty', status: configured ? 'configured' : 'empty' })) });
  }
  if (path.startsWith('/platform/ai-config/secret-settings/') && req.method === 'PATCH') {
    const input = await body(req);
    writes.push({ path, nonempty: typeof input.value === 'string' && Boolean(input.value.trim()) });
    if (options.write_failure) return send(res, 503, null);
    configured = true; return send(res, 200, { key: path.split('/').at(-1), saved: true });
  }
  return send(res, 404, null);
});
server.listen(3989, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
