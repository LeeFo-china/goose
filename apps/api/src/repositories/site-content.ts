import { createHash } from "node:crypto";
import type {
  SiteContentStatus,
  SiteContentType,
} from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import type {
  CreateSiteContentVersionInput,
  SiteContentListQuery,
} from "@/schema/site-content";
import { SupabaseDB } from "@/utils/supabase";

export type DatabaseResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

export interface SiteContentQuery extends PromiseLike<DatabaseResult> {
  select(columns: string, options?: { count?: "exact" }): SiteContentQuery;
  insert(value: unknown): SiteContentQuery;
  update(value: unknown): SiteContentQuery;
  delete(): SiteContentQuery;
  eq(column: string, value: unknown): SiteContentQuery;
  neq(column: string, value: unknown): SiteContentQuery;
  is(column: string, value: null): SiteContentQuery;
  gt(column: string, value: string): SiteContentQuery;
  in(column: string, values: readonly string[]): SiteContentQuery;
  or(filters: string): SiteContentQuery;
  order(column: string, options: { ascending: boolean }): SiteContentQuery;
  range(from: number, to: number): SiteContentQuery;
  limit(count: number): SiteContentQuery;
  single(): Promise<DatabaseResult>;
  maybeSingle(): Promise<DatabaseResult>;
}

export interface SiteContentDatabaseClient {
  from(table: string): SiteContentQuery;
  rpc(name: string, args: Record<string, string>): PromiseLike<DatabaseResult>;
}

export type SiteContentEntryRecord = {
  id: string;
  content_type: SiteContentType;
  slug: string;
  status: SiteContentStatus;
  published_version_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SiteContentVersionRecord = {
  id: string;
  entry_id: string;
  version_no: number;
  title: string;
  summary: string | null;
  cover_file_id: string | null;
  content_blocks: unknown;
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
};

export type SiteContentPublicSummaryVersionRecord = Pick<
  SiteContentVersionRecord,
  | "id"
  | "title"
  | "summary"
  | "cover_file_id"
>;

export type SiteContentPublicDetailVersionRecord = SiteContentPublicSummaryVersionRecord & Pick<
  SiteContentVersionRecord,
  | "content_blocks"
  | "seo_title"
  | "seo_description"
  | "canonical_url"
>;

type SiteContentPublicEntryRecord = Pick<
  SiteContentEntryRecord,
  "id" | "content_type" | "slug" | "published_at"
>;

export type SiteContentPublicSummaryRecord = SiteContentPublicEntryRecord & {
  published_version: SiteContentPublicSummaryVersionRecord | null;
};

export type SiteContentPublicDetailRecord = SiteContentPublicEntryRecord & {
  published_version: SiteContentPublicDetailVersionRecord | null;
};

export type SiteContentAssetRecord = {
  id: string;
  public_url: string | null;
  width: number | null;
  height: number | null;
  status: string;
  visibility: string;
};

export type SitePreviewTokenRecord = {
  entry_id: string;
  version_id: string;
  expires_at: string;
  consumed_at: string | null;
};

const ENTRY_SELECT =
  "id,content_type,slug,status,published_version_id,published_at,created_at,updated_at";
const PUBLIC_ENTRY_SELECT = "id,content_type,slug,published_at";
const VERSION_SELECT =
  "id,entry_id,version_no,title,summary,cover_file_id,content_blocks,seo_title,seo_description,canonical_url,metadata,created_by,created_at";
const PUBLIC_SUMMARY_VERSION_SELECT = "id,title,summary,cover_file_id";
const PUBLIC_DETAIL_VERSION_SELECT =
  `${PUBLIC_SUMMARY_VERSION_SELECT},content_blocks,seo_title,seo_description,canonical_url`;
const PUBLIC_SUMMARY_SELECT = `${PUBLIC_ENTRY_SELECT},published_version:site_content_versions!site_content_published_version_fk(${PUBLIC_SUMMARY_VERSION_SELECT})`;
const PUBLIC_DETAIL_SELECT = `${PUBLIC_ENTRY_SELECT},published_version:site_content_versions!site_content_published_version_fk(${PUBLIC_DETAIL_VERSION_SELECT})`;
const MAX_VERSION_INSERT_ATTEMPTS = 3;

function pageRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

function buildPage<T>(data: unknown, count: number | null | undefined, page: number, pageSize: number) {
  const total = count ?? 0;
  return {
    list: (data ?? []) as T[],
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    },
  };
}

function dbErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

export class SiteContentRepository {
  constructor(
    private readonly client: SiteContentDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as SiteContentDatabaseClient,
  ) {}

  async listPublic(contentType: SiteContentType, query: { page: number; pageSize: number }) {
    const { from, to } = pageRange(query.page, query.pageSize);
    const { data, error, count } = await this.client
      .from("site_content_entries")
      .select(PUBLIC_SUMMARY_SELECT, { count: "exact" })
      .eq("content_type", contentType)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .range(from, to);
    if (error) throw Errors.dbError("查询官网公开内容失败", error);
    return buildPage<SiteContentPublicSummaryRecord>(data, count, query.page, query.pageSize);
  }

  async findPublic(contentType: SiteContentType, slug: string) {
    const { data, error } = await this.client
      .from("site_content_entries")
      .select(PUBLIC_DETAIL_SELECT)
      .eq("content_type", contentType)
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw Errors.dbError("查询官网公开内容详情失败", error);
    return (data as SiteContentPublicDetailRecord | null) ?? null;
  }

  async listAdmin(query: SiteContentListQuery) {
    const { from, to } = pageRange(query.page, query.pageSize);
    let request = this.client
      .from("site_content_entries")
      .select(ENTRY_SELECT, { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (query.contentType) request = request.eq("content_type", query.contentType);
    if (query.status) request = request.eq("status", query.status);
    if (query.keyword) {
      const keyword = query.keyword.replace(/[,()]/g, " ").trim();
      if (keyword) request = request.or(`slug.ilike.%${keyword}%`);
    }
    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询官网内容列表失败", error);
    return buildPage<SiteContentEntryRecord>(data, count, query.page, query.pageSize);
  }

  async findEntry(entryId: string) {
    const { data, error } = await this.client
      .from("site_content_entries")
      .select(ENTRY_SELECT)
      .eq("id", entryId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询官网内容失败", error);
    return (data as SiteContentEntryRecord | null) ?? null;
  }

  async createEntry(input: { contentType: SiteContentType; slug: string }) {
    const { data, error } = await this.client
      .from("site_content_entries")
      .insert({ content_type: input.contentType, slug: input.slug })
      .select(ENTRY_SELECT)
      .single();
    if (error) throw Errors.dbError("创建官网内容失败", error);
    return data as SiteContentEntryRecord;
  }

  async updateEntry(entryId: string, input: { slug?: string }) {
    const { data, error } = await this.client
      .from("site_content_entries")
      .update(input.slug === undefined ? {} : { slug: input.slug })
      .eq("id", entryId)
      .neq("status", "published")
      .select(ENTRY_SELECT)
      .maybeSingle();
    if (error) throw Errors.dbError("更新官网内容失败", error);
    if (!data) {
      throw Errors.business(
        409,
        "已发布内容不能直接修改 slug，请先归档后再调整",
        "SITE_CONTENT_PUBLISHED_SLUG_IMMUTABLE",
      );
    }
    return data as SiteContentEntryRecord;
  }

  async deleteDraftEntry(entryId: string) {
    const { error } = await this.client
      .from("site_content_entries")
      .delete()
      .eq("id", entryId)
      .eq("status", "draft")
      .is("published_version_id", null);
    if (error) throw Errors.dbError("清理官网内容空草稿失败", error);
    return true;
  }

  async listVersions(entryId: string, query: { page: number; pageSize: number }) {
    const { from, to } = pageRange(query.page, query.pageSize);
    const { data, error, count } = await this.client
      .from("site_content_versions")
      .select(VERSION_SELECT, { count: "exact" })
      .eq("entry_id", entryId)
      .order("version_no", { ascending: false })
      .range(from, to);
    if (error) throw Errors.dbError("查询官网内容版本失败", error);
    return buildPage<SiteContentVersionRecord>(data, count, query.page, query.pageSize);
  }

  async findVersion(versionId: string) {
    const { data, error } = await this.client
      .from("site_content_versions")
      .select(VERSION_SELECT)
      .eq("id", versionId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询官网内容版本详情失败", error);
    return (data as SiteContentVersionRecord | null) ?? null;
  }

  async createVersion(entryId: string, input: CreateSiteContentVersionInput, actorId: string) {
    for (let attempt = 0; attempt < MAX_VERSION_INSERT_ATTEMPTS; attempt += 1) {
      const latest = await this.findLatestVersionNumber(entryId);
      const { data, error } = await this.client
        .from("site_content_versions")
        .insert({
          entry_id: entryId,
          version_no: latest + 1,
          title: input.title,
          summary: input.summary ?? null,
          cover_file_id: input.coverFileId ?? null,
          content_blocks: input.blocks,
          seo_title: input.seoTitle ?? null,
          seo_description: input.seoDescription ?? null,
          canonical_url: input.canonicalUrl ?? null,
          metadata: input.metadata ?? {},
          created_by: actorId,
        })
        .select(VERSION_SELECT)
        .single();
      if (!error) return data as SiteContentVersionRecord;
      if (dbErrorCode(error) !== "23505" || attempt === MAX_VERSION_INSERT_ATTEMPTS - 1) {
        throw Errors.dbError("创建官网内容版本失败", error);
      }
    }
    throw Errors.dbError("创建官网内容版本失败");
  }

  private async findLatestVersionNumber(entryId: string) {
    const { data, error } = await this.client
      .from("site_content_versions")
      .select("version_no")
      .eq("entry_id", entryId)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError("查询官网内容最新版本失败", error);
    if (typeof data !== "object" || data === null || !("version_no" in data)) return 0;
    return typeof data.version_no === "number" ? data.version_no : 0;
  }

  async findPublicAssets(fileIds: readonly string[]) {
    if (fileIds.length === 0) return [];
    const { data, error } = await this.client
      .from("platform_file_objects")
      .select("id,public_url,width,height,status,visibility")
      .in("id", fileIds)
      .eq("status", "active")
      .eq("visibility", "public");
    if (error) throw Errors.dbError("查询官网内容素材失败", error);
    return (data ?? []) as SiteContentAssetRecord[];
  }

  async publish(entryId: string, versionId: string, actorId: string) {
    return this.callPublicationRpc("publish_site_content", entryId, versionId, actorId);
  }

  async rollback(entryId: string, versionId: string, actorId: string) {
    return this.callPublicationRpc("rollback_site_content", entryId, versionId, actorId);
  }

  private async callPublicationRpc(name: string, entryId: string, versionId: string, actorId: string) {
    const { data, error } = await this.client.rpc(name, {
      p_entry_id: entryId,
      p_version_id: versionId,
      p_actor_id: actorId,
    });
    if (error) throw Errors.dbError("切换官网内容发布版本失败", error);
    return data as SiteContentEntryRecord;
  }

  async archive(entryId: string) {
    const { data, error } = await this.client
      .from("site_content_entries")
      .update({ status: "archived" })
      .eq("id", entryId)
      .select(ENTRY_SELECT)
      .single();
    if (error) throw Errors.dbError("归档官网内容失败", error);
    return data as SiteContentEntryRecord;
  }

  async createPreviewToken(input: {
    token: string;
    entryId: string;
    versionId: string;
    createdBy: string;
    expiresAt: string;
  }) {
    const { data, error } = await this.client
      .from("site_preview_tokens")
      .insert({
        token_hash: createHash("sha256").update(input.token).digest("hex"),
        entry_id: input.entryId,
        version_id: input.versionId,
        created_by: input.createdBy,
        expires_at: input.expiresAt,
      })
      .select("id,entry_id,version_id,expires_at")
      .single();
    if (error) throw Errors.dbError("创建官网内容预览凭证失败", error);
    return data;
  }

  async consumePreviewToken(token: string, now: string) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { data, error } = await this.client
      .from("site_preview_tokens")
      .update({ consumed_at: now })
      .eq("token_hash", tokenHash)
      .is("consumed_at", null)
      .gt("expires_at", now)
      .select("entry_id,version_id,expires_at,consumed_at")
      .maybeSingle();
    if (error) throw Errors.dbError("消费官网内容预览凭证失败", error);
    return (data as SitePreviewTokenRecord | null) ?? null;
  }
}

export const siteContentRepository = new SiteContentRepository();
