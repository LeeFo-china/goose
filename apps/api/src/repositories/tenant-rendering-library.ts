import { z } from 'zod';
import { RenderingLibraryStyleSchema, RENDERING_LIBRARY_SOURCE_SCENE, RENDERING_LIBRARY_PREVIEW_BATCH_MAX, type RenderingLibraryCreate, type RenderingLibraryList,
  type RenderingLibraryStyle, type RenderingLibraryUpdate } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';
import type { RenderingStorageLocation } from '@/gateways/rendering-library-storage/client';
import { SupabaseDB } from '@/utils/supabase';

export type TenantRenderingLibraryDatabaseClient = Pick<ReturnType<typeof SupabaseDB.getAdminClient>, 'from'>;
export type RenderingLibraryChanges = Omit<RenderingLibraryUpdate, 'expected_version'> & {
  status?: 'hidden';
  deleted_at?: string;
};
export interface RenderingLibraryRows { rows: RenderingLibraryStyle[]; total: number }

const STYLE_FIELDS = 'id,tenant_id,title,space,style,color_notes,material_notes,source_type,rights_confirmed,file_id,status,sort_order,version,created_by_employee_id,published_version,published_at,published_by_employee_id,created_at,updated_at';
const SOURCE_FIELDS = 'id,tenant_id,scene,visibility,status,deleted_at,mime_type,size_bytes,object_key,provider,bucket,region,owner_type,owner_id,width,height,public_url,legacy_url,legacy_path,checksum';
const SourceBatchInputSchema = z.strictObject({
  tenantId: z.uuid(), fileIds: z.array(z.uuid()).max(RENDERING_LIBRARY_PREVIEW_BATCH_MAX)
    .refine((ids) => new Set(ids).size === ids.length, '文件 ID 不得重复'),
});
const SourceFileSchema = z.strictObject({
  id: z.uuid(), tenant_id: z.uuid().nullable(), scene: z.string(), visibility: z.string(), status: z.string(),
  deleted_at: z.string().datetime({ offset: true }).nullable(), mime_type: z.string(),
  size_bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), object_key: z.string().min(1),
  provider: z.string(), bucket: z.string(), region: z.string().nullable(),
  owner_type: z.string(), owner_id: z.uuid().nullable(), width: z.number().int().nullable(), height: z.number().int().nullable(),
  public_url: z.string().nullable(), legacy_url: z.string().nullable(), legacy_path: z.string().nullable(),
  checksum: z.string().nullable(),
});
export type RenderingLibrarySourceFile = z.infer<typeof SourceFileSchema>;
export interface StageRenderingSourceInput {
  id: string; tenantId: string; employeeId: string; authUserId: string;
  location: RenderingStorageLocation; sizeBytes: number; width: number; height: number; checksum: string;
}

export class TenantRenderingLibraryRepository {
  constructor(private readonly client: TenantRenderingLibraryDatabaseClient = SupabaseDB.getAdminClient()) {}

  private parseStyle(data: unknown, tenantId: string, id?: string): RenderingLibraryStyle {
    const parsed = RenderingLibraryStyleSchema.safeParse(data);
    if (!parsed.success || parsed.data.tenant_id !== tenantId || (id !== undefined && parsed.data.id !== id)) {
      throw Errors.dbError('装修效果素材数据格式异常');
    }
    return parsed.data;
  }

  async list(tenantId: string, input: RenderingLibraryList): Promise<RenderingLibraryRows> {
    let query = this.client.from('tenant_rendering_styles').select(STYLE_FIELDS, { count: 'exact' })
      .eq('tenant_id', tenantId).is('deleted_at', null);
    if (input.status) query = query.eq('status', input.status);
    if (input.space) query = query.eq('space', input.space);
    if (input.style) query = query.eq('style', input.style);
    const offset = (input.page - 1) * input.pageSize;
    const { data, error, count } = await query.order('sort_order', { ascending: true })
      .order('id', { ascending: true }).range(offset, offset + input.pageSize - 1);
    if (error) throw Errors.dbError('读取装修效果素材失败');
    if (!Array.isArray(data) || count === null || !Number.isSafeInteger(count) || count < 0) {
      throw Errors.dbError('装修效果素材分页数据格式异常');
    }
    return { rows: data.map((row) => this.parseStyle(row, tenantId)), total: count };
  }

  async find(tenantId: string, id: string): Promise<RenderingLibraryStyle | null> {
    const { data, error } = await this.client.from('tenant_rendering_styles').select(STYLE_FIELDS)
      .eq('tenant_id', tenantId).eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw Errors.dbError('读取装修效果素材失败');
    return data === null ? null : this.parseStyle(data, tenantId, id);
  }

  async findSourceFile(tenantId: string, fileId: string): Promise<RenderingLibrarySourceFile | null> {
    const { data, error } = await this.client.from('platform_file_objects').select(SOURCE_FIELDS)
      .eq('tenant_id', tenantId).eq('id', fileId).is('deleted_at', null).maybeSingle();
    if (error) throw Errors.dbError('读取装修效果素材文件失败');
    if (data === null) return null;
    return this.parseSource(data, tenantId, fileId);
  }

