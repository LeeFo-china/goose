import { describe, expect, test } from 'bun:test';
import {
  SITE_CONTENT_STATUS_VALUES,
  SITE_CONTENT_TYPE_VALUES,
  SiteContentDraftBlockSchema,
  SiteContentDraftBlocksSchema,
  SiteContentDraftSchema,
  SiteContentPublicDetailSchema,
  SiteContentPublicListSchema,
  SiteContentPublicSummarySchema,
} from './index';

const publicAsset = {
  fileId: '550e8400-e29b-41d4-a716-446655440000',
  src: 'https://cdn.example.com/content/cover.webp',
  alt: '效果图',
  width: 1600,
  height: 900,
};

const publicSummary = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  contentType: 'article',
  slug: 'first-article',
  title: '第一篇文章',
  summary: '文章摘要',
  cover: publicAsset,
  publishedAt: '2026-07-11T08:00:00.000Z',
};

describe('site content domain', () => {
  test('exports fixed content types and statuses', () => {
    expect(SITE_CONTENT_TYPE_VALUES).toEqual(['article', 'case', 'city']);
    expect(SITE_CONTENT_STATUS_VALUES).toEqual([
      'draft',
      'published',
      'archived',
    ]);
  });

  test('accepts every controlled draft block', () => {
    const blocks = [
      { type: 'paragraph', text: '正文' },
      { type: 'heading', level: 2, text: '标题' },
      {
        type: 'image',
        fileId: '550e8400-e29b-41d4-a716-446655440000',
        alt: '图片说明',
      },
      { type: 'quote', text: '引用', attribution: '作者' },
      { type: 'list', style: 'ordered', items: ['第一项'] },
      {
        type: 'callout',
        tone: 'info',
        title: '提示',
        text: '提示正文',
      },
      { type: 'metrics', items: [{ label: '项目', value: '100+' }] },
      {
        type: 'gallery',
        images: [
          {
            fileId: '550e8400-e29b-41d4-a716-446655440000',
            alt: '案例图',
          },
        ],
      },
    ];

    for (const block of blocks) {
      expect(SiteContentDraftBlockSchema.safeParse(block).success).toBe(true);
    }
  });

  test('rejects executable blocks, asset URLs, dimensions and unknown keys', () => {
    const invalidBlocks = [
      { type: 'html', html: '<script>alert(1)</script>' },
      { type: 'script', script: 'alert(1)' },
      {
        type: 'image',
        fileId: '550e8400-e29b-41d4-a716-446655440000',
        alt: '图片',
        src: 'https://attacker.example/image.png',
      },
      {
        type: 'image',
        fileId: '550e8400-e29b-41d4-a716-446655440000',
        alt: '图片',
        width: 9999,
        height: 9999,
      },
      { type: 'paragraph', text: '正文', unknown: true },
    ];

    for (const block of invalidBlocks) {
      expect(SiteContentDraftBlockSchema.safeParse(block).success).toBe(false);
    }
  });

  test('bounds draft text, collections and total block count without empty items', () => {
    expect(
      SiteContentDraftBlockSchema.safeParse({
        type: 'paragraph',
        text: '',
      }).success,
    ).toBe(false);
    expect(
      SiteContentDraftBlockSchema.safeParse({
        type: 'list',
        style: 'unordered',
        items: [],
      }).success,
    ).toBe(false);
    expect(
      SiteContentDraftBlockSchema.safeParse({
        type: 'metrics',
        items: [{ label: '', value: '10' }],
      }).success,
    ).toBe(false);
    expect(
      SiteContentDraftBlocksSchema.safeParse(
        Array.from({ length: 101 }, () => ({
          type: 'paragraph',
          text: '正文',
        })),
      ).success,
    ).toBe(false);
  });

  test('draft contract only accepts trusted file IDs for cover and blocks', () => {
    const draft = {
      title: '第一篇文章',
      summary: '文章摘要',
      coverFileId: '550e8400-e29b-41d4-a716-446655440000',
      blocks: [{ type: 'paragraph', text: '正文' }],
      seoTitle: 'SEO 标题',
      seoDescription: 'SEO 描述',
      canonicalUrl: 'https://www.example.com/articles/first-article',
    };

    expect(SiteContentDraftSchema.safeParse(draft).success).toBe(true);
    expect(
      SiteContentDraftSchema.safeParse({
        ...draft,
        coverUrl: 'https://attacker.example/cover.png',
      }).success,
    ).toBe(false);
    expect(
      SiteContentDraftSchema.safeParse({ ...draft, coverWidth: 1600 }).success,
    ).toBe(false);
  });

  test('keeps public summary and detail DTOs distinct and strict', () => {
    expect(SiteContentPublicSummarySchema.safeParse(publicSummary).success).toBe(
      true,
    );
    expect(
      SiteContentPublicSummarySchema.safeParse({
        ...publicSummary,
        blocks: [{ type: 'paragraph', text: '不得出现在摘要中' }],
      }).success,
    ).toBe(false);

    const detail = {
      ...publicSummary,
      seoTitle: 'SEO 标题',
      seoDescription: 'SEO 描述',
      canonicalUrl: 'https://www.example.com/articles/first-article',
      blocks: [
        { type: 'paragraph', text: '正文' },
        { type: 'image', asset: publicAsset },
        { type: 'gallery', images: [publicAsset] },
      ],
    };
    expect(SiteContentPublicDetailSchema.safeParse(detail).success).toBe(true);
    expect(
      SiteContentPublicDetailSchema.safeParse({
        ...detail,
        created_by_employee_id: '550e8400-e29b-41d4-a716-446655440002',
      }).success,
    ).toBe(false);
    expect(
      SiteContentPublicDetailSchema.safeParse({
        ...detail,
        status: 'published',
      }).success,
    ).toBe(false);
    expect(
      SiteContentPublicDetailSchema.safeParse({
        ...detail,
        draft: { blocks: [] },
      }).success,
    ).toBe(false);
    expect(
      SiteContentPublicDetailSchema.safeParse({ ...detail, versions: [] })
        .success,
    ).toBe(false);
  });

  test('uses resolved public assets and rejects untrusted asset fields', () => {
    const publicImage = { type: 'image', asset: publicAsset };
    expect(
      SiteContentPublicDetailSchema.safeParse({
        ...publicSummary,
        seoTitle: null,
        seoDescription: null,
        canonicalUrl: null,
        blocks: [publicImage],
      }).success,
    ).toBe(true);
    expect(
      SiteContentPublicDetailSchema.safeParse({
        ...publicSummary,
        seoTitle: null,
        seoDescription: null,
        canonicalUrl: null,
        blocks: [
          {
            type: 'image',
            asset: { ...publicAsset, internalPath: 'private/object-key' },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      SiteContentPublicDetailSchema.safeParse({
        ...publicSummary,
        cover: { ...publicAsset, src: 'javascript:alert(1)' },
        seoTitle: null,
        seoDescription: null,
        canonicalUrl: null,
        blocks: [],
      }).success,
    ).toBe(false);
  });

  test('rejects empty optional text instead of storing empty items', () => {
    expect(
      SiteContentDraftSchema.safeParse({
        title: '文章',
        summary: '',
        blocks: [],
      }).success,
    ).toBe(false);
    expect(
      SiteContentPublicSummarySchema.safeParse({
        ...publicSummary,
        summary: '',
      }).success,
    ).toBe(false);
  });

  test('wraps public summaries in a bounded pagination envelope', () => {
    expect(
      SiteContentPublicListSchema.safeParse({
        list: Array.from({ length: 101 }, () => publicSummary),
        pagination: { page: 1, pageSize: 100, total: 101, totalPages: 2 },
      }).success,
    ).toBe(false);
    expect(
      SiteContentPublicListSchema.safeParse({
        list: [publicSummary],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }).success,
    ).toBe(true);
    expect(
      SiteContentPublicListSchema.safeParse({
        list: [publicSummary],
        pagination: { page: 1, pageSize: 101, total: 1, totalPages: 1 },
      }).success,
    ).toBe(false);
    expect(
      SiteContentPublicListSchema.safeParse({
        list: [publicSummary],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        created_by: '550e8400-e29b-41d4-a716-446655440002',
      }).success,
    ).toBe(false);
  });
});
