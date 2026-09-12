import { z } from 'zod';
import { RenderingLibraryCreateSchema, RenderingLibraryListSchema, RenderingLibraryUpdateSchema,
  RenderingLibraryVersionSchema,
  type RenderingLibraryStyle } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';
import type { TenantRenderingLibraryRepository, RenderingLibraryChanges } from '@/repositories/tenant-rendering-library';
import type { accessPolicyService } from '@/services/access-policy';
import type { AuthContext } from '@/services/authorization';
import { assertRenderingSourceFile } from '@/services/rendering-library-files/source-policy';

export type RenderingLibraryRepositoryPort = Pick<TenantRenderingLibraryRepository,
  'list' | 'find' | 'findSourceFile' | 'create' | 'change'>;
interface Dependencies {
  repository: RenderingLibraryRepositoryPort;
  accessPolicy: Pick<typeof accessPolicyService, 'assertTenantContext' | 'assertPermission'>;
}
export interface RenderingLibraryListDto {
  list: RenderingLibraryStyle[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
export interface RenderingLibraryDeleteDto { id: string; deleted: true }
const IdSchema = z.uuid('无效的素材 ID');

export class TenantRenderingLibraryService {
  constructor(private readonly dependencies: Dependencies) {}

  private parse<Output>(schema: z.ZodType<Output>, input: unknown): Output {
    const result = schema.safeParse(input);
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data;
  }

  private authorize(auth: AuthContext, write = false): { tenantId: string; employeeId: string } {
    const tenantId = this.dependencies.accessPolicy.assertTenantContext(auth);
    if (!auth.employeeId) throw Errors.forbidden();
    if (this.dependencies.accessPolicy.assertPermission(auth, 'rendering_library.read') !== 'all') {
      throw Errors.forbidden();
    }
    if (write && this.dependencies.accessPolicy.assertPermission(auth, 'rendering_library.manage') !== 'all') {
      throw Errors.forbidden();
    }
    return { tenantId, employeeId: auth.employeeId };
  }

  private toDto(row: RenderingLibraryStyle): RenderingLibraryStyle {
    return { id: row.id, tenant_id: row.tenant_id, title: row.title, space: row.space, style: row.style,
      color_notes: row.color_notes, material_notes: row.material_notes, source_type: row.source_type,
      rights_confirmed: row.rights_confirmed, file_id: row.file_id, status: row.status,
      sort_order: row.sort_order, version: row.version, created_by_employee_id: row.created_by_employee_id,
      published_version: row.published_version, published_at: row.published_at, published_by_employee_id: row.published_by_employee_id,
      created_at: row.created_at, updated_at: row.updated_at };
  }

  async list(auth: AuthContext, input: unknown): Promise<RenderingLibraryListDto> {
    const { tenantId } = this.authorize(auth);
    const query = this.parse(RenderingLibraryListSchema, input);
    const { rows, total } = await this.dependencies.repository.list(tenantId, query);
    return { list: rows.map((row) => this.toDto(row)), pagination: {
      page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize),
    } };
  }

  async get(auth: AuthContext, inputId: string): Promise<RenderingLibraryStyle> {
    const { tenantId } = this.authorize(auth);
    const id = this.parse(IdSchema, inputId);
    const row = await this.dependencies.repository.find(tenantId, id);
    if (!row) throw Errors.business(404, '装修效果素材不存在', 'RENDERING_STYLE_NOT_FOUND');
    return this.toDto(row);
  }

  async create(auth: AuthContext, input: unknown): Promise<RenderingLibraryStyle> {
    const { tenantId, employeeId } = this.authorize(auth, true);
    const body = this.parse(RenderingLibraryCreateSchema, input);
    const file = await this.dependencies.repository.findSourceFile(tenantId, body.file_id);
    assertRenderingSourceFile(tenantId, body.file_id, file);
    return this.toDto(await this.dependencies.repository.create(tenantId, employeeId, body));
  }

  async update(auth: AuthContext, inputId: string, input: unknown): Promise<RenderingLibraryStyle> {
    const { tenantId } = this.authorize(auth, true);
    const id = this.parse(IdSchema, inputId);
    const { expected_version, ...changes } = this.parse(RenderingLibraryUpdateSchema, input);
    return this.change(tenantId, id, expected_version, changes);
  }

  async hide(auth: AuthContext, inputId: string, input: unknown): Promise<RenderingLibraryStyle> {
    const { tenantId } = this.authorize(auth, true);
    const id = this.parse(IdSchema, inputId);
    const { expected_version } = this.parse(RenderingLibraryVersionSchema, input);
    return this.change(tenantId, id, expected_version, { status: 'hidden' });
  }

  async remove(auth: AuthContext, inputId: string, input: unknown): Promise<RenderingLibraryDeleteDto> {
    const { tenantId } = this.authorize(auth, true);
    const id = this.parse(IdSchema, inputId);
    const { expected_version } = this.parse(RenderingLibraryVersionSchema, input);
    await this.change(tenantId, id, expected_version, { status: 'hidden', deleted_at: new Date().toISOString() });
    return { id, deleted: true };
  }

  private async change(tenantId: string, id: string, version: number,
    changes: RenderingLibraryChanges): Promise<RenderingLibraryStyle> {
    const row = await this.dependencies.repository.change(tenantId, id, version, changes);
    if (row) return this.toDto(row);
    const existing = await this.dependencies.repository.find(tenantId, id);
    if (!existing) throw Errors.business(404, '装修效果素材不存在', 'RENDERING_STYLE_NOT_FOUND');
    throw Errors.business(409, '装修效果素材已更新，请刷新后重试', 'RENDERING_STYLE_VERSION_CONFLICT');
  }
}
