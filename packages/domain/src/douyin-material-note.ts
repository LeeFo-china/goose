import { z } from 'zod';

import {
  SiteContentDraftCalloutBlockSchema,
  SiteContentDraftHeadingBlockSchema,
  SiteContentDraftListBlockSchema,
  SiteContentDraftParagraphBlockSchema,
  SiteContentDraftQuoteBlockSchema,
  SiteContentPaginationSchema,
} from './site-content';

export const DOUYIN_MATERIAL_NOTE_STATUS_VALUES = [
  'draft',
  'published',
  'archived',
  'withdrawn',
] as const;

export const DOUYIN_MATERIAL_NOTE_BLOCK_TYPE_VALUES = [
  'heading',
  'paragraph',
  'list',
  'quote',
  'callout',
  'image',
] as const;

export const DOUYIN_MATERIAL_NOTE_ERROR_CODE_VALUES = [
  'MATERIAL_NOTE_NOT_FOUND',
  'MATERIAL_NOTE_NOT_AVAILABLE',
  'MATERIAL_NOTE_WITHDRAWN',
  'MATERIAL_NOTE_CLAIM_NOT_FOUND',
  'MATERIAL_NOTE_VERSION_CONFLICT',
  'MATERIAL_NOTE_STATE_CONFLICT',
] as const;

export const DOUYIN_MATERIAL_NOTE_CATEGORY_STATUS_VALUES = [
  'active',
  'disabled',
] as const;

export const DouyinMaterialNoteStatusSchema = z.enum(
  DOUYIN_MATERIAL_NOTE_STATUS_VALUES,
);
export const DouyinMaterialNoteCategoryStatusSchema = z.enum(
  DOUYIN_MATERIAL_NOTE_CATEGORY_STATUS_VALUES,
);

const MAX_BLOCK_COUNT = 100;
const MAX_BLOCKS_UTF8_BYTES = 512 * 1024;
const MAX_SHORT_TEXT_LENGTH = 300;
const MAX_CAPTION_LENGTH = 1_000;

const IdSchema = z.uuid();
const NonEmptyShortTextSchema = z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH);
const CaptionSchema = z.string().trim().min(1).max(MAX_CAPTION_LENGTH);
const utf8Encoder = new TextEncoder();
const getSerializedUtf8ByteLength = (value: unknown): number =>
  utf8Encoder.encode(JSON.stringify(value)).byteLength;

export const DouyinMaterialNoteDraftImageBlockSchema = z.strictObject({
  type: z.literal('image'),
  fileId: IdSchema,
  alt: NonEmptyShortTextSchema,
  caption: CaptionSchema.optional(),
});

export const DouyinMaterialNoteBlockSchema = z.discriminatedUnion('type', [
  SiteContentDraftHeadingBlockSchema,
  SiteContentDraftParagraphBlockSchema,
  SiteContentDraftListBlockSchema,
  SiteContentDraftQuoteBlockSchema,
  SiteContentDraftCalloutBlockSchema,
  DouyinMaterialNoteDraftImageBlockSchema,
]);

export const DouyinMaterialNoteContentBlocksSchema = z
  .array(DouyinMaterialNoteBlockSchema)
  .max(MAX_BLOCK_COUNT)
  .superRefine((blocks, context) => {
    if (getSerializedUtf8ByteLength(blocks) <= MAX_BLOCKS_UTF8_BYTES) return;
    context.addIssue({
      code: 'custom',
      message: '内容块总大小不能超过 512 KiB',
    });
  });

export const DouyinMaterialNotePublicAssetSchema = z.strictObject({
  fileId: IdSchema,
  src: z.url({ protocol: /^https$/ }).max(2_048),
  alt: NonEmptyShortTextSchema,
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
});

export const DouyinMaterialNotePublicImageBlockSchema = z.strictObject({
  type: z.literal('image'),
  asset: DouyinMaterialNotePublicAssetSchema,
  caption: CaptionSchema.optional(),
});

export const DouyinMaterialNotePublicBlockSchema = z.discriminatedUnion('type', [
  SiteContentDraftHeadingBlockSchema,
  SiteContentDraftParagraphBlockSchema,
  SiteContentDraftListBlockSchema,
  SiteContentDraftQuoteBlockSchema,
  SiteContentDraftCalloutBlockSchema,
  DouyinMaterialNotePublicImageBlockSchema,
]);

export const DouyinMaterialNotePublicContentBlocksSchema = z
  .array(DouyinMaterialNotePublicBlockSchema)
  .max(MAX_BLOCK_COUNT)
  .superRefine((blocks, context) => {
    if (getSerializedUtf8ByteLength(blocks) <= MAX_BLOCKS_UTF8_BYTES) return;
      context.addIssue({
        code: 'custom',
        message: '内容块总大小不能超过 512 KiB',
      });
  });

const TitleSchema = z.string().trim().min(1).max(300);
const SummarySchema = z.string().trim().min(1).max(1_000);
const CategorySchema = z.string().trim().min(1).max(100);
const ApplicableToSchema = z.string().trim().min(1).max(300).nullable();
const TimestampSchema = z.iso.datetime({ offset: true });

