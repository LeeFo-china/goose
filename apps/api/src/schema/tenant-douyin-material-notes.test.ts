import { describe, expect, test } from 'bun:test';

import {
  CreateTenantDouyinMaterialNoteSchema,
  CreateTenantDouyinMaterialNoteVersionSchema,
  TenantDouyinMaterialNoteArchiveSchema,
  TenantDouyinMaterialNoteCommandHeadersSchema,
  TenantDouyinMaterialNoteListQuerySchema,
  TenantDouyinMaterialNotePublishSchema,
  TenantDouyinMaterialNoteWithdrawSchema,
} from './tenant-douyin-material-notes';

const ID = '11111111-1111-4111-8111-111111111111';
const draft = {
  title: ' 装修开工清单 ',
  summary: ' 开工前检查事项 ',
  category: ' 施工避坑 ',
  applicable_to: null,
  content_blocks: [{ type: 'paragraph', text: '确认施工图纸。' }],
};

describe('Tenant Douyin material note schemas', () => {
  test('parses paginated status and trimmed keyword filters', () => {
    expect(TenantDouyinMaterialNoteListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(TenantDouyinMaterialNoteListQuerySchema.parse({
      status: 'published',
      keyword: ' 施工 ',
    })).toEqual({
      page: 1,
      pageSize: 20,
      status: 'published',
      keyword: '施工',
    });
    expect(TenantDouyinMaterialNoteListQuerySchema.safeParse({ status: 'deleted' }).success)
      .toBe(false);
    expect(TenantDouyinMaterialNoteListQuerySchema.safeParse({ pageSize: 101 }).success)
      .toBe(false);
  });

  test('create and append version accept the same strict material draft', () => {
    expect(CreateTenantDouyinMaterialNoteSchema.parse(draft).title)
      .toBe('装修开工清单');
    expect(CreateTenantDouyinMaterialNoteVersionSchema.parse(draft).category)
      .toBe('施工避坑');
    for (const schema of [
      CreateTenantDouyinMaterialNoteSchema,
      CreateTenantDouyinMaterialNoteVersionSchema,
    ]) {
      expect(schema.safeParse({ ...draft, tenant_id: ID }).success).toBe(false);
      expect(schema.safeParse({ ...draft, content_blocks: [] }).success).toBe(true);
    }
  });

  test('publish body is exact and never accepts the idempotency key', () => {
    const body = { version_id: ID, expected_status: 'draft' as const };
    expect(TenantDouyinMaterialNotePublishSchema.parse(body)).toEqual(body);
    expect(TenantDouyinMaterialNotePublishSchema.safeParse({
      ...body,
      idempotency_key: ID,
    }).success).toBe(false);
    expect(TenantDouyinMaterialNotePublishSchema.safeParse({
      ...body,
      reason: '无需原因',
    }).success).toBe(false);
  });

  test('archive and withdraw require a trimmed bounded reason and expected status', () => {
    const body = { expected_status: 'published', reason: '  内容已过期  ' };
    expect(TenantDouyinMaterialNoteArchiveSchema.parse(body)).toEqual({
      expected_status: 'published',
      reason: '内容已过期',
    });
    expect(TenantDouyinMaterialNoteWithdrawSchema.parse(body).reason)
      .toBe('内容已过期');
    for (const invalidReason of ['', '   ', 'x'.repeat(1001)]) {
      expect(TenantDouyinMaterialNoteArchiveSchema.safeParse({
        expected_status: 'published',
        reason: invalidReason,
      }).success).toBe(false);
    }
    expect(TenantDouyinMaterialNoteWithdrawSchema.safeParse({
      ...body,
      version_id: ID,
    }).success).toBe(false);
  });

  test('requires a UUID Idempotency-Key HTTP header', () => {
    expect(TenantDouyinMaterialNoteCommandHeadersSchema.parse({
      'idempotency-key': ID,
    })).toEqual({ 'idempotency-key': ID });
    expect(TenantDouyinMaterialNoteCommandHeadersSchema.safeParse({}).success)
      .toBe(false);
    expect(TenantDouyinMaterialNoteCommandHeadersSchema.safeParse({
      'idempotency-key': 'same-request',
    }).success).toBe(false);
  });
});
