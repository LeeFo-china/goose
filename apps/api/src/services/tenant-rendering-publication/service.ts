import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { RenderingLibraryPublishSchema, RenderingLibraryStyleSchema, type RenderingLibraryStyle } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';
import { AppError } from '@/errors/app-error';
import type { RenderingLibraryStorage, RenderingPublicCopyInput } from '@/gateways/rendering-library-storage/client';
import type { RenderingLibrarySourceFile, TenantRenderingLibraryRepository } from '@/repositories/tenant-rendering-library';
import type { BeginDecision, TenantRenderingPublicationRepository } from '@/repositories/tenant-rendering-publication';
import type { accessPolicyService } from '@/services/access-policy';
import type { AuthContext } from '@/services/authorization';
import { assertRenderingSourceFile } from '@/services/rendering-library-files/source-policy';

interface Dependencies {
  repository: Pick<TenantRenderingLibraryRepository, 'find' | 'findSourceFile'>;
  publicationRepository: Pick<TenantRenderingPublicationRepository, 'begin' | 'complete' | 'fail'>;
  storage: Pick<RenderingLibraryStorage, 'hasPublicCopy' | 'copyPublic' | 'resolvePublicUrl'>;
  accessPolicy: Pick<typeof accessPolicyService, 'assertTenantContext' | 'assertPermission'>;
  uuid?: () => string;
}
type ClaimedDecision = Extract<BeginDecision, { decision: 'claimed' }>;
type EligibleSource = RenderingLibrarySourceFile & { region: string; checksum: string };
const IdSchema = z.uuid('无效的素材 ID');
const ChecksumSchema = z.string().regex(/^[a-f0-9]{64}$/);

function dataError(): never {
  throw Errors.dbError('装修效果素材发布数据异常');
}

function rejectDecision(decision: string): never {
  switch (decision) {
    case 'not_found': throw Errors.business(404, '装修效果素材不存在', 'RENDERING_STYLE_NOT_FOUND');
    case 'version_conflict': throw Errors.business(409, '装修效果素材已更新，请刷新后重试', 'RENDERING_STYLE_VERSION_CONFLICT');
    case 'idempotency_conflict': throw Errors.business(409, '发布请求标识已用于其他操作', 'RENDERING_STYLE_PUBLISH_IDEMPOTENCY_CONFLICT');
    case 'in_progress': throw Errors.business(409, '装修效果素材正在发布，请稍后重试', 'RENDERING_STYLE_PUBLISH_IN_PROGRESS');
    case 'not_publishable': throw Errors.business(422, '装修效果素材不满足发布条件', 'RENDERING_STYLE_NOT_PUBLISHABLE');
    default: return dataError();
  }
}

export class TenantRenderingPublicationService {
  constructor(private readonly dependencies: Dependencies) {}

  private authorize(auth: AuthContext): { tenantId: string; employeeId: string } {
    const tenantId = this.dependencies.accessPolicy.assertTenantContext(auth);
    if (!auth.employeeId || this.dependencies.accessPolicy.assertPermission(auth, 'rendering_library.read') !== 'all'
      || this.dependencies.accessPolicy.assertPermission(auth, 'rendering_library.manage') !== 'all') throw Errors.forbidden();
    return { tenantId, employeeId: auth.employeeId };
  }

  private parse<Output>(schema: z.ZodType<Output>, input: unknown): Output {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    return parsed.data;
  }

  private async source(tenantId: string, fileId: string): Promise<EligibleSource> {
    const file = await this.dependencies.repository.findSourceFile(tenantId, fileId);
    assertRenderingSourceFile(tenantId, fileId, file);
    const checksum = ChecksumSchema.safeParse(file.checksum);
    if (!checksum.success) return rejectDecision('not_publishable');
    return { ...file, checksum: checksum.data };
  }

  private async latest(tenantId: string, styleId: string, resultVersion: number): Promise<RenderingLibraryStyle> {
    const row = await this.dependencies.repository.find(tenantId, styleId);
    if (!row) return rejectDecision('not_found');
    const parsed = RenderingLibraryStyleSchema.safeParse(row);
    if (!parsed.success) return dataError();
    const dto = parsed.data;
    // Another publication may commit between this command's completion and the final read.
    if (dto.tenant_id !== tenantId || dto.id !== styleId || dto.status === 'draft' || dto.published_version === null
      || dto.published_at === null || dto.version < dto.published_version
      || dto.published_version < resultVersion) return dataError();
    return dto;
  }

