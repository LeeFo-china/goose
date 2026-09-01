import { describe, expect, test } from 'bun:test';
import * as domain from './index';
import {
  SiteContentDraftBlockSchema,
  SiteContentDraftCalloutBlockSchema,
  SiteContentDraftHeadingBlockSchema,
  SiteContentDraftListBlockSchema,
  SiteContentDraftParagraphBlockSchema,
  SiteContentDraftQuoteBlockSchema,
} from './site-content';
import {
  DOUYIN_MATERIAL_NOTE_BLOCK_TYPE_VALUES,
  DOUYIN_MATERIAL_NOTE_ERROR_CODE_VALUES,
  DOUYIN_MATERIAL_NOTE_STATUS_VALUES,
  DouyinMaterialNoteBlockSchema,
  DouyinMaterialNoteClaimResponseSchema,
  DouyinMaterialNoteClaimedMaterialSchema,
  DouyinMaterialNoteContentBlocksSchema,
  DouyinMaterialNoteOwnedDetailSchema,
  DouyinMaterialNoteOwnedListSchema,
  DouyinMaterialNoteOwnedSummarySchema,
  DouyinMaterialNotePaginationSchema,
  DouyinMaterialNotePublicListSchema,
  DouyinMaterialNotePublicPreviewSchema,
  DouyinMaterialNoteStatusSchema,
  DouyinMaterialNoteTenantDetailSchema,
  DouyinMaterialNoteTenantListSchema,
  DouyinMaterialNoteTenantSummarySchema,
  DouyinMaterialNoteTenantVersionSummarySchema,
  DouyinMaterialNoteTenantVersionListSchema,
  DouyinMaterialNoteTenantVersionSchema,
  DouyinMaterialNoteUnclaimedDetailSchema,
  DouyinMaterialNoteVersionDraftSchema,
  type DouyinMaterialNoteOwnedDetail,
  type DouyinMaterialNoteOwnedSummary,
  type DouyinMaterialNoteClaimResponse,
  type DouyinMaterialNoteClaimedMaterial,
  type DouyinMaterialNoteContentBlocks,
  type DouyinMaterialNotePublicPreview,
  type DouyinMaterialNoteTenantDetail,
  type DouyinMaterialNoteTenantSummary,
  type DouyinMaterialNoteTenantVersionSummary,
  type DouyinMaterialNoteTenantVersion,
  type DouyinMaterialNoteUnclaimedDetail,
} from './douyin-material-note';

type Assert<Condition extends true> = Condition;
type HasNoIdentityKeys<Value> = Extract<
  keyof Value,
  'tenant_id' | 'subject_hash'
> extends never
  ? true
  : false;

type PublicPreviewHasNoIdentity = Assert<
  HasNoIdentityKeys<DouyinMaterialNotePublicPreview>
>;
type UnclaimedDetailHasNoIdentity = Assert<
  HasNoIdentityKeys<DouyinMaterialNoteUnclaimedDetail>
>;
type OwnedSummaryHasNoIdentity = Assert<
  HasNoIdentityKeys<DouyinMaterialNoteOwnedSummary>
>;
type OwnedDetailHasNoIdentity = Assert<
  HasNoIdentityKeys<DouyinMaterialNoteOwnedDetail>
>;
type ClaimedMaterialHasNoIdentity = Assert<
  HasNoIdentityKeys<DouyinMaterialNoteClaimedMaterial>
>;
type ClaimResponseHasNoIdentity = Assert<
  HasNoIdentityKeys<DouyinMaterialNoteClaimResponse>
>;
type TenantSummaryHasNoIdentity = Assert<
  HasNoIdentityKeys<DouyinMaterialNoteTenantSummary>
>;
type TenantDetailHasNoIdentity = Assert<
  HasNoIdentityKeys<DouyinMaterialNoteTenantDetail>
>;
type TenantVersionHasNoIdentity = Assert<
  HasNoIdentityKeys<DouyinMaterialNoteTenantVersion>
>;
type TenantVersionSummaryHasNoIdentity = Assert<
  HasNoIdentityKeys<DouyinMaterialNoteTenantVersionSummary>
>;

