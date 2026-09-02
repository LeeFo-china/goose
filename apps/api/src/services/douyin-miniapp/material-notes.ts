import {
  DouyinMaterialNotePublicAssetSchema,
  type DouyinMaterialNoteBlock,
  type DouyinMaterialNoteClaimResponse,
  type DouyinMaterialNoteOwnedDetail,
  type DouyinMaterialNoteOwnedSummary,
  type DouyinMaterialNotePublicBlock,
  type DouyinMaterialNotePublicPreview,
} from '@gooes/domain';
import type { z } from 'zod';

import { Errors } from '@/errors/error-factory';
import {
  type DouyinMaterialNotesRepository,
  douyinMaterialNotesRepository,
} from '@/repositories/douyin-material-notes';
import {
  DouyinMaterialNoteClaimCommandResponseSchema,
  DouyinMaterialNoteClaimIdParamsSchema,
  DouyinMaterialNoteClearResponseSchema,
  DouyinMaterialNoteIdParamsSchema,
  DouyinMaterialNoteListQuerySchema,
  DouyinMaterialNoteOwnedDetailResponseSchema,
  DouyinMaterialNoteOwnedListResponseSchema,
  DouyinMaterialNotePreviewResponseSchema,
  DouyinMaterialNotePublicListResponseSchema,
  DouyinMaterialNoteRemoveResponseSchema,
  type DouyinMaterialNoteListQuery,
} from '@/schema/douyin-material-notes';
import { resolveStoredFileUrl } from '@/services/files/file-url-resolver';
import { PaginationQuerySchema, type PaginationQuery } from '@/schema/request';
import type { JwtPayload } from '@/utils/jwt';

import {
  type DouyinMaterialNoteContext,
  type DouyinMaterialNoteContextResolver,
  douyinMaterialNoteContextResolver,
} from './material-note-context';

type RepositoryPort = Pick<DouyinMaterialNotesRepository,
  'listPublic' | 'findPublicPreview' | 'claim' | 'listOwned' |
  'findOwnedAccess' | 'findOwnedDetail' | 'findMaterialImageAssets' | 'remove' | 'clear'>;
type ContextResolverPort = Pick<DouyinMaterialNoteContextResolver, 'resolve'>;
type PublicRow = Awaited<ReturnType<RepositoryPort['listPublic']>>['rows'][number];
type OwnedRow = Awaited<ReturnType<RepositoryPort['listOwned']>>['rows'][number];
type OwnedDetailRow = NonNullable<Awaited<ReturnType<RepositoryPort['findOwnedDetail']>>>;
type ImageAssetRow = Awaited<ReturnType<RepositoryPort['findMaterialImageAssets']>>[number];

export class DouyinMiniappMaterialNotesService {
  private readonly repository: RepositoryPort;
  private readonly contextResolver: ContextResolverPort;

  constructor(dependencies: {
    readonly repository?: RepositoryPort;
    readonly contextResolver?: ContextResolverPort;
  } = {}) {
    this.repository = dependencies.repository ?? douyinMaterialNotesRepository;
    this.contextResolver = dependencies.contextResolver ?? douyinMaterialNoteContextResolver;
  }

  async listPublic(user: JwtPayload | undefined, input: DouyinMaterialNoteListQuery) {
    const context = await this.contextResolver.resolve(user);
    const query = parseInput(DouyinMaterialNoteListQuerySchema, input);
    const result = await this.repository.listPublic({
      ...repositoryIdentity(context),
      ...query,
    });
    return parseOutput(DouyinMaterialNotePublicListResponseSchema, {
      list: result.rows.map(mapPublicPreview),
      pagination: pagination(query, result.total),
    });
  }

  async getPublicPreview(user: JwtPayload | undefined, noteId: string) {
    const context = await this.contextResolver.resolve(user);
    const { id } = parseInput(DouyinMaterialNoteIdParamsSchema, { id: noteId });
    const row = await this.repository.findPublicPreview({
      ...repositoryIdentity(context),
      noteId: id,
    });
    if (!row) throwNoteNotFound();
    return parseOutput(DouyinMaterialNotePreviewResponseSchema, mapPublicPreview(row));
  }

