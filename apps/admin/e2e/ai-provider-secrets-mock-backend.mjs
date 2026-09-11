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
let routeOptionsRequests = 0;
let reads = [];
let savedRoute = null;
const secondProviderId = '10000000-0000-4000-8000-000000000002';
const routeId = '30000000-0000-4000-8000-000000000001';
const modelId = '40000000-0000-4000-8000-000000000001';
const scenes = () => [
  { code: 'decoration_qa', name: '装修问答', modality: 'text', required_input_modalities: ['text'], runtime_status: 'connected', requirements_source: 'runtime', requires_streaming: true, min_reference_images: 0, source: 'system', allow_new_configuration: true },
  { code: 'decoration_raw_drawing', name: '装修生图', modality: 'image', required_input_modalities: ['text', 'image'], runtime_status: 'not_connected', requirements_source: 'planned_adapter', requires_streaming: false, min_reference_images: 2, source: 'system', allow_new_configuration: true },
];
const routeModel = (name = 'DeepSeek Chat', status = 'active') => ({ id: modelId, provider_id: id, code: 'deepseek_chat', name, model_name: 'deepseek-chat', modality: 'text', status, sort_order: 0, created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z',
  provider: { id: provider.id, code: provider.code, name: provider.name, provider_type: provider.provider_type, status: provider.status } });
