import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

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
let secondDeleted = false;
let routeOptionsRequests = 0;
let reads = [];
let savedRoute = null;
let models = [];
let customScenes = [];
const secondProviderId = '10000000-0000-4000-8000-000000000002';
const routeId = '30000000-0000-4000-8000-000000000001';
const modelId = '40000000-0000-4000-8000-000000000001';
const createdModelId = '40000000-0000-4000-8000-000000000050';
const createdModelCode = 'mdl_0123456789abcdef0123456789abcdef';
const opaqueModelCode = (recordId) => recordId === createdModelId
  ? createdModelCode
  : `mdl_${createHash('sha256').update(recordId).digest('hex').slice(0, 32)}`;
const customSceneCode = 'scene_custom_text_001';
const systemScenes = () => [
  { code: 'decoration_qa', name: '装修问答', modality: 'text', required_input_modalities: ['text'], runtime_status: 'connected', requirements_source: 'runtime', requires_streaming: true, min_reference_images: 0, source: 'system', allow_new_configuration: true },
  { code: 'decoration_raw_drawing', name: '装修生图', modality: 'image', required_input_modalities: ['text', 'image'], runtime_status: 'not_connected', requirements_source: 'planned_adapter', requires_streaming: false, min_reference_images: 2, source: 'system', allow_new_configuration: true },
];
const scenes = () => [...systemScenes(), ...customScenes];
const modelRecord = (input, recordId = createdModelId, version = 1) => ({
  id: recordId, provider_id: input.provider_id || id, code: opaqueModelCode(recordId),
  name: input.name, model_name: input.model_name, modality: input.modality,
  input_modalities: input.input_modalities, status: input.status || 'active', sort_order: input.sort_order || 0,
  version, probe_status: 'unverified', created_at: '2026-09-12T00:00:00Z', updated_at: '2026-09-12T00:00:00Z',
});
const routeModel = (name = 'DeepSeek Chat', status = 'active') => ({ id: modelId, provider_id: id, code: 'deepseek_chat', name, model_name: 'deepseek-chat', modality: 'text', status, sort_order: 0, created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z',
  provider: { id: provider.id, code: provider.code, name: provider.name, provider_type: provider.provider_type, status: provider.status } });
