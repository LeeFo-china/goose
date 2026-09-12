import { z } from 'zod';
import { RenderingLibraryCreateSchema, RenderingLibraryStyleSchema, RENDERING_UPLOAD_MAX_BYTES, RENDERING_BATCH_UPLOAD_LIMIT,
  type RenderingLibraryStyle } from '@gooes/domain';
import type { AdminPermission } from '@/lib/backend';

export interface LibraryAccess { canRead: boolean; canManage: boolean }
type AccessIdentity = { tenant: { id: string } | null; employee: { id: string | null }; permissions: AdminPermission[] };
export function getLibraryAccess(session: AccessIdentity | null): LibraryAccess {
  const employee = Boolean(session?.tenant?.id && session.employee?.id);
  const all = (code: string) => Boolean(session?.permissions.some((permission) => permission.code === code && permission.scope === 'all'));
  const canRead = employee && all('rendering_library.read');
  return { canRead, canManage: canRead && all('rendering_library.manage') };
}
export const SPACE_LABELS: Record<RenderingLibraryStyle['space'], string> = { living_room: '客厅', bedroom: '卧室' };
export const STYLE_LABELS: Record<RenderingLibraryStyle['style'], string> = {
  modern_simple: '现代简约', cream: '奶油风', new_chinese: '新中式', nordic: '北欧', light_luxury: '轻奢',
  natural_wood: '原木风', american: '美式', french: '法式', wabi_sabi: '侘寂风',
};
export const SOURCE_LABELS: Record<RenderingLibraryStyle['source_type'], string> = { real_case: '实景案例', design: '设计效果图', ai_concept: 'AI 概念图' };
export const STATUS_LABELS = { draft: '草稿', published: '已发布', hidden: '已隐藏' } as const;
export const StyleFieldsSchema = RenderingLibraryCreateSchema.omit({ file_id: true, rights_confirmed: true });
export type StyleFieldsValue = z.infer<typeof StyleFieldsSchema>;
export const DEFAULT_STYLE_FIELDS: StyleFieldsValue = { title: '', space: 'living_room', style: 'modern_simple', source_type: 'design',
  color_notes: '', material_notes: '', sort_order: 0 };
export const LibraryListResultSchema = z.strictObject({
  list: z.array(RenderingLibraryStyleSchema).max(100),
  pagination: z.strictObject({ page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() }),
}).refine(({ list, pagination }) => list.length <= pagination.pageSize && pagination.totalPages === Math.ceil(pagination.total / pagination.pageSize));
export type LibraryListResult = z.infer<typeof LibraryListResultSchema>;
export function validateUploadFiles(files: File[]): string | null {
  if (!files.length || files.length > RENDERING_BATCH_UPLOAD_LIMIT) return '每次请选择 1-20 张图片';
  const mimeExtensions: Record<string, string[]> = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] };
  for (const file of files) {
    if (!mimeExtensions[file.type]?.includes(file.name.split('.').pop()?.toLowerCase() ?? '')) return '仅支持 JPG、PNG、WebP 图片，文件类型必须与扩展名一致';
    if (file.size <= 0 || file.size > RENDERING_UPLOAD_MAX_BYTES) return '每张图片必须大于 0 字节且不超过 10 MiB';
  }
  return null;
}
export function toStyleFields(style: RenderingLibraryStyle): StyleFieldsValue {
  return { title: style.title, space: style.space, style: style.style, source_type: style.source_type,
    color_notes: style.color_notes, material_notes: style.material_notes, sort_order: style.sort_order };
}
export function fieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0] ?? ''), issue.message]));
}
