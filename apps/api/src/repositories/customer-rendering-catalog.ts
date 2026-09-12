import { z } from 'zod';
import {
  RenderingPublishedStyleSchema,
  type RenderingListQuery,
  type RenderingPublishedStyle,
} from '@gooes/domain';
import { AppError } from '@/errors/app-error';
import { Errors } from '@/errors/error-factory';
import { SupabaseDB } from '@/utils/supabase';

export type CustomerRenderingCatalogDatabaseClient = Pick<ReturnType<typeof SupabaseDB.getAdminClient>, 'from'>;

export interface CustomerRenderingCatalogRows {
  readonly rows: RenderingPublishedStyle[];
  readonly total: number;
}

const PUBLIC_FIELDS = 'id,published_title,published_space,published_style,'
  + 'published_color_notes,published_material_notes,published_source_type,'
  + 'published_at,published_file:platform_file_objects!tenant_rendering_styles_published_file_fkey(public_url)';

const PublishedRowSchema = z.strictObject({
  id: z.uuid(),
  published_title: RenderingPublishedStyleSchema.shape.title,
  published_space: RenderingPublishedStyleSchema.shape.space,
  published_style: RenderingPublishedStyleSchema.shape.style,
  published_color_notes: RenderingPublishedStyleSchema.shape.color_notes,
  published_material_notes: RenderingPublishedStyleSchema.shape.material_notes,
  published_source_type: RenderingPublishedStyleSchema.shape.source_type,
  published_at: RenderingPublishedStyleSchema.shape.published_at,
  published_file: z.strictObject({
    public_url: RenderingPublishedStyleSchema.shape.image_url,
  }),
});

function parsePublishedStyle(raw: unknown, id?: string): RenderingPublishedStyle {
  const parsed = PublishedRowSchema.safeParse(raw);
  if (!parsed.success || (id !== undefined && parsed.data.id !== id)) {
    throw Errors.dbError('公开装修效果素材数据格式异常');
  }
  const row = parsed.data;
  return RenderingPublishedStyleSchema.parse({
    id: row.id,
    title: row.published_title,
    space: row.published_space,
    style: row.published_style,
    color_notes: row.published_color_notes,
    material_notes: row.published_material_notes,
    source_type: row.published_source_type,
    image_url: row.published_file.public_url,
    published_at: row.published_at,
  });
}

export class CustomerRenderingCatalogRepository {
  constructor(private readonly client: CustomerRenderingCatalogDatabaseClient = SupabaseDB.getAdminClient()) {}

  async list(tenantId: string, input: RenderingListQuery): Promise<CustomerRenderingCatalogRows> {
    try {
      let query = this.client.from('tenant_rendering_styles').select(PUBLIC_FIELDS, { count: 'exact' })
        .eq('tenant_id', tenantId).eq('status', 'published').is('deleted_at', null);
      if (input.space) query = query.eq('published_space', input.space);
      if (input.style) query = query.eq('published_style', input.style);
      const offset = (input.page - 1) * input.pageSize;
      const { data, error, count } = await query.order('sort_order', { ascending: true })
        .order('id', { ascending: true }).range(offset, offset + input.pageSize - 1);
      if (error) throw Errors.dbError('读取公开装修效果素材失败');
      if (!Array.isArray(data) || count === null || !Number.isSafeInteger(count) || count < 0
        || data.length > input.pageSize) {
        throw Errors.dbError('公开装修效果素材分页数据格式异常');
      }
      const rows = data.map((row) => parsePublishedStyle(row));
      if (new Set(rows.map((row) => row.id)).size !== rows.length) {
        throw Errors.dbError('公开装修效果素材分页数据格式异常');
      }
      return { rows, total: count };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw Errors.dbError('读取公开装修效果素材失败');
    }
  }

  async find(tenantId: string, id: string): Promise<RenderingPublishedStyle | null> {
    try {
      const { data, error } = await this.client.from('tenant_rendering_styles').select(PUBLIC_FIELDS)
        .eq('tenant_id', tenantId).eq('id', id).eq('status', 'published')
        .is('deleted_at', null).maybeSingle();
      if (error) throw Errors.dbError('读取公开装修效果素材失败');
      return data === null ? null : parsePublishedStyle(data, id);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw Errors.dbError('读取公开装修效果素材失败');
    }
  }
}

export const customerRenderingCatalogRepository = new CustomerRenderingCatalogRepository();
