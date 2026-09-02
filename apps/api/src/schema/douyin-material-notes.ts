import {
  DOUYIN_MATERIAL_NOTE_STATUS_VALUES,
  DouyinMaterialNoteClaimResponseSchema,
  DouyinMaterialNoteContentBlocksSchema,
  DouyinMaterialNoteOwnedDetailSchema,
  DouyinMaterialNoteOwnedListSchema,
  DouyinMaterialNotePublicListSchema,
  DouyinMaterialNoteUnclaimedDetailSchema,
} from '@gooes/domain';
import { z } from 'zod';

import { PaginationQuerySchema } from '@/schema/request';

const KeywordSchema = z.string().trim()
  .min(1, '关键词不能为空')
  .max(120, '关键词不能超过 120 个字符');

export const DouyinMaterialNoteListQuerySchema = PaginationQuerySchema.extend({
  keyword: KeywordSchema.optional(),
}).strict();

export const DouyinMaterialNoteIdParamsSchema = z.strictObject({
  id: z.uuid('无效的资料 ID'),
});

export const DouyinMaterialNoteClaimIdParamsSchema = z.strictObject({
  claimId: z.uuid('无效的领取记录 ID'),
});

export const DouyinMaterialNoteEmptyCommandSchema = z.strictObject({});

export const DouyinMaterialNotePublicListResponseSchema =
  DouyinMaterialNotePublicListSchema;
export const DouyinMaterialNotePreviewResponseSchema =
  DouyinMaterialNoteUnclaimedDetailSchema;
export const DouyinMaterialNoteClaimCommandResponseSchema =
  DouyinMaterialNoteClaimResponseSchema;
export const DouyinMaterialNoteOwnedListResponseSchema =
  DouyinMaterialNoteOwnedListSchema;
export const DouyinMaterialNoteOwnedDetailResponseSchema =
  DouyinMaterialNoteOwnedDetailSchema;
export const DouyinMaterialNoteRemoveResponseSchema = z.strictObject({
  removed: z.literal(true),
});
export const DouyinMaterialNoteClearResponseSchema = z.strictObject({
  removed_count: z.number().int().nonnegative(),
});
export const DouyinMaterialNoteErasureResultSchema = z.strictObject({
  deleted_claim_count: z.number().int().nonnegative(),
  deleted_event_count: z.number().int().nonnegative(),
});

const RepositoryDateTimeSchema = z.iso.datetime({ offset: true });
export const DouyinMaterialNoteRepositoryPreviewVersionSchema = z.strictObject({
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(1_000),
  category: z.string().trim().min(1).max(100),
  category_id: z.uuid().nullable().optional(),
  applicable_to: z.string().trim().min(1).max(300).nullable(),
});
export const DouyinMaterialNoteRepositoryPublicRowSchema = z.strictObject({
  id: z.uuid(),
  published_at: RepositoryDateTimeSchema,
  published_version: DouyinMaterialNoteRepositoryPreviewVersionSchema,
  claims: z.array(z.strictObject({ id: z.uuid() })).max(1),
});
export const DouyinMaterialNoteRepositoryOwnedRowSchema = z.strictObject({
  id: z.uuid(),
  claimed_at: RepositoryDateTimeSchema,
  note: z.strictObject({
    id: z.uuid(),
    status: z.enum(DOUYIN_MATERIAL_NOTE_STATUS_VALUES),
  }),
  claimed_version: DouyinMaterialNoteRepositoryPreviewVersionSchema.extend({
    version_no: z.number().int().positive(),
  }).strict(),
});
export const DouyinMaterialNoteRepositoryOwnedAccessRowSchema = z.strictObject({
  id: z.uuid(),
  note: z.strictObject({
    id: z.uuid(),
    status: z.enum(DOUYIN_MATERIAL_NOTE_STATUS_VALUES),
  }),
});
export const DouyinMaterialNoteRepositoryOwnedDetailRowSchema =
  DouyinMaterialNoteRepositoryOwnedRowSchema.extend({
    claimed_version: DouyinMaterialNoteRepositoryPreviewVersionSchema.extend({
      version_no: z.number().int().positive(),
      content_blocks: DouyinMaterialNoteContentBlocksSchema,
    }).strict(),
  }).strict();
export const DouyinMaterialNoteRepositoryClaimResponseSchema = z.strictObject({
  claim_id: z.uuid(),
  already_claimed: z.boolean(),
  claimed_at: RepositoryDateTimeSchema,
  material: DouyinMaterialNoteRepositoryPreviewVersionSchema.extend({
    id: z.uuid(),
    version: z.number().int().positive(),
    content_blocks: DouyinMaterialNoteContentBlocksSchema,
  }).strict(),
});
export const DouyinMaterialNoteRepositoryImageAssetRowSchema = z.strictObject({
  id: z.uuid(),
  tenant_id: z.uuid(),
  public_url: z.string().nullable(),
  object_key: z.string().trim().min(1).nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  mime_type: z.string().trim().min(1),
  status: z.string(),
  visibility: z.string(),
});

export type DouyinMaterialNoteListQuery = z.infer<
  typeof DouyinMaterialNoteListQuerySchema
>;
export type DouyinMaterialNoteIdParams = z.infer<
  typeof DouyinMaterialNoteIdParamsSchema
>;
export type DouyinMaterialNoteClaimIdParams = z.infer<
  typeof DouyinMaterialNoteClaimIdParamsSchema
>;
export type DouyinMaterialNoteRepositoryClaimResponse = z.infer<
  typeof DouyinMaterialNoteRepositoryClaimResponseSchema
>;
export type DouyinMaterialNoteRepositoryImageAssetRow = z.infer<
  typeof DouyinMaterialNoteRepositoryImageAssetRowSchema
>;