const routeRecord = () => savedRoute || (options.legacy_missing
  ? { id: routeId, scene_code: 'legacy_custom', name: '旧业务名称', primary_model_id: modelId, fallback_model_id: '40000000-0000-4000-8000-000000000099', quality_tier: null, modality: 'text', temperature: null, response_format: null, timeout_ms: null, status: 'inactive', version: 7, primary_model: null, fallback_model: null }
  : options.raw_route
  ? { id: routeId, scene_code: 'decoration_raw_drawing', name: '装修生图', primary_model_id: modelId, fallback_model_id: null, quality_tier: 'balanced', modality: 'image', temperature: null, response_format: null, timeout_ms: null, status: 'inactive', version: 1, created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z', primary_model: { ...routeModel('旧生图模型', options.raw_model_active ? 'active' : 'inactive'), modality: 'image' }, fallback_model: null }
  : { id: routeId, scene_code: 'decoration_qa', name: '装修问答', primary_model_id: modelId, fallback_model_id: null, quality_tier: 'balanced', modality: 'text', temperature: 0.7, response_format: 'json_object', timeout_ms: 60000, status: 'active', version: 1, created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z', primary_model: routeModel(), fallback_model: null });
const providerList = () => options.paginated || options.bound_provider_off_page
  ? [...Array.from({ length: options.bound_provider_off_page ? 100 : 20 }, (_, index) => ({ ...initial(), id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name: `保留供应商 ${index + 1}`, code: `retained_${index + 1}` })), ...(deleted ? [] : [provider])]
  : deleted ? [] : [provider, ...(options.second_provider ? [{ ...initial(), id: secondProviderId, name: '第二供应商', code: 'second' }] : [])];
const page = (list) => ({ list, pagination: { page: 1, pageSize: 20, total: list.length, totalPages: list.length ? 1 : 0 } });
const send = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'private, no-store' });
  res.end(JSON.stringify(status < 400 ? { success: true, data } : { success: false, code: 'TEST_REJECTED', message: '测试请求失败' }));
};
const rejectRoute = (res, status, code, message) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ success: false, code, message }));
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
  if (path === '/__test/reset') { provider = initial(); options = {}; configured = false; writes = []; reads = []; savedRoute = null; deleted = false; routeOptionsRequests = 0; return send(res, 200, {}); }
  if (path === '/__test/options') {
    options = { ...options, ...await body(req) };
    if (options.inactive_provider) provider = { ...provider, status: 'inactive' };
    return send(res, 200, {});
  }
  if (path === '/__test/writes') return send(res, 200, writes);
  if (path === '/__test/reads') return send(res, 200, reads);
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
  if (path === '/platform/ai-config') return send(res, 200, { counts: { providers: providerList().length, models: 0, routes: 1 } });
  if (path === '/platform/ai-config/system-scenes') return send(res, options.scene_error ? 503 : 200, page(scenes()));
  if (path === '/platform/ai-config/routes' && req.method === 'GET') return send(res, 200, page([routeRecord()]));
  if ((path === '/platform/ai-config/routes' && req.method === 'POST') || (path.startsWith('/platform/ai-config/routes/') && req.method === 'PATCH')) {
    const input = await body(req); writes.push({ path, input });
    if (options.route_save_delay) await new Promise((resolve) => setTimeout(resolve, 1500));
    // Match the production policy's merged-binding validation for these fixtures.
    const merged = { ...routeRecord(), ...input };
    if (options.legacy_missing && (merged.primary_model_id === modelId
      || merged.fallback_model_id === '40000000-0000-4000-8000-000000000099')) {
      return rejectRoute(res, 404, 'AI_MODEL_NOT_FOUND', 'AI 模型不存在');
    }
    if (options.raw_route && !options.raw_model_active && merged.primary_model_id === modelId) {
      return rejectRoute(res, 409, 'AI_MODEL_INACTIVE', 'AI 模型已停用');
    }
    if (options.inactive_provider && (merged.primary_model_id === modelId || merged.fallback_model_id === modelId)) {
      return rejectRoute(res, 409, 'AI_PROVIDER_INACTIVE', 'AI 供应商已停用');
    }
    savedRoute = { ...routeRecord(), ...input };
    return send(res, 200, savedRoute);
  }
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
  if (path.endsWith('/route-model-options')) {
    routeOptionsRequests += 1;
    reads.push({ path, query: Object.fromEntries(url.searchParams) });
    if (options.route_options_error_once && routeOptionsRequests === 1) return send(res, 503, null);
    const keyword = url.searchParams.get('keyword') || '';
    const current = Number(url.searchParams.get('page') || 1);
    const selectedProviderId = path.split('/')[4];
    if ((options.delayed_route_options || (options.delay_first_provider && selectedProviderId === id)) && keyword === '') await new Promise((resolve) => setTimeout(resolve, 1200));
    const list = keyword === 'empty' ? [] : selectedProviderId === secondProviderId
      ? [{ source: 'internal', value: '40000000-0000-4000-8000-000000000002', model_id: '40000000-0000-4000-8000-000000000002', provider_id: secondProviderId, label: 'Second model', description: null, modality: 'text', status: 'active' }]
      : keyword === 'manual' ? [{ source: 'manual', value: 'manual-entry', provider_id: id, label: 'custom-text-model', description: null, modality: 'text', status: 'active' }]
      : keyword === 'catalog-page-2'
      ? current === 2 ? [{ source: 'catalog', value: '60000000-0000-4000-8000-000000000021', provider_id: id, label: 'Catalog page two', description: null, modality: 'text', status: 'active' }]
        : Array.from({ length: 20 }, (_, index) => ({ source: 'catalog', value: `60000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, provider_id: id, label: `Catalog page one ${index + 1}`, description: null, modality: 'text', status: 'active' }))
      : [{ source: 'internal', value: modelId, model_id: modelId, provider_id: id, label: 'DeepSeek Chat', description: 'deepseek-chat', modality: 'text', status: 'active' }];
    return send(res, 200, { list, pagination: { page: current, pageSize: 20, total: keyword === 'catalog-page-2' ? 21 : list.length, totalPages: keyword === 'catalog-page-2' ? 2 : Math.ceil(list.length / 20) } });
  }
  if (path.endsWith('/route-model-options:resolve') && req.method === 'POST') { const input = await body(req); writes.push({ path, input }); return send(res, 200, { model_id: '50000000-0000-4000-8000-000000000002' }); }
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
