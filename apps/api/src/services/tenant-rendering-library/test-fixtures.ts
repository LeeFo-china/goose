import type { AuthContext } from '@/services/authorization';
import type { RenderingLibraryStyle, RenderingLibraryCreate } from '@gooes/domain';
import type { RenderingLibraryRepositoryPort } from './service';

export const tenantId = '11111111-1111-4111-8111-111111111111';
export const styleId = '22222222-2222-4222-8222-222222222222';
export const fileId = '33333333-3333-4333-8333-333333333333';
export const otherTenantId = '44444444-4444-4444-8444-444444444444';
export const createInput: RenderingLibraryCreate = { title: '客厅', space: 'living_room', style: 'cream',
  color_notes: '暖色', material_notes: '木质', source_type: 'design', rights_confirmed: true,
  file_id: fileId, sort_order: 0 };
export function makeAuth(overrides: Partial<AuthContext> = {}): AuthContext {
  return { authUserId: fileId, tenantId, employeeId: fileId, tenantName: null, tenantSlug: null,
    tenantStatus: 'active', isPlatformAdmin: false, employeeName: null, employeeStatus: 'active',
    departmentId: null, tenantDepartmentId: null, departmentCode: null, departmentName: null,
    postId: null, postName: null, avatar: null, roleCodes: [], roles: [],
    permissions: [{ code: 'rendering_library.read', scope: 'all' }, { code: 'rendering_library.manage', scope: 'all' }],
    ...overrides };
}

export function makeRepositoryFixture() {
  const rows = new Map<string, RenderingLibraryStyle & { deleted_at: string | null }>();
  const source = { id: fileId, tenant_id: tenantId, scene: 'rendering_style_source', visibility: 'private',
    status: 'active', deleted_at: null as string | null, mime_type: 'image/webp', size_bytes: 1024,
    object_key: `private/renovation-styles/${tenantId}/${fileId}.webp`, provider: 'tencent_cos',
    bucket: 'rendering-123456', region: 'ap-guangzhou', owner_type: 'tenant', owner_id: tenantId,
    width: 32, height: 24, public_url: null as string | null, legacy_url: null as string | null, legacy_path: null as string | null,
    checksum: 'a'.repeat(64) as string | null };
  const calls: unknown[][] = [];
  const repository: RenderingLibraryRepositoryPort = {
    async list(tenant, query) {
      calls.push(['list', tenant, query]);
      const live = [...rows.values()].filter((row) => row.tenant_id === tenant && !row.deleted_at
        && (!query.status || row.status === query.status) && (!query.space || row.space === query.space)
        && (!query.style || row.style === query.style))
        .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
      return { rows: live.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), total: live.length };
    },
    async find(tenant, id) {
      calls.push(['find', tenant, id]);
      const row = rows.get(id);
      return row && row.tenant_id === tenant && !row.deleted_at ? row : null;
    },
    async findSourceFile(tenant, id) { calls.push(['file', tenant, id]); return source; },
    async create(tenant, employee, input) {
      calls.push(['create', tenant, employee, input]);
      const row = { ...input, id: styleId, tenant_id: tenant, status: 'draft' as const, version: 1,
        published_version: null, published_at: null, published_by_employee_id: null,
        created_by_employee_id: employee, created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z', deleted_at: null };
      rows.set(styleId, row);
      return row;
    },
    async change(tenant, id, version, changes) {
      calls.push(['change', tenant, id, version, changes]);
      const row = rows.get(id);
      if (!row || row.deleted_at || row.tenant_id !== tenant || row.version !== version) return null;
      const updated = { ...row, ...changes, version: version + 1 };
      rows.set(id, updated);
      return updated;
    },
  };
  return { repository, rows, source, calls };
}
