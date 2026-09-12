import { z } from 'zod';
import { RenderingListQuerySchema, RenderingStyleInputSchema, RENDERING_UPLOAD_MAX_BYTES } from './customer-rendering';

export const RENDERING_LIBRARY_SOURCE_SCENE = 'rendering_style_source';
export const RENDERING_LIBRARY_PUBLIC_SCENE = 'rendering_style_public';
export const RENDERING_LIBRARY_STATUS_VALUES = ['draft', 'published', 'hidden'] as const;
export const RENDERING_LIBRARY_PREVIEW_BATCH_MAX = 100;

export const RenderingLibraryFileUploadResultSchema = z.strictObject({
  file_id: z.uuid(), mime_type: z.literal('image/webp'),
  size_bytes: z.number().int().positive().max(RENDERING_UPLOAD_MAX_BYTES),
  width: z.number().int().positive(), height: z.number().int().positive(),
});
export const RenderingLibraryFilePreviewResultSchema = z.strictObject({
  file_id: z.uuid(), url: z.url({ protocol: /^https$/ }),
  expires_at: z.string().datetime({ offset: true }),
});
export type RenderingLibraryFileUploadResult = z.infer<typeof RenderingLibraryFileUploadResultSchema>;
export type RenderingLibraryFilePreviewResult = z.infer<typeof RenderingLibraryFilePreviewResultSchema>;

export const RenderingLibraryBatchPreviewSchema = z.strictObject({
  file_ids: z.array(z.uuid()).min(1).max(RENDERING_LIBRARY_PREVIEW_BATCH_MAX)
    .refine((ids) => new Set(ids).size === ids.length, '文件 ID 不得重复'),
});
export const RenderingLibraryBatchPreviewResultSchema = z.strictObject({
  items: z.array(RenderingLibraryFilePreviewResultSchema).min(1).max(RENDERING_LIBRARY_PREVIEW_BATCH_MAX),
});
export type RenderingLibraryBatchPreview = z.infer<typeof RenderingLibraryBatchPreviewSchema>;
export type RenderingLibraryBatchPreviewResult = z.infer<typeof RenderingLibraryBatchPreviewResultSchema>;

const StatusSchema = z.enum(RENDERING_LIBRARY_STATUS_VALUES);
const ExpectedVersionSchema = z.number().int().min(1).max(2147483646);
const styleFields = RenderingStyleInputSchema.shape;

export const RenderingLibraryListSchema = RenderingListQuerySchema.extend({
  status: StatusSchema.optional(),
});

export const RenderingLibraryCreateSchema = RenderingStyleInputSchema;

export const RenderingLibraryUpdateSchema = z.strictObject({
  title: styleFields.title.optional(),
  space: styleFields.space.optional(),
  style: styleFields.style.optional(),
  // Creation defaults must not erase fields omitted from a partial update.
  color_notes: styleFields.color_notes.removeDefault().optional(),
  material_notes: styleFields.material_notes.removeDefault().optional(),
  source_type: styleFields.source_type.optional(),
  sort_order: styleFields.sort_order.removeDefault().optional(),
  expected_version: ExpectedVersionSchema,
}).refine(
  ({ expected_version: _expectedVersion, ...fields }) => Object.values(fields).some((value) => value !== undefined),
  { message: '请至少提供一个需要更新的素材字段' },
);

export const RenderingLibraryVersionSchema = z.strictObject({
  expected_version: ExpectedVersionSchema,
});

export const RenderingLibraryPublishSchema = z.strictObject({
  expected_version: ExpectedVersionSchema,
  idempotency_key: z.uuid(),
  responsibility_confirmed: z.literal(true),
});

export const RenderingPublishedStyleSchema = z.strictObject({
  id: z.uuid(),
  title: styleFields.title,
  space: styleFields.space,
  style: styleFields.style,
  color_notes: styleFields.color_notes.removeDefault(),
  material_notes: styleFields.material_notes.removeDefault(),
  source_type: styleFields.source_type,
  image_url: z.url({ protocol: /^https$/ }),
  published_at: z.string().datetime({ offset: true }),
});

export const RenderingPublishedStyleListSchema = z.strictObject({
  list: z.array(RenderingPublishedStyleSchema).max(100),
  pagination: z.strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
}).refine(({ list, pagination }) =>
  list.length <= pagination.pageSize
  && pagination.totalPages === Math.ceil(pagination.total / pagination.pageSize));

export const RenderingLibraryStyleSchema = RenderingStyleInputSchema.extend({
  id: z.uuid(),
  tenant_id: z.uuid(),
  status: StatusSchema,
  version: z.number().int().min(1).max(2147483647),
  created_by_employee_id: z.uuid().nullable(),
  published_version: z.number().int().min(1).max(2147483647).nullable(),
  published_at: z.string().datetime({ offset: true }).nullable(),
  published_by_employee_id: z.uuid().nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type RenderingLibraryList = z.infer<typeof RenderingLibraryListSchema>;
export type RenderingLibraryCreate = z.infer<typeof RenderingLibraryCreateSchema>;
export type RenderingLibraryUpdate = z.infer<typeof RenderingLibraryUpdateSchema>;
export type RenderingLibraryVersion = z.infer<typeof RenderingLibraryVersionSchema>;
export type RenderingLibraryPublish = z.infer<typeof RenderingLibraryPublishSchema>;
export type RenderingPublishedStyle = z.infer<typeof RenderingPublishedStyleSchema>;
export type RenderingPublishedStyleList = z.infer<typeof RenderingPublishedStyleListSchema>;
export type RenderingLibraryStyle = z.infer<typeof RenderingLibraryStyleSchema>;
