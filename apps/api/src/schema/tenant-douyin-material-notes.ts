import {
  DOUYIN_MATERIAL_NOTE_STATUS_VALUES,
  DouyinMaterialNoteContentBlocksSchema,
  DouyinMaterialNoteTenantDetailSchema,
  DouyinMaterialNoteTenantListSchema,
  DouyinMaterialNoteTenantVersionListSchema,
  DouyinMaterialNoteTenantVersionSchema,
  DouyinMaterialNoteVersionDraftSchema,
} from '@gooes/domain';
import { z } from 'zod';

import { PaginationQuerySchema } from '@/schema/request';

const ExpectedStatusSchema = z.enum(DOUYIN_MATERIAL_NOTE_STATUS_VALUES);
const ReasonSchema = z.string().trim()
  .min(1, '操作原因不能为空')
  .max(1_000, '操作原因不能超过 1000 个字符');

export const TenantDouyinMaterialNoteListQuerySchema =
  PaginationQuerySchema.extend({
    status: ExpectedStatusSchema.optional(),
    keyword: z.string().trim()
      .min(1, '关键词不能为空')
      .max(120, '关键词不能超过 120 个字符')
      .optional(),
  }).strict();

export const TenantDouyinMaterialNoteIdParamsSchema = z.strictObject({
  id: z.uuid('无效的资料 ID'),
});
export const TenantDouyinMaterialNoteVersionParamsSchema = z.strictObject({
  id: z.uuid('无效的资料 ID'),
  versionId: z.uuid('无效的资料版本 ID'),
});

export const CreateTenantDouyinMaterialNoteSchema =
  DouyinMaterialNoteVersionDraftSchema;
export const CreateTenantDouyinMaterialNoteVersionSchema =
  DouyinMaterialNoteVersionDraftSchema;

export const TenantDouyinMaterialNotePublishSchema = z.strictObject({
  version_id: z.uuid('无效的资料版本 ID'),
  expected_status: ExpectedStatusSchema,
});

const ReasonCommandShape = {
  expected_status: ExpectedStatusSchema,
  reason: ReasonSchema,
};

export const TenantDouyinMaterialNoteArchiveSchema =
  z.strictObject(ReasonCommandShape);
export const TenantDouyinMaterialNoteWithdrawSchema =
  z.strictObject(ReasonCommandShape);

export const TenantDouyinMaterialNoteCommandHeadersSchema = z.object({
  'idempotency-key': z.uuid('Idempotency-Key 格式无效'),
}).strip();

export const TenantDouyinMaterialNoteListResponseSchema =
  DouyinMaterialNoteTenantListSchema;
export const TenantDouyinMaterialNoteDetailResponseSchema =
  DouyinMaterialNoteTenantDetailSchema;
export const TenantDouyinMaterialNoteVersionListResponseSchema =
  DouyinMaterialNoteTenantVersionListSchema;
export const TenantDouyinMaterialNoteVersionDetailResponseSchema =
  DouyinMaterialNoteTenantVersionSchema;

export const TenantDouyinMaterialNoteCreateResultSchema = z.strictObject({
  note_id: z.uuid(),
  version_id: z.uuid(),
  version_no: z.number().int().positive(),
  status: z.literal('draft'),
});
export const TenantDouyinMaterialNoteAppendResultSchema =
  TenantDouyinMaterialNoteCreateResultSchema.extend({
    status: ExpectedStatusSchema,
  }).strict();
export const TenantDouyinMaterialNoteTransitionResultSchema = z.strictObject({
  note_id: z.uuid(),
  status: ExpectedStatusSchema,
  published_version_id: z.uuid().nullable(),
  published_at: z.iso.datetime({ offset: true }).nullable(),
}).superRefine((value, context) => {
  const hasPublishedVersion = value.published_version_id !== null;
  const hasPublishedAt = value.published_at !== null;
  const isInvalid = value.status === 'draft'
    ? hasPublishedVersion || hasPublishedAt
    : value.status === 'published'
      ? !hasPublishedVersion || !hasPublishedAt
      : hasPublishedVersion !== hasPublishedAt;
  if (isInvalid) {
    context.addIssue({
      code: 'custom',
      path: ['published_version_id'],
      message: '资料发布版本和时间组合无效',
    });
  }
});

const RepositoryDateTimeSchema = z.iso.datetime({ offset: true });
const RepositoryVersionPreviewShape = {
  version_no: z.number().int().positive(),
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(1_000),
  category: z.string().trim().min(1).max(100),
  applicable_to: z.string().trim().min(1).max(300).nullable(),
};
export const TenantDouyinMaterialNoteRepositoryVersionSchema = z.strictObject({
  id: z.uuid(),
  note_id: z.uuid(),
  ...RepositoryVersionPreviewShape,
  content_blocks: DouyinMaterialNoteContentBlocksSchema,
  created_by: z.uuid(),
  created_at: RepositoryDateTimeSchema,
});
export const TenantDouyinMaterialNoteRepositoryVersionSummarySchema =
  TenantDouyinMaterialNoteRepositoryVersionSchema.omit({
    content_blocks: true,
  }).strict();
const RepositoryLatestSummarySchema = z.strictObject({
  version_no: RepositoryVersionPreviewShape.version_no,
  title: RepositoryVersionPreviewShape.title,
  category: RepositoryVersionPreviewShape.category,
});
const RepositoryCountRelationSchema = z.strictObject({
  count: z.number().int().nonnegative(),
});
export const TenantDouyinMaterialNoteRepositoryListRowSchema = z.strictObject({
  id: z.uuid(),
  status: ExpectedStatusSchema,
  published_at: RepositoryDateTimeSchema.nullable(),
  updated_at: RepositoryDateTimeSchema,
  latest_versions: z.array(RepositoryLatestSummarySchema).length(1),
  claims: z.array(RepositoryCountRelationSchema).length(1),
});
export const TenantDouyinMaterialNoteRepositorySearchListRowSchema =
  TenantDouyinMaterialNoteRepositoryListRowSchema.extend({
    search_versions: z.array(z.strictObject({ id: z.uuid() })).max(1),
  }).strict();
export const TenantDouyinMaterialNoteRepositoryDetailRowSchema = z.strictObject({
  id: z.uuid(),
  status: ExpectedStatusSchema,
  published_version_id: z.uuid().nullable(),
  published_at: RepositoryDateTimeSchema.nullable(),
  created_at: RepositoryDateTimeSchema,
  updated_at: RepositoryDateTimeSchema,
  latest_versions: z.array(
    TenantDouyinMaterialNoteRepositoryVersionSummarySchema,
  ).length(1),
  claims: z.array(RepositoryCountRelationSchema).length(1),
});

export type TenantDouyinMaterialNoteListQuery = z.infer<
  typeof TenantDouyinMaterialNoteListQuerySchema
>;
export type CreateTenantDouyinMaterialNoteInput = z.infer<
  typeof CreateTenantDouyinMaterialNoteSchema
>;
export type CreateTenantDouyinMaterialNoteVersionInput = z.infer<
  typeof CreateTenantDouyinMaterialNoteVersionSchema
>;
export type TenantDouyinMaterialNotePublishInput = z.infer<
  typeof TenantDouyinMaterialNotePublishSchema
>;
export type TenantDouyinMaterialNoteReasonCommandInput = z.infer<
  typeof TenantDouyinMaterialNoteArchiveSchema
>;
