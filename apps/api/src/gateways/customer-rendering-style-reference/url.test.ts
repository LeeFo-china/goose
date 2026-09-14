import { expect, test } from 'bun:test';
import { customerRenderingStyleReferenceUrl } from './url';

const tenantId = '11111111-1111-4111-8111-111111111111';
const styleId = '22222222-2222-4222-8222-222222222222';
const fileId = '33333333-3333-4333-8333-333333333333';
const snapshot = {
  published_version: 3, file_id: fileId, bucket: 'rendering-123456', region: 'ap-guangzhou',
  object_key: `public/renovation-styles/${tenantId}/${styleId}/3.webp`,
  checksum: 'a'.repeat(64), size_bytes: 1234,
  title: 'Pinned style', color_notes: 'warm wood',
};

test('resolves only the pinned public COS object from admission snapshot', () => {
  expect(customerRenderingStyleReferenceUrl(tenantId, styleId, snapshot)).toBe(
    `https://${snapshot.bucket}.cos.${snapshot.region}.myqcloud.com/${snapshot.object_key}`,
  );
});

test('rejects cross-tenant, noncanonical and malformed snapshot locations', () => {
  for (const invalid of [
    { ...snapshot, object_key: snapshot.object_key.replace(tenantId, fileId) },
    { ...snapshot, object_key: `${snapshot.object_key}/../3.webp` },
    { ...snapshot, object_key: snapshot.object_key.replace('/3.webp', '/4.webp') },
    { ...snapshot, bucket: 'evil.example.com' },
    { ...snapshot, region: 'ap-guangzhou:443' },
    { ...snapshot, checksum: 'bad' },
    { ...snapshot, size_bytes: 0 },
    { ...snapshot, file_id: 'bad' },
  ]) {
    expect(() => customerRenderingStyleReferenceUrl(tenantId, styleId, invalid))
      .toThrowError(expect.objectContaining({ code: 'RENDERING_STYLE_SNAPSHOT_UNAVAILABLE' }));
  }
});