void (null as unknown as PublicPreviewHasNoIdentity);
void (null as unknown as UnclaimedDetailHasNoIdentity);
void (null as unknown as OwnedSummaryHasNoIdentity);
void (null as unknown as OwnedDetailHasNoIdentity);
void (null as unknown as ClaimedMaterialHasNoIdentity);
void (null as unknown as ClaimResponseHasNoIdentity);
void (null as unknown as TenantSummaryHasNoIdentity);
void (null as unknown as TenantDetailHasNoIdentity);
void (null as unknown as TenantVersionHasNoIdentity);
void (null as unknown as TenantVersionSummaryHasNoIdentity);

const noteId = '550e8400-e29b-41d4-a716-446655440000';
const versionId = '550e8400-e29b-41d4-a716-446655440001';
const claimId = '550e8400-e29b-41d4-a716-446655440002';
const employeeId = '550e8400-e29b-41d4-a716-446655440003';
const occurredAt = '2026-09-01T00:00:00.000Z';

const contentBlocks: DouyinMaterialNoteContentBlocks = [
  { type: 'heading', level: 2, text: '开工前准备' },
  { type: 'paragraph', text: '确认施工图纸和现场交底。' },
  { type: 'list', style: 'unordered', items: ['核对图纸', '确认工期'] },
  { type: 'quote', text: '先确认，再开工。', attribution: '施工负责人' },
  {
    type: 'callout',
    tone: 'warning',
    title: '风险提示',
    text: '未交底前不要拆改。',
  },
];

const versionDraft = {
  title: '装修开工前检查清单',
  summary: '开工交底前需要确认的事项',
  category: '施工避坑',
  applicable_to: '准备开工的业主',
  content_blocks: contentBlocks,
};

const publicPreview = {
  id: noteId,
  title: versionDraft.title,
  summary: versionDraft.summary,
  category: versionDraft.category,
  applicable_to: versionDraft.applicable_to,
  published_at: occurredAt,
  claimed: false,
};

const claimedMaterial = {
  id: noteId,
  version: 1,
  title: versionDraft.title,
  summary: versionDraft.summary,
  category: versionDraft.category,
  applicable_to: versionDraft.applicable_to,
  content_blocks: contentBlocks,
};

const ownedSummary = {
  claim_id: claimId,
  id: noteId,
  version: 1,
  title: versionDraft.title,
  summary: versionDraft.summary,
  category: versionDraft.category,
  applicable_to: versionDraft.applicable_to,
  claimed_at: occurredAt,
};

const tenantVersion = {
  id: versionId,
  note_id: noteId,
  version: 1,
  ...versionDraft,
  created_by: employeeId,
  created_at: occurredAt,
};
const { content_blocks: _tenantContentBlocks, ...tenantVersionSummary } =
  tenantVersion;

const tenantSummary = {
  id: noteId,
  status: 'published',
  title: versionDraft.title,
  category: versionDraft.category,
  current_version: 1,
  claim_count: 8,
  published_at: occurredAt,
  updated_at: occurredAt,
} as const;

