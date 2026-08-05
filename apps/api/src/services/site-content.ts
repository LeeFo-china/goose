import { randomBytes } from "node:crypto";
import type {
  SiteContentDraftBlock,
  SiteContentPublicAsset,
  SiteContentPublicBlock,
  SiteContentPublicDetail,
  SiteContentPublicSummary,
  SiteContentType,
} from "@gooes/domain";
import {
  SiteContentDraftBlocksSchema,
  SiteContentPublicAssetSchema,
  SiteContentPublicListSchema,
  SiteContentPublicSummarySchema,
} from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import {
  siteContentRepository,
  type SiteContentAssetRecord,
  type SiteContentEntryRecord,
  type SiteContentPublicDetailRecord,
  type SiteContentPublicSummaryRecord,
  type SiteContentRepository,
  type SiteContentVersionRecord,
} from "@/repositories/site-content";
import {
  type CreateSiteContentEntryInput,
  type CreateSiteContentVersionInput,
  type SiteContentListQuery,
  type UpdateSiteContentEntryInput,
} from "@/schema/site-content";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import {
  buildSiteContentPreviewUrl,
  buildSiteContentPublicPath,
  webSiteContentRevalidator,
  type SiteContentRevalidatorPort,
} from "@/services/site-content-web-gateway";
import {
  getSiteContentMetadataSchema,
  parsePublicSiteContentDetail,
  parsePublicSiteContentMetadata,
} from "@/services/site-content-metadata";

type SiteContentRepositoryPort = Pick<
  SiteContentRepository,
  | "listPublic"
  | "findPublic"
  | "listAdmin"
  | "findEntry"
  | "createEntryWithVersion"
  | "updateEntry"
  | "listVersions"
  | "findVersion"
  | "createVersion"
  | "findPublicAssets"
  | "publish"
  | "rollback"
  | "archive"
  | "createPreviewToken"
  | "consumePreviewToken"
