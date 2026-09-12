import { expect, test } from 'bun:test';
import * as domain from './index';
import * as shared from './shared';

const ids = Array.from({ length: 101 }, () => crypto.randomUUID());
const item = { file_id: ids[0]!, url: 'https://rendering.example.com/signed', expires_at: '2026-09-11T00:02:00Z' };

test('batch preview exports bounded strict unique-ID input and HTTPS-only result contracts', () => {
  expect(domain.RENDERING_LIBRARY_PREVIEW_BATCH_MAX).toBe(100);
  expect(shared.RenderingLibraryBatchPreviewSchema).toBe(domain.RenderingLibraryBatchPreviewSchema);
  expect(shared.RenderingLibraryBatchPreviewResultSchema).toBe(domain.RenderingLibraryBatchPreviewResultSchema);
  for (const file_ids of [ids.slice(0, 1), ids.slice(0, 100)]) {
    expect(domain.RenderingLibraryBatchPreviewSchema?.parse({ file_ids })).toEqual({ file_ids });
  }
  for (const input of [{ file_ids: [] }, { file_ids: ids }, { file_ids: [ids[0], ids[0]] },
    { file_ids: ['bad'] }, { file_ids: [ids[0]], tenant_id: ids[1] }, { file_ids: [ids[0]], ttl: 9999 },
    { file_ids: [ids[0]], url: 'https://public.example.com' }, {}]) {
    expect(domain.RenderingLibraryBatchPreviewSchema?.safeParse(input).success).toBe(false);
  }
  for (const items of [[item], Array.from({ length: 100 }, (_, index) => ({ ...item, file_id: ids[index]! }))]) {
    expect(domain.RenderingLibraryBatchPreviewResultSchema?.parse({ items })).toEqual({ items });
  }
  for (const result of [{ items: [] }, { items: Array(101).fill(item) }, { items: [item], tenant_id: ids[0] },
    ...[{ file_id: 'bad' }, { url: 'http://public.example.com' }, { expires_at: '2026-09-11' }, { bucket: 'private' }]
      .map((patch) => ({ items: [{ ...item, ...patch }] }))]) {
    expect(domain.RenderingLibraryBatchPreviewResultSchema?.safeParse(result).success).toBe(false);
  }
});