  async findSourceFiles(tenantId: string, fileIds: string[]): Promise<RenderingLibrarySourceFile[]> {
    const input = SourceBatchInputSchema.safeParse({ tenantId, fileIds });
    if (!input.success) throw Errors.fromZod(input.error);
    if (fileIds.length === 0) return [];
    // Known IDs only: a bounded batch lookup, not an enumerable list that requires page-based pagination.
    const { data, error } = await this.client.from('platform_file_objects').select(SOURCE_FIELDS)
      .eq('tenant_id', tenantId).in('id', fileIds).is('deleted_at', null).limit(fileIds.length);
    if (error) throw Errors.dbError('读取装修效果素材文件失败');
    const parsed = z.array(SourceFileSchema).max(fileIds.length).safeParse(data);
    if (!parsed.success) throw Errors.dbError('装修效果素材文件数据格式异常');
    const requested = new Set(fileIds);
    const seen = new Set<string>();
    for (const file of parsed.data) {
      if (file.tenant_id !== tenantId || !requested.has(file.id) || seen.has(file.id)) {
        throw Errors.dbError('装修效果素材文件数据格式异常');
      }
      seen.add(file.id);
    }
    return parsed.data;
  }

  private parseSource(data: unknown, tenantId: string, fileId: string): RenderingLibrarySourceFile {
    const parsed = SourceFileSchema.safeParse(data);
    if (!parsed.success || parsed.data.tenant_id !== tenantId || parsed.data.id !== fileId) {
      throw Errors.dbError('装修效果素材文件数据格式异常');
    }
    return parsed.data;
  }

  private parseSourceState(data: unknown, tenantId: string, id: string, status: 'migrating' | 'active'): RenderingLibrarySourceFile {
    const file = this.parseSource(data, tenantId, id);
    if (file.status !== status || file.scene !== RENDERING_LIBRARY_SOURCE_SCENE || file.visibility !== 'private'
      || file.deleted_at !== null || file.provider !== 'tencent_cos' || file.owner_type !== 'tenant'
      || file.owner_id !== tenantId || file.public_url !== null || file.legacy_url !== null || file.legacy_path !== null
      || file.mime_type !== 'image/webp' || file.object_key !== `private/renovation-styles/${tenantId}/${id}.webp`) {
      throw Errors.dbError('装修效果素材文件状态异常');
    }
    return file;
  }

  async stageSourceFile(input: StageRenderingSourceInput): Promise<RenderingLibrarySourceFile> {
    const { data, error } = await this.client.from('platform_file_objects').insert({
      id: input.id, tenant_id: input.tenantId, owner_type: 'tenant', owner_id: input.tenantId,
      scene: RENDERING_LIBRARY_SOURCE_SCENE, provider: 'tencent_cos', ...input.location,
      mime_type: 'image/webp', size_bytes: input.sizeBytes, width: input.width, height: input.height, checksum: input.checksum,
      visibility: 'private', public_url: null, legacy_url: null, legacy_path: null,
      // Dedicated scene staging is unavailable to readers; failures require manual reconciliation.
      status: 'migrating', original_name: null, created_by_employee_id: input.employeeId,
      created_by_auth_user_id: input.authUserId, metadata: { normalization: 'rendering-webp-v1' },
    }).select(SOURCE_FIELDS).single();
    if (error) throw Errors.dbError('暂存装修效果素材文件失败');
    const file = this.parseSourceState(data, input.tenantId, input.id, 'migrating');
    if (file.bucket !== input.location.bucket || file.region !== input.location.region || file.object_key !== input.location.object_key
      || file.width !== input.width || file.height !== input.height || file.size_bytes !== input.sizeBytes) {
      throw Errors.dbError('装修效果素材文件暂存数据异常');
    }
    return file;
  }

  async activateSourceFile(tenantId: string, id: string): Promise<RenderingLibrarySourceFile> {
    const { data, error } = await this.client.from('platform_file_objects').update({ status: 'active' })
      .eq('tenant_id', tenantId).eq('id', id).eq('scene', RENDERING_LIBRARY_SOURCE_SCENE)
      .eq('status', 'migrating').eq('visibility', 'private').is('deleted_at', null).select(SOURCE_FIELDS).maybeSingle();
    if (error) throw Errors.dbError('启用装修效果素材文件失败');
    return this.parseSourceState(data, tenantId, id, 'active');
  }

  async create(tenantId: string, employeeId: string, input: RenderingLibraryCreate): Promise<RenderingLibraryStyle> {
    const { data, error } = await this.client.from('tenant_rendering_styles')
      .insert({ ...input, tenant_id: tenantId, created_by_employee_id: employeeId, status: 'draft' })
      .select(STYLE_FIELDS).single();
    if (error?.code === '23505') {
      throw Errors.business(409, '该原图已用于装修效果素材', 'RENDERING_STYLE_FILE_USED');
    }
    if (error) throw Errors.dbError('创建装修效果素材失败');
    return this.parseStyle(data, tenantId);
  }

  async change(tenantId: string, id: string, expectedVersion: number,
    changes: RenderingLibraryChanges): Promise<RenderingLibraryStyle | null> {
    const { data, error } = await this.client.from('tenant_rendering_styles')
      .update({ ...changes, version: expectedVersion + 1 }).eq('tenant_id', tenantId).eq('id', id)
      .eq('version', expectedVersion).is('deleted_at', null).select(STYLE_FIELDS).maybeSingle();
    if (error) throw Errors.dbError('更新装修效果素材失败');
    return data === null ? null : this.parseStyle(data, tenantId, id);
  }
}

export const tenantRenderingLibraryRepository = new TenantRenderingLibraryRepository();
