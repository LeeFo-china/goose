import { RENDERING_LIBRARY_SOURCE_SCENE, RENDERING_UPLOAD_MAX_BYTES } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';
import type { RenderingLibrarySourceFile } from '@/repositories/tenant-rendering-library';

type EligibleRenderingSource = RenderingLibrarySourceFile & { width: number; height: number; region: string };

export function assertRenderingSourceFile(tenantId: string, fileId: string,
  file: RenderingLibrarySourceFile | null): asserts file is EligibleRenderingSource {
  if (!file || file.id !== fileId || file.tenant_id !== tenantId || file.status !== 'active'
    || file.deleted_at !== null || file.visibility !== 'private' || file.scene !== RENDERING_LIBRARY_SOURCE_SCENE
    || file.provider !== 'tencent_cos' || file.owner_type !== 'tenant' || file.owner_id !== tenantId
    || file.mime_type !== 'image/webp' || !Number.isInteger(file.size_bytes)
    || file.size_bytes <= 0 || file.size_bytes > RENDERING_UPLOAD_MAX_BYTES
    || file.width === null || file.height === null || !Number.isInteger(file.width) || !Number.isInteger(file.height)
    || file.width <= 0 || file.height <= 0 || file.width * file.height > 4096 * 4096
    || !file.bucket || !file.region || file.public_url !== null || file.legacy_url !== null || file.legacy_path !== null
    || file.object_key !== `private/renovation-styles/${tenantId}/${fileId}.webp`) {
    throw Errors.business(404, '装修效果素材原图不存在或不可用', 'RENDERING_STYLE_FILE_NOT_FOUND');
  }
}
