import { describe, expect, test } from 'bun:test';

import {
  DouyinMaterialNoteClaimIdParamsSchema,
  DouyinMaterialNoteEmptyCommandSchema,
  DouyinMaterialNoteIdParamsSchema,
  DouyinMaterialNoteListQuerySchema,
  DouyinMaterialNotePublicListResponseSchema,
} from './douyin-material-notes';

const ID = '11111111-1111-4111-8111-111111111111';

describe('Douyin material note public schemas', () => {
  test('defaults and caps list pagination while trimming an optional keyword', () => {
    expect(DouyinMaterialNoteListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(DouyinMaterialNoteListQuerySchema.parse({
      page: '2',
      pageSize: '100',
      keyword: '  开工清单  ',
    })).toEqual({ page: 2, pageSize: 100, keyword: '开工清单' });
    expect(DouyinMaterialNoteListQuerySchema.safeParse({ pageSize: 101 }).success)
      .toBe(false);
    expect(DouyinMaterialNoteListQuerySchema.safeParse({ keyword: '   ' }).success)
      .toBe(false);
    expect(DouyinMaterialNoteListQuerySchema.safeParse({ tenant_id: ID }).success)
      .toBe(false);
  });

  test('accepts only UUID route params', () => {
    expect(DouyinMaterialNoteIdParamsSchema.parse({ id: ID })).toEqual({ id: ID });
    expect(DouyinMaterialNoteClaimIdParamsSchema.parse({ claimId: ID }))
      .toEqual({ claimId: ID });
    expect(DouyinMaterialNoteIdParamsSchema.safeParse({ id: 'bad' }).success)
      .toBe(false);
    expect(DouyinMaterialNoteClaimIdParamsSchema.safeParse({ claimId: 'bad' }).success)
      .toBe(false);
  });

  test('public commands accept an empty object and reject identity or business data', () => {
    expect(DouyinMaterialNoteEmptyCommandSchema.parse({})).toEqual({});
    for (const body of [
      { tenant_id: ID },
      { subject_hash: 'a'.repeat(64) },
      { note_id: ID },
    ]) {
      expect(DouyinMaterialNoteEmptyCommandSchema.safeParse(body).success)
        .toBe(false);
    }
  });

  test('reuses the strict public response contract without exposing content', () => {
    const response = {
      list: [{
        id: ID,
        title: '装修开工清单',
        summary: '开工前检查事项',
        category: '施工避坑',
        applicable_to: null,
        published_at: '2026-09-01T00:00:00.000Z',
        claimed: false,
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    expect(DouyinMaterialNotePublicListResponseSchema.parse(response)).toEqual(response);
    expect(DouyinMaterialNotePublicListResponseSchema.safeParse({
      ...response,
      list: [{ ...response.list[0], content_blocks: [] }],
    }).success).toBe(false);
  });
});
