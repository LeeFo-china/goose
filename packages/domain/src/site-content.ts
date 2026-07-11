import { z } from 'zod';

export const SITE_CONTENT_TYPE_VALUES = ['article', 'case', 'city'] as const;

export const SITE_CONTENT_STATUS_VALUES = [
  'draft',
  'published',
  'archived',
] as const;

export const SITE_CONTENT_DRAFT_BLOCK_TYPE_VALUES = [
  'paragraph',
  'heading',
  'image',
  'quote',
  'list',
  'callout',
  'metrics',
  'gallery',
] as const;

const MAX_BLOCK_COUNT = 100;
const MAX_BLOCKS_UTF8_BYTES = 512 * 1024;
const MAX_TEXT_LENGTH = 20_000;
const MAX_SHORT_TEXT_LENGTH = 300;
const MAX_LIST_ITEM_LENGTH = 2_000;
const MAX_LIST_ITEM_COUNT = 50;
const MAX_METRIC_COUNT = 24;
const MAX_GALLERY_IMAGE_COUNT = 50;

const NonEmptyShortTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SHORT_TEXT_LENGTH);
const NonEmptyTextSchema = z.string().trim().min(1).max(MAX_TEXT_LENGTH);
const NonEmptyListItemSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_LIST_ITEM_LENGTH);
const FileIdSchema = z.uuid();
const HttpUrlSchema = z.url({ protocol: /^https?$/ }).max(2_048);
const utf8Encoder = new TextEncoder();

const getSerializedUtf8ByteLength = (value: unknown): number =>
  utf8Encoder.encode(JSON.stringify(value)).byteLength;

const SiteContentDraftImageSchema = z.strictObject({
  fileId: FileIdSchema,
  alt: NonEmptyShortTextSchema,
});

const SiteContentMetricSchema = z.strictObject({
  label: NonEmptyShortTextSchema,
  value: NonEmptyShortTextSchema,
});

export const SiteContentDraftBlockSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('paragraph'),
    text: NonEmptyTextSchema,
  }),
  z.strictObject({
    type: z.literal('heading'),
    level: z.union([z.literal(2), z.literal(3)]),
    text: NonEmptyShortTextSchema,
  }),
  SiteContentDraftImageSchema.extend({
    type: z.literal('image'),
  }),
  z.strictObject({
    type: z.literal('quote'),
    text: NonEmptyTextSchema,
    attribution: NonEmptyShortTextSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('list'),
    style: z.enum(['ordered', 'unordered']),
    items: z
      .array(NonEmptyListItemSchema)
      .min(1)
      .max(MAX_LIST_ITEM_COUNT),
  }),
  z.strictObject({
    type: z.literal('callout'),
    tone: z.enum(['info', 'warning']),
    title: NonEmptyShortTextSchema,
    text: NonEmptyTextSchema,
  }),
  z.strictObject({
    type: z.literal('metrics'),
    items: z.array(SiteContentMetricSchema).min(1).max(MAX_METRIC_COUNT),
  }),
  z.strictObject({
    type: z.literal('gallery'),
    images: z
      .array(SiteContentDraftImageSchema)
      .min(1)
      .max(MAX_GALLERY_IMAGE_COUNT),
  }),
]);

export const SiteContentDraftBlocksSchema = z
  .array(SiteContentDraftBlockSchema)
  .max(MAX_BLOCK_COUNT)
  .superRefine((blocks, context) => {
    if (getSerializedUtf8ByteLength(blocks) > MAX_BLOCKS_UTF8_BYTES) {
      context.addIssue({
        code: 'custom',
        message: '内容块总大小不能超过 512 KiB',
      });
    }
  });

export const SiteContentDraftSchema = z.strictObject({
  title: NonEmptyShortTextSchema,
  summary: z.string().trim().min(1).max(1_000).nullable().optional(),
  coverFileId: FileIdSchema.nullable().optional(),
  blocks: SiteContentDraftBlocksSchema,
  seoTitle: z.string().trim().min(1).max(300).nullable().optional(),
  seoDescription: z.string().trim().min(1).max(1_000).nullable().optional(),
  canonicalUrl: HttpUrlSchema.nullable().optional(),
});

export const SiteContentPublicAssetSchema = z.strictObject({
  fileId: FileIdSchema,
  src: HttpUrlSchema,
  alt: NonEmptyShortTextSchema,
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
});