  async claim(user: JwtPayload | undefined, noteId: string) {
    const context = await this.contextResolver.resolve(user);
    const { id } = parseInput(DouyinMaterialNoteIdParamsSchema, { id: noteId });
    const result = await this.repository.claim({
      ...repositoryIdentity(context),
      noteId: id,
    });
    return parseOutput(
      DouyinMaterialNoteClaimCommandResponseSchema,
      await this.mapClaimResponse(context.tenantId, result),
    );
  }

  async listOwned(user: JwtPayload | undefined, input: PaginationQuery) {
    const context = await this.contextResolver.resolve(user);
    const query = parseInput(PaginationQuerySchema, input);
    const result = await this.repository.listOwned({
      ...repositoryIdentity(context),
      ...query,
    });
    return parseOutput(DouyinMaterialNoteOwnedListResponseSchema, {
      list: result.rows.map(mapOwnedSummary),
      pagination: pagination(query, result.total),
    });
  }

  async getOwnedDetail(user: JwtPayload | undefined, claimId: string) {
    const context = await this.contextResolver.resolve(user);
    const params = parseInput(DouyinMaterialNoteClaimIdParamsSchema, { claimId });
    const input = {
      ...repositoryIdentity(context),
      claimId: params.claimId,
    };
    const access = await this.repository.findOwnedAccess(input);
    if (!access) throwClaimNotFound();
    const status = ownedAccessStatus(access, params.claimId);
    if (status === 'withdrawn') throwWithdrawn();
    if (status === 'draft') throwClaimNotFound();
    const row = await this.repository.findOwnedDetail(input);
    if (!row) {
      const racedAccess = await this.repository.findOwnedAccess(input);
      if (!racedAccess) throwClaimNotFound();
      if (ownedAccessStatus(racedAccess, params.claimId) === 'withdrawn') {
        throwWithdrawn();
      }
      throwClaimNotFound();
    }
    if (row.id !== params.claimId || row.note.id !== access.note.id
      || (row.note.status !== 'published' && row.note.status !== 'archived')) {
      throwInvalidResponse();
    }
    return parseOutput(
      DouyinMaterialNoteOwnedDetailResponseSchema,
      await this.mapOwnedDetail(context.tenantId, row),
    );
  }

  async remove(user: JwtPayload | undefined, claimId: string) {
    const context = await this.contextResolver.resolve(user);
    const params = parseInput(DouyinMaterialNoteClaimIdParamsSchema, { claimId });
    const result = await this.repository.remove({
      ...repositoryIdentity(context),
      claimId: params.claimId,
    });
    return parseOutput(DouyinMaterialNoteRemoveResponseSchema, result);
  }

  async clear(user: JwtPayload | undefined) {
    const context = await this.contextResolver.resolve(user);
    const result = await this.repository.clear(repositoryIdentity(context));
    return parseOutput(DouyinMaterialNoteClearResponseSchema, result);
  }

  private async mapClaimResponse(
    tenantId: string,
    result: Awaited<ReturnType<RepositoryPort['claim']>>,
  ): Promise<DouyinMaterialNoteClaimResponse> {
    return {
      ...result,
      material: {
        ...result.material,
        content_blocks: await this.toPublicBlocks(tenantId, result.material.content_blocks),
      },
    };
  }

  private async mapOwnedDetail(
    tenantId: string,
    row: OwnedDetailRow,
  ): Promise<DouyinMaterialNoteOwnedDetail> {
    return {
      ...mapOwnedSummary(row),
      content_blocks: await this.toPublicBlocks(tenantId, row.claimed_version.content_blocks),
    };
  }