const VersionContentShape = {
  title: TitleSchema,
  summary: SummarySchema,
  category: CategorySchema,
  category_id: IdSchema.nullable().optional(),
  applicable_to: ApplicableToSchema,
  content_blocks: DouyinMaterialNoteContentBlocksSchema,
};

export const DouyinMaterialNoteVersionDraftSchema = z.strictObject(
  VersionContentShape,
);

const PublicPreviewShape = {
  id: IdSchema,
  title: TitleSchema,
  summary: SummarySchema,
  category: CategorySchema,
  category_id: IdSchema.nullable().optional(),
  applicable_to: ApplicableToSchema,
  published_at: TimestampSchema,
  claimed: z.boolean(),
};

export const DouyinMaterialNotePublicPreviewSchema = z.strictObject(
  PublicPreviewShape,
);

export const DouyinMaterialNoteUnclaimedDetailSchema = z.strictObject(
  PublicPreviewShape,
);

const ClaimedMaterialShape = {
  id: IdSchema,
  version: z.number().int().positive(),
  title: TitleSchema,
  summary: SummarySchema,
  category: CategorySchema,
  category_id: IdSchema.nullable().optional(),
  applicable_to: ApplicableToSchema,
  content_blocks: DouyinMaterialNotePublicContentBlocksSchema,
};

export const DouyinMaterialNoteClaimedMaterialSchema = z.strictObject(
  ClaimedMaterialShape,
);

export const DouyinMaterialNoteClaimResponseSchema = z.strictObject({
  claim_id: IdSchema,
  already_claimed: z.boolean(),
  claimed_at: TimestampSchema,
  material: DouyinMaterialNoteClaimedMaterialSchema,
});

const OwnedSummaryShape = {
  claim_id: IdSchema,
  id: IdSchema,
  version: z.number().int().positive(),
  title: TitleSchema,
  summary: SummarySchema,
  category: CategorySchema,
  category_id: IdSchema.nullable().optional(),
  applicable_to: ApplicableToSchema,
  claimed_at: TimestampSchema,
};

export const DouyinMaterialNoteOwnedSummarySchema = z.strictObject(
  OwnedSummaryShape,
);

export const DouyinMaterialNoteOwnedDetailSchema = z.strictObject({
  ...OwnedSummaryShape,
  content_blocks: DouyinMaterialNotePublicContentBlocksSchema,
});

export const DouyinMaterialNoteTenantVersionSchema = z.strictObject({
  id: IdSchema,
  note_id: IdSchema,
  version: z.number().int().positive(),
  ...VersionContentShape,
  created_by: IdSchema,
  created_at: TimestampSchema,
});

export const DouyinMaterialNoteTenantVersionSummarySchema =
  DouyinMaterialNoteTenantVersionSchema.omit({ content_blocks: true }).strict();

const TenantSummaryShape = {
  id: IdSchema,
  status: DouyinMaterialNoteStatusSchema,
  title: TitleSchema,
  category: CategorySchema,
  category_id: IdSchema.nullable().optional(),
  current_version: z.number().int().positive(),
  claim_count: z.number().int().nonnegative(),
  published_at: TimestampSchema.nullable(),
  updated_at: TimestampSchema,
};

export const DouyinMaterialNoteTenantSummarySchema = z.strictObject(
  TenantSummaryShape,
);

export const DouyinMaterialNoteTenantDetailSchema = z
  .strictObject({
    ...TenantSummaryShape,
    published_version_id: IdSchema.nullable(),
    latest_version: DouyinMaterialNoteTenantVersionSummarySchema,
    created_at: TimestampSchema,
  })
  .superRefine(({ id, latest_version }, context) => {
    if (latest_version.note_id !== id) {
      context.addIssue({
        code: 'custom',
        path: ['latest_version', 'note_id'],
        message: '最新版本必须属于当前资料',
      });
    }
  });

export const DouyinMaterialNotePaginationSchema =
  SiteContentPaginationSchema;

export const DouyinMaterialNoteCategorySchema = z.strictObject({
  id: IdSchema,
  name: CategorySchema,
  description: z.string().trim().min(1).max(300).nullable(),
  status: DouyinMaterialNoteCategoryStatusSchema,
  sort_order: z.number().int().min(0).max(100_000),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});

const createMaterialNoteListSchema = <ItemSchema extends z.ZodType>(
  itemSchema: ItemSchema,
) =>
  z
    .strictObject({
      list: z.array(itemSchema).max(100),
      pagination: DouyinMaterialNotePaginationSchema,
    })
    .superRefine(({ list, pagination }, context) => {
      const { page, pageSize, total, totalPages } = pagination;
      const expectedTotalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

      if (totalPages !== expectedTotalPages) {
        context.addIssue({
          code: 'custom',
          path: ['pagination', 'totalPages'],
          message: '总页数与总条数不一致',
        });
      }
      if (list.length > pageSize) {
        context.addIssue({
          code: 'custom',
          path: ['list'],
          message: '列表条数不能超过每页条数',
        });
      }

      if (total === 0) {
        if (list.length !== 0) {
          context.addIssue({
            code: 'custom',
            path: ['list'],
            message: '总条数为 0 时列表必须为空',
          });
        }
        return;
      }

      if (list.length > total) {
        context.addIssue({
          code: 'custom',
          path: ['list'],
          message: '列表条数不能超过总条数',
        });
      }
      if (page > expectedTotalPages) {
        if (list.length !== 0) {
          context.addIssue({
            code: 'custom',
            path: ['list'],
            message: '超过总页数时列表必须为空',
          });
        }
        return;
      }

      const remainingItemCount = total - (page - 1) * pageSize;
      const expectedItemCount = Math.min(pageSize, remainingItemCount);
      if (list.length !== expectedItemCount) {
        context.addIssue({
          code: 'custom',
          path: ['list'],
          message: '列表条数必须与当前页应返回条数一致',
        });
      }
    });