  private copyInput(tenantId: string, style: RenderingLibraryStyle, source: EligibleSource,
    claim: ClaimedDecision): RenderingPublicCopyInput {
    if (claim.source_file_id !== style.file_id || claim.public_file_id === style.file_id
      || claim.source_checksum !== source.checksum || claim.source_size_bytes !== source.size_bytes
      || claim.source_location.bucket !== source.bucket || claim.source_location.region !== source.region
      || claim.source_location.object_key !== source.object_key || claim.target_version !== style.version + 1) return dataError();
    return { tenantId, styleId: style.id, sourceFileId: source.id, targetVersion: claim.target_version,
      sourceChecksum: source.checksum, sourceSizeBytes: source.size_bytes,
      sourceLocation: { bucket: source.bucket, region: source.region, object_key: source.object_key }, publicLocation: claim.public_location };
  }

  private async publicCopy(input: RenderingPublicCopyInput, commandId: string, leaseToken: string): Promise<string> {
    let phase: 'head' | 'copy' | 'resolve' = 'head';
    try {
      if (await this.dependencies.storage.hasPublicCopy(input)) {
        phase = 'resolve';
        return await this.dependencies.storage.resolvePublicUrl(input);
      }
      phase = 'copy';
      return (await this.dependencies.storage.copyPublic(input)).publicUrl;
    } catch (error: unknown) {
      // HEAD failure or an ambiguous PUT may follow a committed write. Keep preparing for lease recovery.
      // URL resolution follows a verified existing copy and also must not mark that command failed.
      const code = error instanceof AppError ? error.code : undefined;
      const failureCode = phase !== 'resolve' && code === 'RENDERING_STORAGE_UNAVAILABLE' ? 'storage_unavailable'
        : phase === 'copy' && code === 'RENDERING_STORAGE_FAILED' ? 'copy_failed' : null;
      if (failureCode) {
        const result = await this.dependencies.publicationRepository.fail({ tenantId: input.tenantId, commandId, leaseToken, failureCode });
        if (result.decision !== 'failed' && result.decision !== 'succeeded') {
          rejectDecision(result.decision === 'lease_conflict' ? 'in_progress' : result.decision);
        }
      }
      if (code === 'RENDERING_STORAGE_UNAVAILABLE') {
        throw Errors.business(503, '装修效果素材存储暂不可用', 'RENDERING_STORAGE_UNAVAILABLE');
      }
      throw Errors.business(502, '装修效果素材公开副本准备失败，请稍后重试', 'RENDERING_STYLE_PUBLIC_COPY_FAILED');
    }
  }

  async publish(auth: AuthContext, styleIdInput: string, bodyInput: unknown): Promise<RenderingLibraryStyle> {
    const { tenantId, employeeId } = this.authorize(auth);
    const styleId = this.parse(IdSchema, styleIdInput);
    const body = this.parse(RenderingLibraryPublishSchema, bodyInput);
    const current = await this.dependencies.repository.find(tenantId, styleId);
    if (!current) return rejectDecision('not_found');
    // A successful command must remain replayable after the style version has advanced.
    // A stale request may inspect begin's decision but can never enter the copy phase.
    const source = current.version === body.expected_version ? await this.source(tenantId, current.file_id) : null;
    const requestHash = createHash('sha256').update(JSON.stringify([
      'tenant-rendering-style-publish-v1', tenantId, styleId, body.expected_version,
    ])).digest('hex');
    const leaseToken = (this.dependencies.uuid ?? randomUUID)();
    const begin = await this.dependencies.publicationRepository.begin({ tenantId, styleId,
      expectedVersion: body.expected_version, idempotencyKey: body.idempotency_key, requestHash, leaseToken });
    if (begin.decision === 'succeeded') {
      if (begin.result_version !== body.expected_version + 1) return dataError();
      return this.latest(tenantId, styleId, begin.result_version);
    }
    if (begin.decision !== 'claimed') return rejectDecision(begin.decision);
    if (!source) return dataError();
    const input = this.copyInput(tenantId, current, source, begin);
    const publicUrl = await this.publicCopy(input, begin.command_id, leaseToken);
    // A rejected complete may have committed. Never fail the command or copy again here.
    const complete = await this.dependencies.publicationRepository.complete({ tenantId,
      commandId: begin.command_id, leaseToken, publicUrl, employeeId });
    if (complete.decision !== 'succeeded') return rejectDecision(complete.decision === 'lease_conflict' ? 'in_progress' : complete.decision);
    if (complete.command_id !== begin.command_id || complete.result_version !== input.targetVersion) return dataError();
    return this.latest(tenantId, styleId, complete.result_version);
  }
}