export const SiteContentPublicBlockSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('paragraph'),
    text: NonEmptyTextSchema,
  }),
  z.strictObject({
    type: z.literal('heading'),
    level: z.union([z.literal(2), z.literal(3)]),
    text: NonEmptyShortTextSchema,
  }),
  z.strictObject({
    type: z.literal('image'),
    asset: SiteContentPublicAssetSchema,
  }),
  z.strictObject({
    type: z.literal('quote'),
    text: NonEmptyTextSchema,
    attribution: NonEmptyShortTextSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('list'),
    style: z.enum(['ordered', 'unordered']),
    items: z
      .array(NonEmptyListItemSchema)
      .min(1)
      .max(MAX_LIST_ITEM_COUNT),
  }),
  z.strictObject({
    type: z.literal('callout'),
    tone: z.enum(['info', 'warning']),
    title: NonEmptyShortTextSchema,
    text: NonEmptyTextSchema,
  }),
  z.strictObject({
    type: z.literal('metrics'),
    items: z.array(SiteContentMetricSchema).min(1).max(MAX_METRIC_COUNT),
  }),
  z.strictObject({
    type: z.literal('gallery'),
    images: z
      .array(SiteContentPublicAssetSchema)
      .min(1)
      .max(MAX_GALLERY_IMAGE_COUNT),
  }),
]);

export const SiteContentPublicBlocksSchema = z
  .array(SiteContentPublicBlockSchema)
  .max(MAX_BLOCK_COUNT)
  .superRefine((blocks, context) => {
    if (getSerializedUtf8ByteLength(blocks) > MAX_BLOCKS_UTF8_BYTES) {
      context.addIssue({
        code: 'custom',
        message: '内容块总大小不能超过 512 KiB',
      });
    }
  });

export const SiteContentPublicSummarySchema = z.strictObject({
  id: z.uuid(),
  contentType: z.enum(SITE_CONTENT_TYPE_VALUES),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200),
  title: NonEmptyShortTextSchema,
  summary: z.string().trim().min(1).max(1_000).nullable(),
  cover: SiteContentPublicAssetSchema.nullable(),
  publishedAt: z.iso.datetime({ offset: true }),
});

export const SiteContentPublicDetailSchema =
  SiteContentPublicSummarySchema.extend({
    seoTitle: z.string().trim().min(1).max(300).nullable(),
    seoDescription: z.string().trim().min(1).max(1_000).nullable(),
    canonicalUrl: HttpUrlSchema.nullable(),
    blocks: SiteContentPublicBlocksSchema,
  });

export const SiteContentPaginationSchema = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const SiteContentPublicListSchema = z.strictObject({
  list: z.array(SiteContentPublicSummarySchema).max(100),
  pagination: SiteContentPaginationSchema,
}).superRefine(({ list, pagination }, context) => {
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
    if (page !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['pagination', 'page'],
        message: '空列表页码必须为 1',
      });
    }
    if (list.length !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['list'],
        message: '总条数为 0 时列表必须为空',
      });
    }
    return;
  }

  if (page > expectedTotalPages) {
    context.addIssue({
      code: 'custom',
      path: ['pagination', 'page'],
      message: '页码不能超过总页数',
    });
  }
  if (list.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['list'],
      message: '总条数大于 0 时列表不能为空',
    });
  }
  if (list.length > total) {
    context.addIssue({
      code: 'custom',
      path: ['list'],
      message: '列表条数不能超过总条数',
    });
  }
  if (page <= expectedTotalPages) {
    const remainingItemCount = total - (page - 1) * pageSize;
    const expectedItemCount = Math.min(pageSize, remainingItemCount);
    if (list.length !== expectedItemCount) {
      context.addIssue({
        code: 'custom',
        path: ['list'],
        message: '列表条数必须与当前页应返回条数一致',
      });
    }
  }
});

export type SiteContentType = (typeof SITE_CONTENT_TYPE_VALUES)[number];
export type SiteContentStatus = (typeof SITE_CONTENT_STATUS_VALUES)[number];
export type SiteContentDraftBlock = z.infer<
  typeof SiteContentDraftBlockSchema
>;
export type SiteContentDraftBlocks = z.infer<
  typeof SiteContentDraftBlocksSchema
>;
export type SiteContentDraft = z.infer<typeof SiteContentDraftSchema>;
export type SiteContentPublicAsset = z.infer<
  typeof SiteContentPublicAssetSchema
>;
export type SiteContentPublicBlock = z.infer<
  typeof SiteContentPublicBlockSchema
>;
export type SiteContentPublicBlocks = z.infer<
  typeof SiteContentPublicBlocksSchema
>;
export type SiteContentPublicSummary = z.infer<
  typeof SiteContentPublicSummarySchema
>;
export type SiteContentPublicDetail = z.infer<
  typeof SiteContentPublicDetailSchema
>;
export type SiteContentPagination = z.infer<
  typeof SiteContentPaginationSchema
>;
export type SiteContentPublicList = z.infer<
  typeof SiteContentPublicListSchema
>;