const routeRecord = () => savedRoute || (options.legacy_missing
  ? { id: routeId, scene_code: 'legacy_custom', name: '旧业务名称', primary_model_id: modelId, fallback_model_id: '40000000-0000-4000-8000-000000000099', quality_tier: null, modality: 'text', temperature: null, response_format: null, timeout_ms: null, status: 'inactive', version: 7, primary_model: null, fallback_model: null }
  : options.raw_unbound
  ? { id: routeId, scene_code: 'decoration_raw_drawing', name: '装修生图', primary_model_id: null, fallback_model_id: null, modality: 'image', temperature: null, timeout_ms: null, status: 'inactive', version: 1, primary_model: null, fallback_model: null }
  : options.raw_route
  ? { id: routeId, scene_code: 'decoration_raw_drawing', name: '装修生图', primary_model_id: modelId, fallback_model_id: options.raw_fallback ? '40000000-0000-4000-8000-000000000099' : null, quality_tier: 'balanced', modality: 'image', temperature: null, response_format: null, timeout_ms: null, status: 'inactive', version: 1, created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z', primary_model: { ...routeModel('旧生图模型', options.raw_model_active ? 'active' : 'inactive'), modality: 'image' }, fallback_model: options.raw_fallback ? { ...routeModel('旧备用生图模型'), id: '40000000-0000-4000-8000-000000000099', modality: 'image' } : null }
  : { id: routeId, scene_code: 'decoration_qa', name: '装修问答', primary_model_id: modelId, fallback_model_id: null, quality_tier: 'balanced', modality: 'text', temperature: 0.7, response_format: 'json_object', timeout_ms: 60000, status: 'active', version: 1, created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z', primary_model: routeModel(), fallback_model: null });
const visibleProvider = () => options.ark_workspace ? { ...provider, name: '火山方舟' } : provider;
const providerList = () => options.paginated || options.bound_provider_off_page
  ? [...Array.from({ length: options.bound_provider_off_page ? 100 : 20 }, (_, index) => ({ ...initial(), id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name: `保留供应商 ${index + 1}`, code: `retained_${index + 1}` })), ...(deleted ? [] : [visibleProvider()])]
  : deleted ? [] : [visibleProvider(), ...(options.second_provider && !secondDeleted ? [{ ...initial(), id: secondProviderId, name: '第二供应商', code: 'second' }] : [])];
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
  if (path === '/__test/reset') { provider = initial(); options = {}; configured = false; writes = []; reads = []; savedRoute = null; models = []; customScenes = []; deleted = false; secondDeleted = false; routeOptionsRequests = 0; return send(res, 200, {}); }
  if (path === '/__test/options') {
    options = { ...options, ...await body(req) };
    if (options.inactive_provider) provider = { ...provider, status: 'inactive' };
    if (options.image_model && !models.some((item) => item.id === createdModelId)) {
      models.push(modelRecord({ provider_id: id, name: 'Seedream 5 Pro', model_name: 'doubao-seedream-5-0-pro-260628', modality: 'image', input_modalities: ['text', 'image'], status: 'active', sort_order: 0 }));
    }
    if (options.model_paginated && models.length < 21) models = Array.from({ length: 21 }, (_, index) => modelRecord({
      provider_id: id, name: `分页模型 ${index + 1}`, model_name: `very-long-provider-model-identifier-${String(index + 1).padStart(3, '0')}-for-local-wrapping`,
      modality: 'text', input_modalities: ['text'], status: 'active', sort_order: index,
    }, `41000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`));
    if (options.custom_scene && !customScenes.length) customScenes.push({
      code: customSceneCode, name: '自定义文案', modality: 'text', required_input_modalities: ['text'],
      runtime_status: 'not_connected', requirements_source: 'admin', requires_streaming: false,
      min_reference_images: 0, source: 'custom', status: 'active', version: 1, allow_new_configuration: true,
    });
    if (options.scene_paginated && customScenes.length < 21) customScenes = Array.from({ length: 21 }, (_, index) => ({
      code: `scene_page_${String(index + 1).padStart(3, '0')}`, name: `分页场景 ${index + 1}`, modality: 'text',
      required_input_modalities: ['text'], runtime_status: 'not_connected', requirements_source: 'admin',
      requires_streaming: false, min_reference_images: 0, source: 'custom', status: 'active', version: 1, allow_new_configuration: true,
    }));
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
    const input = await body(req); writes.push({ path, input });
    return send(res, 200, {});
  }
  if (path === '/platform/ai-config') return send(res, 200, { counts: { providers: providerList().length, models: models.length, routes: 1 } });
  if (path === '/platform/ai-config/system-scenes') {
    if (options.scene_error) return send(res, 503, null);
    const current = Number(url.searchParams.get('page') || 1);
    const size = Number(url.searchParams.get('pageSize') || 20);
    const list = scenes();
    return send(res, 200, { list: list.slice((current - 1) * size, current * size), pagination: { page: current, pageSize: size, total: list.length, totalPages: Math.ceil(list.length / size) } });
  }
  if (path === '/platform/ai-config/scenes' && req.method === 'GET') {
    if (options.scene_error) return send(res, 503, null);
    const current = Number(url.searchParams.get('page') || 1);
    const size = Number(url.searchParams.get('pageSize') || 20);
    const keyword = url.searchParams.get('keyword') || '';
    const filtered = scenes().filter((item) => !keyword || item.name.includes(keyword) || item.code.includes(keyword));
    return send(res, 200, { list: filtered.slice((current - 1) * size, current * size), pagination: { page: current, pageSize: size, total: filtered.length, totalPages: Math.ceil(filtered.length / size) } });
  }
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
    let sceneCode = input.scene_code || routeRecord().scene_code;
    let sceneName = input.name || routeRecord().name;
    if (input.scene_source === 'custom') {
      sceneCode = customSceneCode; sceneName = input.scene_name;
      if (!customScenes.some((item) => item.code === sceneCode)) customScenes.push({
        code: sceneCode, name: sceneName, modality: input.modality, required_input_modalities: [input.modality],
        runtime_status: 'not_connected', requirements_source: 'admin', requires_streaming: false,
        min_reference_images: 0, source: 'custom', status: 'active', version: 1, allow_new_configuration: true,
      });
    }
    const boundModel = (model) => model ? { ...model, provider: visibleProvider() } : null;
    savedRoute = {
      ...routeRecord(), ...input, id: routeId, scene_code: sceneCode, name: sceneName,
      modality: input.modality || scenes().find((item) => item.code === sceneCode)?.modality || routeRecord().modality,
      version: (routeRecord().version || 0) + 1,
      primary_model: boundModel(models.find((item) => item.id === input.primary_model_id)),
      fallback_model: boundModel(models.find((item) => item.id === input.fallback_model_id)),
    };
    return send(res, 200, savedRoute);
  }
  if (path === '/platform/ai-config/providers') {
    if (deleted && options.refresh_failure) return send(res, 503, null);
    const list = providerList();
    const current = Number(url.searchParams.get('page') || 1);
    const size = Number(url.searchParams.get('pageSize') || 20);
    return send(res, 200, { list: list.slice((current - 1) * size, current * size), pagination: { page: current, pageSize: size, total: list.length, totalPages: Math.ceil(list.length / size) } });
  }
  if (path === `/platform/ai-config/providers/${secondProviderId}` && req.method === 'DELETE') {
    const input = await body(req); writes.push({ path, input }); secondDeleted = true;
    return send(res, 200, { id: secondProviderId, deleted: true });
  }
  if (path === `/platform/ai-config/providers/${id}/validate` && req.method === 'POST') {
    const input = await body(req); writes.push({ path, input });
    const checked_at = '2026-09-12T08:00:00.000Z';
    return send(res, 200, provider.provider_type === 'openrouter'
      ? { status: 'verified', checked_at, method: 'openrouter_catalog' }
      : { status: 'unsupported', checked_at, method: 'none', message: 'OpenAI Compatible 供应商未约定安全的只读发现接口，暂不支持连通性验证' });
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
  if (path === '/platform/ai-config/models' && req.method === 'GET') {
    const current = Number(url.searchParams.get('page') || 1);
    const size = Number(url.searchParams.get('pageSize') || 20);
    const providerId = url.searchParams.get('providerId');
    const keyword = url.searchParams.get('keyword') || '';
    const modality = url.searchParams.get('modality');
    const status = url.searchParams.get('status');
    const filtered = models.filter((item) => (!providerId || item.provider_id === providerId)
      && (!keyword || item.name.includes(keyword) || item.model_name.includes(keyword))
      && (!modality || item.modality === modality) && (!status || item.status === status));
    return send(res, 200, { list: filtered.slice((current - 1) * size, current * size), pagination: { page: current, pageSize: size, total: filtered.length, totalPages: Math.ceil(filtered.length / size) } });
  }
  if (path === '/platform/ai-config/models' && req.method === 'POST') {
    const input = await body(req); writes.push({ path, input });
    if (Object.hasOwn(input, 'code')) return rejectRoute(res, 400, 'VALIDATION_ERROR', '模型系统编码由服务端生成');
    if (options.model_conflict) return rejectRoute(res, 409, 'AI_MODEL_ALREADY_REGISTERED', 'mock private duplicate');
    const record = modelRecord(input); models = [...models.filter((item) => item.id !== record.id), record];
    return send(res, 200, record);
  }
  if (path.startsWith('/platform/ai-config/models/') && req.method === 'PATCH') {
    const input = await body(req); writes.push({ path, input });
    if (Object.hasOwn(input, 'code')) return rejectRoute(res, 400, 'VALIDATION_ERROR', '模型系统编码不可修改');
    if (options.model_conflict) return rejectRoute(res, 409, 'AI_MODEL_MODALITY_IN_USE', 'mock private conflict');
    const recordId = path.split('/').at(-1);
    const current = models.find((item) => item.id === recordId);
    if (!current) return rejectRoute(res, 404, 'AI_MODEL_NOT_FOUND', 'mock private missing');
    const record = modelRecord({ ...current, ...input }, current.id, (current.version || 1) + 1);
    models = models.map((item) => item.id === current.id ? record : item);
    return send(res, 200, record);
  }
  if (path.endsWith('/route-model-options')) {
    routeOptionsRequests += 1;
    reads.push({ path, query: Object.fromEntries(url.searchParams) });
    if (options.route_options_error_once && routeOptionsRequests === 1) return send(res, 503, null);
    const keyword = url.searchParams.get('keyword') || '';
    const current = Number(url.searchParams.get('page') || 1);
    const selectedProviderId = path.split('/')[4];
    if (url.searchParams.get('view') === 'inspect') {
      if (options.inspect_error) return send(res, 503, null);
      if (options.delay_first_provider && selectedProviderId === id) await new Promise((resolve) => setTimeout(resolve, 1200));
      // Match inspect's provider-scoped, bounded registered-model query: no manual/catalog candidates.
      const registered = Array.from({ length: options.inspect_paginated ? 21 : 1 }, (_, index) => ({
        ...routeModel(), id: `${selectedProviderId}-registered-${index}`, source: 'internal',
        value: `${selectedProviderId}-registered-${index}`, model_id: `${selectedProviderId}-registered-${index}`,
        provider_id: selectedProviderId, label: selectedProviderId === id ? `已登记文本模型 ${index + 1}` : `第二供应商登记模型 ${index + 1}`,
        name: selectedProviderId === id ? `已登记文本模型 ${index + 1}` : `第二供应商登记模型 ${index + 1}`,
        model_name: `ep-synthetic-registered-long-call-name-for-wrapping-${index + 1}`, description: null,
        input_modalities: ['text'], probe_status: index === 20 ? 'stale' : 'unverified', status: index === 20 ? 'inactive' : 'active',
      })).filter((model) => !keyword || model.name.includes(keyword) || model.model_name.includes(keyword));
      return send(res, 200, { list: registered.slice((current - 1) * 20, current * 20),
        pagination: { page: current, pageSize: 20, total: registered.length, totalPages: Math.ceil(registered.length / 20) } });
    }
    if ((options.delayed_route_options || (options.delay_first_provider && selectedProviderId === id)) && keyword === '') await new Promise((resolve) => setTimeout(resolve, 1200));
    const registeredModels = models.filter((item) => item.provider_id === selectedProviderId
      && item.status === 'active' && (!url.searchParams.get('modality') || item.modality === url.searchParams.get('modality'))
      && (!keyword || item.name.includes(keyword) || item.model_name.includes(keyword)))
      .map((item) => ({ source: 'internal', value: item.id, model_id: item.id, provider_id: item.provider_id,
        label: item.name, description: item.model_name, modality: item.modality, status: item.status }));
    const requestedModality = url.searchParams.get('modality') || 'text';
    const secondProviderModels = Array.from({ length: options.inspect_paginated ? 21 : 1 }, (_, index) => ({
      source: 'internal', value: `40000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`,
      model_id: `40000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`, provider_id: secondProviderId,
      label: options.inspect_paginated ? `第二供应商登记模型 ${index + 1}` : 'Second model', description: null,
      modality: requestedModality, status: 'active',
    }));
    const paginatedModels = Array.from({ length: 21 }, (_, index) => ({
      source: 'internal', value: `42000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      model_id: `42000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, provider_id: id,
      label: `已登记图片模型 ${index + 1}`, description: `image-model-${index + 1}`,
      modality: requestedModality, status: 'active',
    }));
    const list = keyword === 'empty' ? [] : selectedProviderId === secondProviderId
      ? secondProviderModels.slice((current - 1) * 20, current * 20)
      : options.inspect_paginated ? paginatedModels.slice((current - 1) * 20, current * 20)
      : keyword === 'manual' ? [{ source: 'manual', value: 'manual-entry', provider_id: id, label: 'custom-text-model', description: null, modality: 'text', status: 'active' }]
      : keyword === 'catalog-page-2'
      ? current === 2 ? [{ source: 'catalog', value: '60000000-0000-4000-8000-000000000021', provider_id: id, label: 'Catalog page two', description: null, modality: 'text', status: 'active' }]
        : Array.from({ length: 20 }, (_, index) => ({ source: 'catalog', value: `60000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, provider_id: id, label: `Catalog page one ${index + 1}`, description: null, modality: 'text', status: 'active' }))
      : registeredModels.length ? registeredModels
      : [{ source: 'internal', value: modelId, model_id: modelId, provider_id: id, label: 'DeepSeek Chat', description: 'deepseek-chat', modality: 'text', status: 'active' }];
    const discovery = provider.provider_type === 'openrouter'
      ? { mode: 'openrouter_catalog', status: list.length ? 'ready' : 'empty' }
      : { mode: 'internal_only', status: 'unsupported' };
    const total = keyword === 'catalog-page-2' || (options.inspect_paginated && keyword !== 'empty') ? 21 : list.length;
    return send(res, 200, { list, discovery, pagination: { page: current, pageSize: 20, total, totalPages: Math.ceil(total / 20) } });
  }
  if (path.endsWith('/route-model-options:resolve') && req.method === 'POST') {
    const input = await body(req); writes.push({ path, input });
    const resolvedId = '50000000-0000-4000-8000-000000000002';
    if (input.source === 'manual') models = [...models.filter((item) => item.id !== resolvedId), modelRecord({ ...input, provider_id: path.split('/')[4], status: 'active', sort_order: 0 }, resolvedId)];
    return send(res, 200, { model_id: resolvedId });
  }
  if (path.startsWith('/platform/ai-config/scenes/') && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const input = await body(req); writes.push({ path, input });
    const code = decodeURIComponent(path.split('/').at(-1));
    const current = customScenes.find((item) => item.code === code);
    if (!current) return rejectRoute(res, 404, 'AI_CUSTOM_SCENE_NOT_FOUND', 'mock private missing');
    if (req.method === 'DELETE') {
      customScenes = customScenes.filter((item) => item.code !== code);
      return send(res, 200, { code, deleted: true });
    }
    const updated = { ...current, ...input, version: (current.version || 1) + 1 };
    customScenes = customScenes.map((item) => item.code === code ? updated : item);
    return send(res, 200, updated);
  }
  if (path === '/platform/ai-config/secret-settings') {
    if (options.denied || options.load_failure) return send(res, options.denied ? 403 : 503, null);
    return send(res, 200, { can_manage: !options.readonly, list: [
      ['AI_API_KEY', 'AI 接口密钥'], ['DEEPSEEK_API_KEY', 'DeepSeek 接口密钥'],
      ['OPENROUTER_API_KEY', 'OpenRouter 接口密钥'], ['ARK_API_KEY', '火山方舟接口密钥'],
    ].map(([key, name]) => ({ key, name, source: configured ? 'database' : 'empty', status: configured ? 'configured' : 'empty' })) });
  }
  if (path.startsWith('/platform/ai-config/secret-settings/') && req.method === 'PATCH') {
    const input = await body(req);
    writes.push({ path, input });
    if (options.write_failure) return send(res, 503, null);
    configured = true; return send(res, 200, { key: path.split('/').at(-1), saved: true });
  }
  return send(res, 404, null);
});
server.listen(3989, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