>;
type AccessPolicyPort = Pick<typeof accessPolicyService, "assertPermission">;
type AuditPort = Pick<typeof platformAuditLogService, "recordBestEffort">;
export type SiteContentServiceDependencies = {
  repository?: SiteContentRepositoryPort;
  accessPolicy?: AccessPolicyPort;
  audit?: AuditPort;
  revalidator?: SiteContentRevalidatorPort;
  clock?: () => Date;
  tokenGenerator?: () => string;
  previewBaseUrl?: string;
};
export type PublishSiteContentResult = {
  entry: Awaited<ReturnType<SiteContentService["getAdminDetailWithoutPermission"]>>;
  cache_revalidation: { status: "succeeded" | "failed"; requestId?: string };
};
const READ_PERMISSION = "platform.site_content.read";
const MANAGE_PERMISSION = "platform.site_content.manage";
const PUBLISH_PERMISSION = "platform.site_content.publish";
const PREVIEW_TTL_MS = 10 * 60 * 1_000;
export class SiteContentService {
  private readonly repository: SiteContentRepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;
  private readonly revalidator: SiteContentRevalidatorPort;
  private readonly clock: () => Date;
  private readonly tokenGenerator: () => string;
  private readonly previewBaseUrl: string | undefined;
  constructor(dependencies: SiteContentServiceDependencies = {}) {
    this.repository = dependencies.repository ?? siteContentRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.audit = dependencies.audit ?? platformAuditLogService;
    this.revalidator = dependencies.revalidator ?? webSiteContentRevalidator;
    this.clock = dependencies.clock ?? (() => new Date());
    this.tokenGenerator = dependencies.tokenGenerator ?? (() => randomBytes(32).toString("base64url"));
    this.previewBaseUrl = dependencies.previewBaseUrl ?? process.env.GOOES_WEB_PUBLIC_URL?.trim();
  }
  async listPublic(contentType: SiteContentType, query: { page: number; pageSize: number }) {
    const page = await this.repository.listPublic(contentType, query);
    const expectedTotalPages = page.pagination.total === 0
      ? 0
      : Math.ceil(page.pagination.total / query.pageSize);
    if (query.page > Math.max(1, expectedTotalPages)) {
      throw Errors.business(400, "请求页码超出官网内容范围", "SITE_CONTENT_PAGE_OUT_OF_RANGE");
    }
    if (page.pagination.page !== query.page || page.pagination.pageSize !== query.pageSize) {
      throw Errors.business(500, "官网内容分页数据不合法", "SITE_CONTENT_DATA_INVALID");
    }
    const assets = await this.loadAssetMap(page.list.flatMap((record) =>
      record.published_version?.cover_file_id ? [record.published_version.cover_file_id] : []));
    const result = {
      list: page.list.map((record) => this.toPublicSummary(record, assets)),
      pagination: page.pagination,
    };
    const parsed = SiteContentPublicListSchema.safeParse(result);
    if (!parsed.success) {
      throw Errors.business(500, "官网内容分页数据不合法", "SITE_CONTENT_DATA_INVALID", parsed.error.issues);
    }
    return parsed.data;
  }
  async getPublic(contentType: SiteContentType, slug: string) {
    const record = await this.repository.findPublic(contentType, slug);
    if (!record || !record.published_version || !record.published_at) {
      throw Errors.business(404, "官网内容不存在", "SITE_CONTENT_NOT_FOUND");
    }
    const assets = await this.loadAssetMap(this.collectPublicRecordFileIds(record));
    return this.toPublicDetail(record, assets);
  }
  async listAdmin(authContext: AuthContext, query: SiteContentListQuery) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);
    return this.repository.listAdmin(query);
  }
  async getAdminDetail(authContext: AuthContext, entryId: string) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);
    return this.getAdminDetailWithoutPermission(entryId);
  }

  async getAdminDetailWithoutPermission(entryId: string) {
    const entry = await this.requireEntry(entryId);
    const versions = await this.repository.listVersions(entryId, { page: 1, pageSize: 20 });
    return { entry, latestVersion: versions.list[0] ?? null };
  }

  async createEntry(authContext: AuthContext, input: CreateSiteContentEntryInput) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
    const actorId = this.requireEmployeeId(authContext);
    await this.assertAssetsAvailable(input.version);
    const created = await this.repository.createEntryWithVersion({
      contentType: input.contentType,
      slug: input.slug,
      version: input.version,
      actorId,
    });
    return { entry: created.entry, latestVersion: created.version };
  }

  async updateEntry(authContext: AuthContext, entryId: string, input: UpdateSiteContentEntryInput) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
    const current = await this.requireEntry(entryId);
    if (input.slug && current.status === "published" && input.slug !== current.slug) {
      throw Errors.business(
        409,
        "已发布内容不能直接修改 slug，请先归档后再调整",
        "SITE_CONTENT_PUBLISHED_SLUG_IMMUTABLE",
      );
    }
    const entry = await this.repository.updateEntry(entryId, input);
    await this.recordAudit(authContext, entry, "update", "更新官网内容");
    return entry;
  }

  async listVersions(authContext: AuthContext, entryId: string, query: { page: number; pageSize: number }) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);
    await this.requireEntry(entryId);
    return this.repository.listVersions(entryId, query);
  }

  async createVersion(authContext: AuthContext, entryId: string, input: CreateSiteContentVersionInput) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
    const actorId = this.requireEmployeeId(authContext);
    const entry = await this.requireEntry(entryId);
    this.assertMetadataMatchesType(entry.content_type, input.metadata);
    await this.assertAssetsAvailable(input);
    const version = await this.repository.createVersion(entryId, input, actorId);
    await this.recordAudit(authContext, entry, "create_version", "创建官网内容版本", { versionId: version.id });
    return version;
  }

  async publish(authContext: AuthContext, entryId: string, versionId: string): Promise<PublishSiteContentResult> {
    this.assertPlatformPermission(authContext, PUBLISH_PERMISSION);
    const actorId = this.requireEmployeeId(authContext);
    await this.requireEntry(entryId);
    await this.requireOwnedVersion(entryId, versionId);
    const published = await this.repository.publish(entryId, versionId, actorId);
    return this.finishPublication(authContext, published, "publish_revalidation_failed", "发布官网内容缓存失效失败");
  }

  async rollback(authContext: AuthContext, entryId: string, versionId: string): Promise<PublishSiteContentResult> {
    this.assertPlatformPermission(authContext, PUBLISH_PERMISSION);
    const actorId = this.requireEmployeeId(authContext);
    await this.requireEntry(entryId);
    await this.requireOwnedVersion(entryId, versionId);
    const rolledBack = await this.repository.rollback(entryId, versionId, actorId);
    return this.finishPublication(authContext, rolledBack, "rollback_revalidation_failed", "回滚官网内容缓存失效失败");
  }

  async archive(authContext: AuthContext, entryId: string) {
    this.assertPlatformPermission(authContext, PUBLISH_PERMISSION);
    const actorId = this.requireEmployeeId(authContext);
    await this.requireEntry(entryId);
    const entry = await this.repository.archive(entryId, actorId);
    if (!entry) {
      throw Errors.business(404, "官网内容不存在", "SITE_CONTENT_NOT_FOUND");
    }
    return this.finishPublication(
      authContext,
      entry,
      "archive_revalidation_failed",
      "归档官网内容缓存失效失败",
    );
  }

  async createPreviewToken(authContext: AuthContext, entryId: string, versionId: string) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);
    const actorId = this.requireEmployeeId(authContext);
    await this.requireOwnedVersion(entryId, versionId);
    const token = this.tokenGenerator();
    const expiresAt = new Date(this.clock().getTime() + PREVIEW_TTL_MS).toISOString();
    const previewUrl = buildSiteContentPreviewUrl(this.previewBaseUrl, token);
    await this.repository.createPreviewToken({ token, entryId, versionId, createdBy: actorId, expiresAt });
    return { previewUrl, expiresAt };
  }

  async consumePreviewToken(token: string) {
    const now = this.clock().toISOString();
    const record = await this.repository.consumePreviewToken(token, now);
    if (!record) {
      throw Errors.business(
        401,
        "Preview token 无效、已过期或已使用",
        "INVALID_OR_EXPIRED_PREVIEW_TOKEN",
      );
    }
    const entry = await this.requireEntry(record.entry_id);
    return {
      entryId: record.entry_id,
      versionId: record.version_id,
      path: buildSiteContentPublicPath(entry),
      expiresAt: record.expires_at,
    };
  }

  async getPreviewVersion(versionId: string) {
    const version = await this.repository.findVersion(versionId);
    if (!version) throw Errors.business(404, "官网内容版本不存在", "SITE_CONTENT_VERSION_NOT_FOUND");
    const entry = await this.requireEntry(version.entry_id);
    const assets = await this.loadAssetMap(this.collectVersionFileIds(version));
    return this.toPreviewDetail(entry, version, assets);
  }

  private assertPlatformPermission(authContext: AuthContext, permission: string) {
    const isPlatformIdentity = authContext.isPlatformStaff || authContext.isPlatformAdmin;
    if (authContext.tenantId !== null || !isPlatformIdentity) {
      throw Errors.forbidden();
    }
    this.accessPolicy.assertPermission(authContext, permission);
  }

  private async finishPublication(
    authContext: AuthContext,
    entry: SiteContentEntryRecord,
    failureOperation: string,
    failureSummary: string,
  ) {
    let cacheRevalidation: PublishSiteContentResult["cache_revalidation"];
    try {
      const result = await this.revalidator.revalidate({
        entryId: entry.id,
        paths: [buildSiteContentPublicPath(entry)],
        tags: [
          `site-content:${entry.content_type}`,
          `site-content-path:${entry.content_type}:${entry.slug}`,
        ],
      });
      cacheRevalidation = { status: "succeeded", ...(result.requestId ? { requestId: result.requestId } : {}) };
    } catch {
      cacheRevalidation = { status: "failed" };
      await this.recordAudit(authContext, entry, failureOperation, failureSummary, {}, "failure");
    }
    return { entry: await this.getAdminDetailWithoutPermission(entry.id), cache_revalidation: cacheRevalidation };
  }

  private async assertAssetsAvailable(input: CreateSiteContentVersionInput) {
    const ids = this.collectInputFileIds(input);
    if (ids.length === 0) return;
    const assets = await this.repository.findPublicAssets(ids);
    const validIds = new Set(assets.flatMap((asset) => this.toTrustedAsset(asset) ? [asset.id] : []));
    const missing = ids.filter((id) => !validIds.has(id));
    if (missing.length > 0) {
      throw Errors.business(400, "官网内容素材不存在或不可公开访问", "SITE_CONTENT_ASSET_UNAVAILABLE", {
        fileIds: missing,
      });
    }
  }

  private async loadAssetMap(fileIds: string[]) {
    if (fileIds.length === 0) return new Map<string, SiteContentPublicAsset>();
    const assets = await this.repository.findPublicAssets(fileIds);
    const map = new Map<string, SiteContentPublicAsset>();
    for (const asset of assets) {
      const trusted = this.toTrustedAsset(asset);
      if (trusted) map.set(asset.id, trusted);
    }
    const missing = fileIds.filter((id) => !map.has(id));
    if (missing.length > 0) {
      throw Errors.business(500, "官网内容素材不可用", "SITE_CONTENT_ASSET_UNAVAILABLE", { fileIds: missing });
    }
    return map;
  }

  private toTrustedAsset(asset: SiteContentAssetRecord): SiteContentPublicAsset | null {
    if (asset.status !== "active" || asset.visibility !== "public") return null;
    const result = SiteContentPublicAssetSchema.safeParse({
      fileId: asset.id,
      src: asset.public_url,
      alt: "素材",
      width: asset.width,
      height: asset.height,
    });
    return result.success ? result.data : null;
  }

  private toPublicSummary(record: SiteContentPublicSummaryRecord, assets: Map<string, SiteContentPublicAsset>): SiteContentPublicSummary {
    const version = this.requirePublishedVersion(record);
    const metadata = parsePublicSiteContentMetadata(record.content_type, version.metadata);
    const result = SiteContentPublicSummarySchema.safeParse({
      id: record.id,
      contentType: record.content_type,
      slug: record.slug,
      title: version.title,
      summary: version.summary,
      cover: version.cover_file_id ? this.withAlt(this.requireAsset(assets, version.cover_file_id), version.title) : null,
      publishedAt: record.content_type === "article"
        && "displayPublishedAt" in metadata
        ? metadata.displayPublishedAt
        : record.published_at,
      metadata,
    });
    if (!result.success) {
      throw Errors.business(500, "官网公开内容数据不合法", "SITE_CONTENT_DATA_INVALID", result.error.issues);
    }
    return result.data;
  }

  private toPublicDetail(record: SiteContentPublicDetailRecord, assets: Map<string, SiteContentPublicAsset>): SiteContentPublicDetail {
    const version = this.requirePublishedVersion(record);
    return parsePublicSiteContentDetail({
      ...this.toPublicSummary(record, assets),
      seoTitle: version.seo_title,
      seoDescription: version.seo_description,
      canonicalUrl: version.canonical_url,
      blocks: this.parseStoredBlocks(version.content_blocks).map((block) => this.toPublicBlock(block, assets)),
    });
  }

  private toPreviewDetail(entry: SiteContentEntryRecord, version: SiteContentVersionRecord, assets: Map<string, SiteContentPublicAsset>) {
    const metadata = parsePublicSiteContentMetadata(entry.content_type, version.metadata);
    const publishedAt = entry.content_type === "article"
      && "displayPublishedAt" in metadata
      ? metadata.displayPublishedAt
      : entry.published_at ?? version.created_at;
    const detail = parsePublicSiteContentDetail({
      id: entry.id,
      contentType: entry.content_type,
      slug: entry.slug,
      title: version.title,
      summary: version.summary,
      cover: version.cover_file_id ? this.withAlt(this.requireAsset(assets, version.cover_file_id), version.title) : null,
      publishedAt,
      metadata,
      seoTitle: version.seo_title,
      seoDescription: version.seo_description,
      canonicalUrl: version.canonical_url,
      blocks: this.parseStoredBlocks(version.content_blocks).map((block) => this.toPublicBlock(block, assets)),
    });
    return { ...detail, preview: true as const, versionId: version.id };
  }

  private toPublicBlock(block: SiteContentDraftBlock, assets: Map<string, SiteContentPublicAsset>): SiteContentPublicBlock {
    if (block.type === "image") {
      return { type: "image", asset: this.withAlt(this.requireAsset(assets, block.fileId), block.alt) };
    }
    if (block.type === "gallery") {
      return {
        type: "gallery",
        images: block.images.map((image) => this.withAlt(this.requireAsset(assets, image.fileId), image.alt)),
      };
    }
    return block;
  }

  private collectPublicRecordFileIds(record: SiteContentPublicDetailRecord) {
    return record.published_version ? this.collectVersionFileIds(record.published_version) : [];
  }

  private collectVersionFileIds(version: Pick<SiteContentVersionRecord, "cover_file_id" | "content_blocks">) {
    const blocks = this.parseStoredBlocks(version.content_blocks);
    return this.uniqueIds([
      ...(version.cover_file_id ? [version.cover_file_id] : []),
      ...blocks.flatMap((block) =>
        block.type === "image" ? [block.fileId] : block.type === "gallery" ? block.images.map((image) => image.fileId) : []),
    ]);
  }

  private collectInputFileIds(input: CreateSiteContentVersionInput) {
    return this.collectVersionFileIds({ cover_file_id: input.coverFileId ?? null, content_blocks: input.blocks });
  }

  private parseStoredBlocks(value: unknown) {
    const result = SiteContentDraftBlocksSchema.safeParse(value);
    if (!result.success) {
      throw Errors.business(500, "官网内容数据不合法", "SITE_CONTENT_DATA_INVALID", result.error.issues);
    }
    return result.data;
  }

  private uniqueIds(ids: string[]) {
    return Array.from(new Set(ids));
  }

  private requireAsset(assets: Map<string, SiteContentPublicAsset>, fileId: string) {
    const asset = assets.get(fileId);
    if (!asset) throw Errors.business(500, "官网内容素材不可用", "SITE_CONTENT_ASSET_UNAVAILABLE");
    return asset;
  }

  private withAlt(asset: SiteContentPublicAsset, alt: string): SiteContentPublicAsset {
    return { ...asset, alt };
  }

  private requirePublishedVersion<Version>(record: {
    published_version: Version | null;
    published_at: string | null;
  }): Version {
    if (!record.published_version || !record.published_at) {
      throw Errors.business(404, "官网内容不存在", "SITE_CONTENT_NOT_FOUND");
    }
    return record.published_version;
  }

  private async requireEntry(entryId: string) {
    const entry = await this.repository.findEntry(entryId);
    if (!entry) throw Errors.business(404, "官网内容不存在", "SITE_CONTENT_NOT_FOUND");
    return entry;
  }

  private async requireOwnedVersion(entryId: string, versionId: string) {
    const version = await this.repository.findVersion(versionId);
    if (!version || version.entry_id !== entryId) {
      throw Errors.business(404, "官网内容版本不存在", "SITE_CONTENT_VERSION_NOT_FOUND");
    }
    return version;
  }

  private requireEmployeeId(authContext: AuthContext) {
    if (!authContext.employeeId) throw Errors.business(403, "当前平台账号未绑定员工", "PLATFORM_EMPLOYEE_REQUIRED");
    return authContext.employeeId;
  }

  private assertMetadataMatchesType(contentType: SiteContentType, metadata: unknown) {
    const schema = getSiteContentMetadataSchema(contentType);
    const result = schema.safeParse(metadata);
    if (!result.success) throw Errors.fromZod(result.error);
  }

  private async recordAudit(
    authContext: AuthContext,
    entry: SiteContentEntryRecord,
    operation: string,
    summary: string,
    metadata: Record<string, unknown> = {},
    status: "success" | "failure" = "success",
  ) {
    await this.audit.recordBestEffort({
      action: "platform_config_update",
      actorEmployeeId: authContext.employeeId, actorUserId: authContext.authUserId,
      resourceType: "site_content",
      resourceId: entry.id,
      resourceLabel: entry.slug,
      status, summary,
      metadata: { operation, ...metadata },
    });
  }
}
export const siteContentService = new SiteContentService();
