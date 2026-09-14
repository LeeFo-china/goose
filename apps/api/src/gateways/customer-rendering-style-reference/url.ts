import { z } from 'zod';
import { RENDERING_UPLOAD_MAX_BYTES } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';

const Id = z.uuid();
const Snapshot = z.object({
  published_version: z.number().int().min(1).max(2147483647),
  file_id: Id,
  bucket: z.string().max(63).regex(/^[a-z0-9][a-z0-9-]*-\d+$/),
  region: z.string().max(63).regex(/^[a-z]+(?:-[a-z0-9]+)+$/),
  object_key: z.string(),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  size_bytes: z.number().int().min(1).max(RENDERING_UPLOAD_MAX_BYTES),
});

/** Build a reference from the immutable published file captured at job admission. */
export function customerRenderingStyleReferenceUrl(tenantId: string, styleAssetId: string,
  styleSnapshot: unknown): string {
  const snapshot = Snapshot.safeParse(styleSnapshot);
  if (!Id.safeParse(tenantId).success || !Id.safeParse(styleAssetId).success
    || !snapshot.success || snapshot.data.object_key !==
      `public/renovation-styles/${tenantId}/${styleAssetId}/${snapshot.data.published_version}.webp`) {
    throw Errors.business(503, '装修效果参考素材快照不可用', 'RENDERING_STYLE_SNAPSHOT_UNAVAILABLE');
  }
  const { bucket, region, object_key } = snapshot.data;
  return `https://${bucket}.cos.${region}.myqcloud.com/${object_key}`;
}
