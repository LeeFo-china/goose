// Deterministic test-only data. Never connects to a real tenant or storage provider.
export const tenantId = '20000000-0000-4000-8000-000000000001';
export const employeeId = '10000000-0000-4000-8000-000000000001';
export const fileId = (index) => `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
export const styleId = (index) => `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

export function sessionFor(token) {
  return {
    user_id: employeeId, login_channel: 'admin_web',
    employee: { id: employeeId, name: '素材测试员', status: 'active',
      tenant_department_id: null, department_name: null, post_id: null, post_name: null, avatar: null },
    tenant: { id: tenantId, name: '效果库测试公司', slug: 'rendering-test', status: 'active' },
    roles: [], permissions: token.includes('denied') ? [] : [
      { code: 'rendering_library.read', scope: 'all' },
      ...(token.includes('viewer') ? [] : [{ code: 'rendering_library.manage', scope: 'all' }]),
    ],
  };
}

export const serviceAccess = {
  accessStatus: 'workspace_available', accessMode: 'paid', accessLevel: 'read_write',
  canEnterWorkspace: true, readonly: false, trialId: null, trialStatus: null,
  startsAt: null, endsAt: null, evaluatedAt: '2026-09-11T10:00:00+08:00',
  title: '平台技术服务可用', message: '当前企业可正常使用工作台。',
  primaryAction: { key: 'enter_workspace', label: '进入工作台' }, secondaryAction: null,
};

export function initialStyles() {
  return Array.from({ length: 21 }, (_, index) => ({
    id: styleId(index + 1), tenant_id: tenantId, file_id: fileId(index + 1),
    title: `测试素材 ${String(index + 1).padStart(2, '0')}`,
    space: index % 2 ? 'bedroom' : 'living_room', style: 'modern_simple',
    color_notes: '浅灰与木色', material_notes: '木质家具搭配棉麻织物',
    source_type: 'design', rights_confirmed: true, status: 'draft',
    sort_order: index, version: 1, created_by_employee_id: employeeId,
    published_version: null, published_at: null, published_by_employee_id: null,
    created_at: '2026-09-11T10:00:00+08:00', updated_at: '2026-09-11T10:00:00+08:00',
  }));
}
