import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { RenderingLibraryBatchPreviewSchema, RenderingLibraryBatchPreviewResultSchema,
  type RenderingLibraryBatchPreviewResult, type RenderingLibraryFileUploadResult, type RenderingLibraryFilePreviewResult } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';
import { RENDERING_PREVIEW_TTL_SECONDS, type RenderingLibraryStorage } from '@/gateways/rendering-library-storage/client';
import type { TenantRenderingLibraryRepository } from '@/repositories/tenant-rendering-library';
import type { accessPolicyService } from '@/services/access-policy';
import type { AuthContext } from '@/services/authorization';
import { normalizeRenderingSource } from './image';
import { assertRenderingSourceFile } from './source-policy';

interface Dependencies {
  repository: Pick<TenantRenderingLibraryRepository, 'stageSourceFile' | 'activateSourceFile' | 'findSourceFile' | 'findSourceFiles'>;
  storage: Pick<RenderingLibraryStorage, 'location' | 'put' | 'preview' | 'previews'>;
  accessPolicy: Pick<typeof accessPolicyService, 'assertTenantContext' | 'assertPermission'>;
}
const IdSchema = z.uuid('无效的素材文件 ID');

function previewExpiresAt(): string {
  // COS SDK starts signatures at round(now / 1000) - 1. Floor before
  // signing so our advertised expiry never extends its effective window.
  return new Date((Math.floor(Date.now() / 1000) - 1 + RENDERING_PREVIEW_TTL_SECONDS) * 1000).toISOString();
}

export class RenderingLibraryFilesService {
  constructor(private readonly dependencies: Dependencies) {}

  private authorize(auth: AuthContext, write: boolean): { tenantId: string; employeeId: string } {
    const tenantId = this.dependencies.accessPolicy.assertTenantContext(auth);
    if (!auth.employeeId || this.dependencies.accessPolicy.assertPermission(auth, 'rendering_library.read') !== 'all') {
      throw Errors.forbidden();
    }
    if (write && this.dependencies.accessPolicy.assertPermission(auth, 'rendering_library.manage') !== 'all') throw Errors.forbidden();
    return { tenantId, employeeId: auth.employeeId };
  }

  assertUploadAccess(auth: AuthContext): void {
    this.authorize(auth, true);
  }

  async upload(auth: AuthContext, input: { bytes: Buffer; mimeType: string }): Promise<RenderingLibraryFileUploadResult> {
    const { tenantId, employeeId } = this.authorize(auth, true);
    const normalized = await normalizeRenderingSource(input);
    const id = randomUUID();
    const location = await this.dependencies.storage.location(tenantId, id);
    await this.dependencies.repository.stageSourceFile({ id, tenantId, employeeId, authUserId: auth.authUserId,
      location, sizeBytes: normalized.bytes.length, width: normalized.width, height: normalized.height,
      checksum: createHash('sha256').update(normalized.bytes).digest('hex') });
    // Keep failed staged records for manual reconciliation; never activate before COS confirms the write.
    await this.dependencies.storage.put(tenantId, id, location, normalized.bytes);
    const file = await this.dependencies.repository.activateSourceFile(tenantId, id);
    assertRenderingSourceFile(tenantId, id, file);
    return { file_id: id, mime_type: 'image/webp', size_bytes: file.size_bytes, width: file.width, height: file.height };
  }

  async preview(auth: AuthContext, inputId: string): Promise<RenderingLibraryFilePreviewResult> {
    const { tenantId } = this.authorize(auth, false);
    const parsed = IdSchema.safeParse(inputId);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const id = parsed.data;
    const file = await this.dependencies.repository.findSourceFile(tenantId, id);
    assertRenderingSourceFile(tenantId, id, file);
    const expiresAt = previewExpiresAt();
    const url = await this.dependencies.storage.preview(tenantId, id, {
      bucket: file.bucket, region: file.region, object_key: file.object_key,
    });
    return { file_id: id, url, expires_at: expiresAt };
  }

  async previews(auth: AuthContext, input: unknown): Promise<RenderingLibraryBatchPreviewResult> {
    const { tenantId } = this.authorize(auth, false);
    const parsed = RenderingLibraryBatchPreviewSchema.safeParse(input);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const rows = await this.dependencies.repository.findSourceFiles(tenantId, parsed.data.file_ids);
    const byId = new Map(rows.map((file) => [file.id, file]));
    const files = parsed.data.file_ids.map((id) => {
      const file = byId.get(id) ?? null;
      assertRenderingSourceFile(tenantId, id, file);
      return { id, location: { bucket: file.bucket, region: file.region, object_key: file.object_key } };
    });
    // All source policy checks finish before any signature is generated.
    const expires_at = previewExpiresAt();
    const urls = await this.dependencies.storage.previews(tenantId, files);
    const result = RenderingLibraryBatchPreviewResultSchema.safeParse({
      items: files.map((file, index) => ({ file_id: file.id, url: urls[index], expires_at })),
    });
    if (!result.success) throw Errors.business(502, '装修效果素材存储操作失败', 'RENDERING_STORAGE_FAILED');
    return result.data;
  }
}