const pagination = {
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

describe('Douyin material note domain contracts', () => {
  test('exports fixed statuses, text block types and business errors', () => {
    expect(DOUYIN_MATERIAL_NOTE_STATUS_VALUES).toEqual([
      'draft',
      'published',
      'archived',
      'withdrawn',
    ]);
    expect(DOUYIN_MATERIAL_NOTE_BLOCK_TYPE_VALUES).toEqual([
      'heading',
      'paragraph',
      'list',
      'quote',
      'callout',
    ]);
    expect(DOUYIN_MATERIAL_NOTE_ERROR_CODE_VALUES).toEqual([
      'MATERIAL_NOTE_NOT_FOUND',
      'MATERIAL_NOTE_NOT_AVAILABLE',
      'MATERIAL_NOTE_WITHDRAWN',
      'MATERIAL_NOTE_CLAIM_NOT_FOUND',
      'MATERIAL_NOTE_VERSION_CONFLICT',
      'MATERIAL_NOTE_STATE_CONFLICT',
    ]);

    for (const status of DOUYIN_MATERIAL_NOTE_STATUS_VALUES) {
      expect(DouyinMaterialNoteStatusSchema.safeParse(status).success).toBe(
        true,
      );
    }
    expect(DouyinMaterialNoteStatusSchema.safeParse('deleted').success).toBe(
      false,
    );
  });

  test('version history summaries contain metadata but never content blocks', () => {
    expect(DouyinMaterialNoteTenantVersionSummarySchema.parse(tenantVersionSummary))
      .toEqual(tenantVersionSummary);
    expect(DouyinMaterialNoteTenantVersionSummarySchema.safeParse(tenantVersion).success)
      .toBe(false);
    expect(DouyinMaterialNoteTenantVersionListSchema.parse({
      list: [tenantVersionSummary],
      pagination,
    }).list[0]).not.toHaveProperty('content_blocks');
    expect(DouyinMaterialNoteTenantVersionSchema.parse(tenantVersion))
      .toEqual(tenantVersion);
  });

  test('accepts only the five narrowed site-content text blocks', () => {
    for (const block of contentBlocks) {
      expect(DouyinMaterialNoteBlockSchema.safeParse(block).success).toBe(true);
    }

    const sharedBoundaryCases = [
      [
        SiteContentDraftParagraphBlockSchema,
        { type: 'paragraph', text: 'x'.repeat(20_000) },
        { type: 'paragraph', text: 'x'.repeat(20_001) },
      ],
      [
        SiteContentDraftHeadingBlockSchema,
        { type: 'heading', level: 2, text: 'x'.repeat(300) },
        { type: 'heading', level: 2, text: 'x'.repeat(301) },
      ],
      [
        SiteContentDraftListBlockSchema,
        { type: 'list', style: 'ordered', items: ['x'.repeat(2_000)] },
        { type: 'list', style: 'ordered', items: ['x'.repeat(2_001)] },
      ],
      [
        SiteContentDraftQuoteBlockSchema,
        { type: 'quote', text: 'x'.repeat(20_000) },
        { type: 'quote', text: 'x'.repeat(20_001) },
      ],
      [
        SiteContentDraftCalloutBlockSchema,
        {
          type: 'callout',
          tone: 'info',
          title: 'x'.repeat(300),
          text: 'x'.repeat(20_000),
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'x'.repeat(300),
          text: 'x'.repeat(20_001),
        },
      ],
    ] as const;

    for (const [namedSchema, accepted, rejected] of sharedBoundaryCases) {
      for (const schema of [
        namedSchema,
        SiteContentDraftBlockSchema,
        DouyinMaterialNoteBlockSchema,
      ]) {
        expect(schema.safeParse(accepted).success).toBe(true);
        expect(schema.safeParse(rejected).success).toBe(false);
      }
    }

    for (const block of [
      { type: 'html', html: '<strong>不允许</strong>' },
      {
        type: 'image',
        fileId: noteId,
        alt: '不允许图片',
      },
      {
        type: 'gallery',
        images: [{ fileId: noteId, alt: '不允许图集' }],
      },
      { type: 'metrics', items: [{ label: '面积', value: '100㎡' }] },
      {
        type: 'paragraph',
        text: '不允许外部链接字段',
        url: 'https://attacker.example/material',
      },
    ]) {
      expect(DouyinMaterialNoteBlockSchema.safeParse(block).success).toBe(
        false,
      );
    }
  });

  test('preserves site-content scalar and aggregate boundaries', () => {
    expect(DouyinMaterialNoteVersionDraftSchema.safeParse(versionDraft).success).toBe(
      true,
    );

    const boundaryCases = [
      ['title', 'x', 'x'.repeat(300), '', 'x'.repeat(301)],
      ['summary', 'x', 'x'.repeat(1_000), '', 'x'.repeat(1_001)],
      ['category', 'x', 'x'.repeat(100), '', 'x'.repeat(101)],
    ] as const;

    for (const [field, minimum, maximum, empty, overMaximum] of boundaryCases) {
      expect(
        DouyinMaterialNoteVersionDraftSchema.safeParse({
          ...versionDraft,
          [field]: minimum,
        }).success,
      ).toBe(true);
      expect(
        DouyinMaterialNoteVersionDraftSchema.safeParse({
          ...versionDraft,
          [field]: maximum,
        }).success,
      ).toBe(true);
      expect(
        DouyinMaterialNoteVersionDraftSchema.safeParse({
          ...versionDraft,
          [field]: empty,
        }).success,
      ).toBe(false);
      expect(
        DouyinMaterialNoteVersionDraftSchema.safeParse({
          ...versionDraft,
          [field]: overMaximum,
        }).success,
      ).toBe(false);
    }

    expect(
      DouyinMaterialNoteVersionDraftSchema.safeParse({
        ...versionDraft,
        applicable_to: null,
      }).success,
    ).toBe(true);
    expect(
      DouyinMaterialNoteVersionDraftSchema.safeParse({
        ...versionDraft,
        applicable_to: 'x'.repeat(300),
      }).success,
    ).toBe(true);
    for (const applicable_to of ['', '   ', 'x'.repeat(301)]) {
      expect(
        DouyinMaterialNoteVersionDraftSchema.safeParse({
          ...versionDraft,
          applicable_to,
        }).success,
      ).toBe(false);
    }

    expect(
      DouyinMaterialNoteContentBlocksSchema.safeParse(
        Array.from({ length: 101 }, () => ({
          type: 'paragraph',
          text: '正文',
        })),
      ).success,
    ).toBe(false);

    const largeListBlock = {
      type: 'list',
      style: 'unordered',
      items: Array.from({ length: 50 }, () => '中'.repeat(1_800)),
    };
    expect(
      DouyinMaterialNoteContentBlocksSchema.safeParse([largeListBlock]).success,
    ).toBe(true);
    expect(
      DouyinMaterialNoteContentBlocksSchema.safeParse([
        largeListBlock,
        largeListBlock,
      ]).success,
    ).toBe(false);
  });

  test('keeps public previews redacted and every response object strict', () => {
    expect(DouyinMaterialNotePublicPreviewSchema.parse(publicPreview)).toEqual(
      publicPreview,
    );
    expect(DouyinMaterialNoteUnclaimedDetailSchema.parse(publicPreview)).toEqual(
      publicPreview,
    );

    const publicPreviewTypeContract = (
      preview: DouyinMaterialNotePublicPreview,
    ): void => {
      // @ts-expect-error Public previews must never include body content.
      void preview.content_blocks;
      // @ts-expect-error Public DTOs must never expose a tenant identifier.
      void preview.tenant_id;
      // @ts-expect-error Public DTOs must never expose an anonymous subject hash.
      void preview.subject_hash;
    };
    void publicPreviewTypeContract;

    for (const forbidden of [
      { content_blocks: contentBlocks },
      { tenant_id: noteId },
      { subject_hash: 'server-only' },
      { unknown: true },
    ]) {
      expect(
        DouyinMaterialNotePublicPreviewSchema.safeParse({
          ...publicPreview,
          ...forbidden,
        }).success,
      ).toBe(false);
      expect(
        DouyinMaterialNoteUnclaimedDetailSchema.safeParse({
          ...publicPreview,
          ...forbidden,
        }).success,
      ).toBe(false);
    }
  });

  test('defines claimed and owned DTOs without identity leakage', () => {
    const claimResponse = {
      claim_id: claimId,
      already_claimed: false,
      claimed_at: occurredAt,
      material: claimedMaterial,
    };
    const ownedDetail = {
      ...ownedSummary,
      content_blocks: contentBlocks,
    };

    expect(
      DouyinMaterialNoteClaimedMaterialSchema.parse(claimedMaterial),
    ).toEqual(claimedMaterial);
    expect(DouyinMaterialNoteClaimResponseSchema.parse(claimResponse)).toEqual(
      claimResponse,
    );
    expect(DouyinMaterialNoteOwnedSummarySchema.parse(ownedSummary)).toEqual(
      ownedSummary,
    );
    expect(DouyinMaterialNoteOwnedDetailSchema.parse(ownedDetail)).toEqual(
      ownedDetail,
    );

    for (const [schema, value] of [
      [DouyinMaterialNoteClaimedMaterialSchema, claimedMaterial],
      [DouyinMaterialNoteClaimResponseSchema, claimResponse],
      [DouyinMaterialNoteOwnedSummarySchema, ownedSummary],
      [DouyinMaterialNoteOwnedDetailSchema, ownedDetail],
    ] as const) {
      expect(
        schema.safeParse({
          ...value,
          tenant_id: noteId,
          subject_hash: 'server-only',
        }).success,
      ).toBe(false);
    }
  });

  test('defines aggregate-only tenant summary, detail and version DTOs', () => {
    expect(DouyinMaterialNoteTenantSummarySchema.parse(tenantSummary)).toEqual(
      tenantSummary,
    );
    expect(DouyinMaterialNoteTenantVersionSchema.parse(tenantVersion)).toEqual(
      tenantVersion,
    );
    expect(
      DouyinMaterialNoteTenantDetailSchema.parse({
        ...tenantSummary,
        published_version_id: versionId,
        latest_version: tenantVersionSummary,
        created_at: occurredAt,
      }).latest_version,
    ).toEqual(tenantVersionSummary);
    expect(DouyinMaterialNoteTenantDetailSchema.safeParse({
      ...tenantSummary,
      published_version_id: versionId,
      latest_version: tenantVersion,
      created_at: occurredAt,
    }).success).toBe(false);
    const mismatchedLatestVersion =
      DouyinMaterialNoteTenantDetailSchema.safeParse({
        ...tenantSummary,
        published_version_id: versionId,
        latest_version: {
          ...tenantVersionSummary,
          note_id: '550e8400-e29b-41d4-a716-446655440004',
        },
        created_at: occurredAt,
      });
    expect(mismatchedLatestVersion.success).toBe(false);
    if (!mismatchedLatestVersion.success) {
      expect(mismatchedLatestVersion.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['latest_version', 'note_id'],
        }),
      );
    }

    for (const schemaAndValue of [
      [DouyinMaterialNoteTenantSummarySchema, tenantSummary],
      [
        DouyinMaterialNoteTenantDetailSchema,
        {
          ...tenantSummary,
          published_version_id: versionId,
          latest_version: tenantVersionSummary,
          created_at: occurredAt,
        },
      ],
      [DouyinMaterialNoteTenantVersionSchema, tenantVersion],
    ] as const) {
      const [schema, value] = schemaAndValue;
      expect(
        schema.safeParse({
          ...value,
          tenant_id: noteId,
          subject_hash: 'server-only',
        }).success,
      ).toBe(false);
    }
  });

  test('wraps every list in the shared strict pagination envelope', () => {
    expect(DouyinMaterialNotePaginationSchema.parse(pagination)).toEqual(
      pagination,
    );
    expect(
      DouyinMaterialNotePublicListSchema.parse({
        list: [publicPreview],
        pagination,
      }).list,
    ).toEqual([publicPreview]);
    expect(
      DouyinMaterialNoteOwnedListSchema.parse({
        list: [ownedSummary],
        pagination,
      }).list,
    ).toEqual([ownedSummary]);
    expect(
      DouyinMaterialNoteTenantListSchema.parse({
        list: [tenantSummary],
        pagination,
      }).list,
    ).toEqual([tenantSummary]);
    expect(
      DouyinMaterialNoteTenantVersionListSchema.parse({
        list: [tenantVersionSummary],
        pagination,
      }).list,
    ).toEqual([tenantVersionSummary]);

    expect(
      DouyinMaterialNotePublicListSchema.safeParse({
        list: [publicPreview],
        pagination: { ...pagination, pageSize: 101 },
      }).success,
    ).toBe(false);
    expect(
      DouyinMaterialNotePublicListSchema.safeParse({
        list: [publicPreview],
        pagination: { ...pagination, totalPages: 2 },
      }).success,
    ).toBe(false);
    expect(
      DouyinMaterialNoteTenantVersionListSchema.safeParse({
        list: [tenantVersionSummary],
        pagination: { ...pagination, total: 0, totalPages: 0 },
      }).success,
    ).toBe(false);
    expect(
      DouyinMaterialNoteOwnedListSchema.safeParse({
        list: [ownedSummary],
        pagination,
        subject_hash: 'server-only',
      }).success,
    ).toBe(false);
  });

  test('accepts empty tenant pages after the last page without weakening counts', () => {
    const pastEndPagination = {
      page: 2,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    };
    for (const schema of [
      DouyinMaterialNoteTenantListSchema,
      DouyinMaterialNoteTenantVersionListSchema,
    ]) {
      expect(schema.safeParse({
        list: [],
        pagination: pastEndPagination,
      }).success).toBe(true);
      expect(schema.safeParse({
        list: schema === DouyinMaterialNoteTenantListSchema
          ? [tenantSummary]
          : [tenantVersionSummary],
        pagination: pastEndPagination,
      }).success).toBe(false);
      expect(schema.safeParse({
        list: [],
        pagination: { ...pastEndPagination, totalPages: 2 },
      }).success).toBe(false);
    }
  });

  test('re-exports material contracts from the domain root', () => {
    expect(domain.DOUYIN_MATERIAL_NOTE_STATUS_VALUES).toBe(
      DOUYIN_MATERIAL_NOTE_STATUS_VALUES,
    );
    expect(domain.DouyinMaterialNoteVersionDraftSchema).toBe(
      DouyinMaterialNoteVersionDraftSchema,
    );
    expect(domain.DouyinMaterialNoteClaimResponseSchema).toBe(
      DouyinMaterialNoteClaimResponseSchema,
    );
  });
});