  private async toPublicBlocks(
    tenantId: string,
    blocks: readonly DouyinMaterialNoteBlock[],
  ): Promise<DouyinMaterialNotePublicBlock[]> {
    const fileIds = uniqueIds(blocks.flatMap((block) =>
      block.type === 'image' ? [block.fileId] : []));
    if (fileIds.length === 0) return [...blocks] as DouyinMaterialNotePublicBlock[];
    const assets = await this.repository.findMaterialImageAssets({ tenantId, fileIds });
    const assetMap = new Map<string, ImageAssetRow>();
    for (const asset of assets) assetMap.set(asset.id, asset);
    const missing = fileIds.filter((fileId) => !this.toTrustedAsset(assetMap.get(fileId), tenantId));
    if (missing.length > 0) throwMaterialAssetUnavailable(missing);
    return blocks.map((block) => {
      if (block.type !== 'image') return block;
      const asset = this.toTrustedAsset(assetMap.get(block.fileId), tenantId);
      if (!asset) throwMaterialAssetUnavailable([block.fileId]);
      return {
        type: 'image',
        asset: { ...asset, alt: block.alt },
        ...(block.caption ? { caption: block.caption } : {}),
      };
    });
  }

  private toTrustedAsset(
    asset: ImageAssetRow | undefined,
    tenantId: string,
  ) {
    if (!asset || asset.tenant_id !== tenantId || asset.status !== 'active'
      || asset.visibility !== 'public' || !asset.mime_type.toLowerCase().startsWith('image/')) {
      return null;
    }
    const src = resolveStoredFileUrl(asset.public_url || asset.object_key);
    if (!src) return null;
    const result = DouyinMaterialNotePublicAssetSchema.safeParse({
      fileId: asset.id,
      src,
      alt: '资料图片',
      width: asset.width,
      height: asset.height,
    });
    return result.success ? result.data : null;
  }
}

function repositoryIdentity(context: DouyinMaterialNoteContext) {
  return {
    tenantId: context.tenantId,
    installationId: context.installationId,
    subjectHash: context.subjectHash,
  };
}

function mapPublicPreview(row: PublicRow): DouyinMaterialNotePublicPreview {
  return {
    id: row.id,
    ...row.published_version,
    published_at: row.published_at,
    claimed: row.claims.length === 1,
  };
}

function mapOwnedSummary(row: OwnedRow): DouyinMaterialNoteOwnedSummary {
  return {
    claim_id: row.id,
    id: row.note.id,
    version: row.claimed_version.version_no,
    title: row.claimed_version.title,
    summary: row.claimed_version.summary,
    category: row.claimed_version.category,
    applicable_to: row.claimed_version.applicable_to,
    claimed_at: row.claimed_at,
  };
}

function pagination(input: PaginationQuery, total: number) {
  if (!Number.isSafeInteger(total) || total < 0) throwInvalidResponse();
  return {
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

function parseInput<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

function parseOutput<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throwInvalidResponse();
  return result.data;
}

function throwNoteNotFound(): never {
  throw Errors.business(404, '资料不存在', 'MATERIAL_NOTE_NOT_FOUND');
}

function throwClaimNotFound(): never {
  throw Errors.business(404, '领取记录不存在', 'MATERIAL_NOTE_CLAIM_NOT_FOUND');
}

function throwWithdrawn(): never {
  throw Errors.business(410, '资料已停止提供', 'MATERIAL_NOTE_WITHDRAWN');
}

function ownedAccessStatus(
  access: { readonly id: string; readonly note: { readonly status: unknown } },
  claimId: string,
): 'draft' | 'published' | 'archived' | 'withdrawn' {
  if (access.id !== claimId) throwInvalidResponse();
  switch (access.note.status) {
    case 'draft':
    case 'published':
    case 'archived':
    case 'withdrawn':
      return access.note.status;
    default:
      throwInvalidResponse();
  }
}

function throwInvalidResponse(): never {
  throw Errors.business(
    500,
    '抖音资料响应格式无效',
    'MATERIAL_NOTE_RESPONSE_INVALID',
  );
}

function throwMaterialAssetUnavailable(fileIds: readonly string[]): never {
  throw Errors.business(
    500,
    '抖音资料图片素材不可用',
    'MATERIAL_NOTE_RESPONSE_INVALID',
    { fileIds },
  );
}

function uniqueIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids));
}

let defaultService: DouyinMiniappMaterialNotesService | undefined;
export function getDouyinMiniappMaterialNotesService() {
  defaultService ??= new DouyinMiniappMaterialNotesService();
  return defaultService;
}