export const DouyinMaterialNotePublicListSchema =
  createMaterialNoteListSchema(DouyinMaterialNotePublicPreviewSchema);

export const DouyinMaterialNoteOwnedListSchema =
  createMaterialNoteListSchema(DouyinMaterialNoteOwnedSummarySchema);

export const DouyinMaterialNoteTenantListSchema =
  createMaterialNoteListSchema(DouyinMaterialNoteTenantSummarySchema);

export const DouyinMaterialNoteTenantVersionListSchema =
  createMaterialNoteListSchema(DouyinMaterialNoteTenantVersionSummarySchema);

export const DouyinMaterialNoteCategoryListSchema =
  createMaterialNoteListSchema(DouyinMaterialNoteCategorySchema);

export type DouyinMaterialNoteStatus =
  (typeof DOUYIN_MATERIAL_NOTE_STATUS_VALUES)[number];
export type DouyinMaterialNoteCategoryStatus =
  (typeof DOUYIN_MATERIAL_NOTE_CATEGORY_STATUS_VALUES)[number];
export type DouyinMaterialNoteBlockType =
  (typeof DOUYIN_MATERIAL_NOTE_BLOCK_TYPE_VALUES)[number];
export type DouyinMaterialNoteErrorCode =
  (typeof DOUYIN_MATERIAL_NOTE_ERROR_CODE_VALUES)[number];
export type DouyinMaterialNoteBlock = z.infer<
  typeof DouyinMaterialNoteBlockSchema
>;
export type DouyinMaterialNotePublicBlock = z.infer<
  typeof DouyinMaterialNotePublicBlockSchema
>;
export type DouyinMaterialNoteContentBlocks = z.infer<
  typeof DouyinMaterialNoteContentBlocksSchema
>;
export type DouyinMaterialNotePublicContentBlocks = z.infer<
  typeof DouyinMaterialNotePublicContentBlocksSchema
>;
export type DouyinMaterialNoteVersionDraft = z.infer<
  typeof DouyinMaterialNoteVersionDraftSchema
>;
export type DouyinMaterialNotePublicPreview = z.infer<
  typeof DouyinMaterialNotePublicPreviewSchema
>;
export type DouyinMaterialNoteUnclaimedDetail = z.infer<
  typeof DouyinMaterialNoteUnclaimedDetailSchema
>;
export type DouyinMaterialNoteClaimedMaterial = z.infer<
  typeof DouyinMaterialNoteClaimedMaterialSchema
>;
export type DouyinMaterialNoteClaimResponse = z.infer<
  typeof DouyinMaterialNoteClaimResponseSchema
>;
export type DouyinMaterialNoteOwnedSummary = z.infer<
  typeof DouyinMaterialNoteOwnedSummarySchema
>;
export type DouyinMaterialNoteOwnedDetail = z.infer<
  typeof DouyinMaterialNoteOwnedDetailSchema
>;
export type DouyinMaterialNoteTenantSummary = z.infer<
  typeof DouyinMaterialNoteTenantSummarySchema
>;
export type DouyinMaterialNoteTenantDetail = z.infer<
  typeof DouyinMaterialNoteTenantDetailSchema
>;
export type DouyinMaterialNoteTenantVersion = z.infer<
  typeof DouyinMaterialNoteTenantVersionSchema
>;
export type DouyinMaterialNoteTenantVersionSummary = z.infer<
  typeof DouyinMaterialNoteTenantVersionSummarySchema
>;
export type DouyinMaterialNotePagination = z.infer<
  typeof DouyinMaterialNotePaginationSchema
>;
export type DouyinMaterialNoteCategory = z.infer<
  typeof DouyinMaterialNoteCategorySchema
>;
export type DouyinMaterialNotePublicList = z.infer<
  typeof DouyinMaterialNotePublicListSchema
>;
export type DouyinMaterialNoteOwnedList = z.infer<
  typeof DouyinMaterialNoteOwnedListSchema
>;
export type DouyinMaterialNoteTenantList = z.infer<
  typeof DouyinMaterialNoteTenantListSchema
>;
export type DouyinMaterialNoteTenantVersionList = z.infer<
  typeof DouyinMaterialNoteTenantVersionListSchema
>;
export type DouyinMaterialNoteCategoryList = z.infer<
  typeof DouyinMaterialNoteCategoryListSchema
>;
