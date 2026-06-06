import { Errors } from "@/errors/error-factory";
import type {
  CreateVisitorPictureCommentInput,
  VisitorPictureCommentListQuery,
} from "@/schema/visitor-picture-library";
import { systemSettingsService } from "@/services/system-settings";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { SupabaseDB } from "@/utils/supabase";

const COMMENT_DEFAULT_STATUS_SETTING = "PICTURE_COMMENT_DEFAULT_STATUS";
const COMMENT_RATE_LIMIT_SHORT_WINDOW_MS = 60 * 1000;
const COMMENT_RATE_LIMIT_SHORT_MAX = 3;
const COMMENT_RATE_LIMIT_LONG_WINDOW_MS = 10 * 60 * 1000;
const COMMENT_RATE_LIMIT_LONG_MAX = 20;

type PictureCommentRow = {
  id: string;
  asset_id: string;
  visitor_id: string;
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PictureCommentImageRecord = {
  id: string;
  comment_id: string;
  file_object_id: string;
  sort_order: number;
  status: string;
  created_at: string;
  file_object: {
    id: string;
    object_key: string;
    mime_type: string;
    size_bytes: number;
    width: number | null;
    height: number | null;
  } | null;
};

export type VisitorPictureCommentRecord = PictureCommentRow & {
  images: PictureCommentImageRecord[];
};

type PictureCommentImageRow = Omit<PictureCommentImageRecord, "file_object"> & {
  platform_file_objects: PictureCommentImageRecord["file_object"]
    | PictureCommentImageRecord["file_object"][]
    | null;
};

type PictureCommentSqlRow = PictureCommentRow & {
  total_count: number | string | bigint;
};

type PictureCommentImageSqlRow = Omit<PictureCommentImageRecord, "file_object"> & {
  file_object: PictureCommentImageRecord["file_object"];
};

type CommentListTiming = Record<string, number | string | null>;

class VisitorPictureCommentsRepository {
  async list(
    assetId: string,
    query: VisitorPictureCommentListQuery,
    timing: CommentListTiming | null = null,
  ) {
    const directSql = getDirectPostgresSql();
    if (directSql) {
      try {
        return await this.listDirect(assetId, query, timing, directSql);
      } catch {
        return this.listSupabase(assetId, query, timing);
      }
    }

    return this.listSupabase(assetId, query, timing);
  }

  private async listDirect(
    assetId: string,
    query: VisitorPictureCommentListQuery,
    timing: CommentListTiming | null,
    sql: NonNullable<ReturnType<typeof getDirectPostgresSql>>,
  ) {
    const from = (query.page - 1) * query.pageSize;
    const rows = await this.measureStep(timing, "query_ms", () => sql<PictureCommentSqlRow[]>`
      SELECT
        id,
        asset_id,
        visitor_id,
        content,
        status,
        created_at,
        updated_at,
        deleted_at,
        count(*) OVER() AS total_count
      FROM public.picture_asset_comments
      WHERE asset_id = ${assetId}::uuid
        AND status = 'visible'
        AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
      OFFSET ${from}
      LIMIT ${query.pageSize}
    `);
    const comments = rows.map(({ total_count: _totalCount, ...row }) => row);
    const list = await this.measureStep(timing, "images_ms", () =>
      this.attachImagesDirect(comments, sql)
    );
    const total = Number(rows[0]?.total_count ?? 0);
    return this.toPage(list, query, total);
  }

  private async listSupabase(
    assetId: string,
    query: VisitorPictureCommentListQuery,
    timing: CommentListTiming | null,
  ) {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const { data, error, count } = await this.measureStep(timing, "query_ms", async () =>
      SupabaseDB.getAdminClient()
        .from("picture_asset_comments")
        .select("*", { count: "exact" })
        .eq("asset_id", assetId)
        .eq("status", "visible")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
    );
    if (error) throw Errors.dbError("查询图片评论失败", error);

    const list = await this.measureStep(timing, "images_ms", () =>
      this.attachImages((data || []) as PictureCommentRow[])
    );
    return this.toPage(list, query, count || 0);
  }

  async create(input: {
    assetId: string;
    visitorId: string;
    body: CreateVisitorPictureCommentInput;
  }) {
    await this.assertPublishedAsset(input.assetId);
    await this.assertCommentRateLimit(input.assetId, input.visitorId);
    await this.assertCommentImages(input.body.image_file_ids);
    const status = await this.resolveCreateStatus();

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_comments")
      .insert({
        asset_id: input.assetId,
        visitor_id: input.visitorId,
        content: input.body.content,
        status,
      })
      .select("*")
      .maybeSingle();
    if (error) throw Errors.dbError("创建图片评论失败", error);
    if (!data) throw Errors.badRequest("创建图片评论失败");

    const comment = data as PictureCommentRow;
    await this.insertCommentImages(comment.id, input.body.image_file_ids);
    const list = await this.attachImages([comment]);
    if (status === "visible") this.incrementCommentCountBestEffort(input.assetId);
    return list[0] ?? { ...comment, images: [] };
  }

  private async resolveCreateStatus() {
    const value = await systemSettingsService.getString(
      COMMENT_DEFAULT_STATUS_SETTING,
      "visible",
    );
    return value === "pending" ? "pending" : "visible";
  }

  private async assertCommentRateLimit(assetId: string, visitorId: string) {
    const now = Date.now();
    const shortSince = new Date(now - COMMENT_RATE_LIMIT_SHORT_WINDOW_MS).toISOString();
    const longSince = new Date(now - COMMENT_RATE_LIMIT_LONG_WINDOW_MS).toISOString();
    const [shortCount, longCount] = await Promise.all([
      this.countRecentComments(assetId, visitorId, shortSince),
      this.countRecentComments(assetId, visitorId, longSince),
    ]);

    if (shortCount >= COMMENT_RATE_LIMIT_SHORT_MAX) {
      throw Errors.business(429, "评论太频繁，请稍后再试", "PICTURE_COMMENT_RATE_LIMITED", {
        window_seconds: COMMENT_RATE_LIMIT_SHORT_WINDOW_MS / 1000,
        limit: COMMENT_RATE_LIMIT_SHORT_MAX,
      });
    }

    if (longCount >= COMMENT_RATE_LIMIT_LONG_MAX) {
      throw Errors.business(429, "评论太频繁，请稍后再试", "PICTURE_COMMENT_RATE_LIMITED", {
        window_seconds: COMMENT_RATE_LIMIT_LONG_WINDOW_MS / 1000,
        limit: COMMENT_RATE_LIMIT_LONG_MAX,
      });
    }
  }

  private async countRecentComments(assetId: string, visitorId: string, since: string) {
    const { count, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_comments")
      .select("id", { count: "exact", head: true })
      .eq("asset_id", assetId)
      .eq("visitor_id", visitorId)
      .is("deleted_at", null)
      .gte("created_at", since);
    if (error) throw Errors.dbError("查询评论频率失败", error);
    return count || 0;
  }

  private async assertPublishedAsset(assetId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_assets")
      .select("id")
      .eq("id", assetId)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw Errors.dbError("查询图片失败", error);
    if (!data) throw Errors.notFound("图片不存在或未发布");
  }

  private async assertCommentImages(fileObjectIds: string[]) {
    if (fileObjectIds.length === 0) return;
    const uniqueIds = Array.from(new Set(fileObjectIds));
    if (uniqueIds.length !== fileObjectIds.length) {
      throw Errors.badRequest("评论图片不能重复");
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("platform_file_objects")
      .select("id,scene,status,deleted_at")
      .in("id", uniqueIds);
    if (error) throw Errors.dbError("查询评论图片失败", error);
    if ((data || []).length !== uniqueIds.length) {
      throw Errors.badRequest("评论图片不存在");
    }
    const invalid = (data || []).some((item) =>
      item.scene !== "picture_comment" ||
      item.status !== "active" ||
      Boolean(item.deleted_at)
    );
    if (invalid) throw Errors.badRequest("评论图片不可用");
  }

  private async insertCommentImages(commentId: string, fileObjectIds: string[]) {
    if (fileObjectIds.length === 0) return;
    const rows = fileObjectIds.map((fileObjectId, index) => ({
      comment_id: commentId,
      file_object_id: fileObjectId,
      sort_order: index + 1,
      status: "visible",
    }));
    const { error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_comment_images")
      .insert(rows);
    if (error) throw Errors.dbError("保存评论图片失败", error);
  }

  private incrementCommentCountBestEffort(assetId: string) {
    void this.incrementCommentCount(assetId).catch(() => undefined);
  }

  private async incrementCommentCount(assetId: string) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 2_000);
    try {
      const { data: asset, error: findError } = await SupabaseDB.getAdminClient()
        .from("picture_assets")
        .select("comment_count")
        .eq("id", assetId)
        .abortSignal(abortController.signal)
        .maybeSingle();
      if (findError) throw Errors.dbError("查询评论计数失败", findError);

      const { error: updateError } = await SupabaseDB.getAdminClient()
        .from("picture_assets")
        .update({ comment_count: ((asset?.comment_count as number | undefined) || 0) + 1 })
        .eq("id", assetId)
        .abortSignal(abortController.signal);
      if (updateError) throw Errors.dbError("更新评论计数失败", updateError);
    } finally {
      clearTimeout(timeout);
    }
  }

  private toPage(
    list: VisitorPictureCommentRecord[],
    query: VisitorPictureCommentListQuery,
    total: number,
  ) {
    return {
      list,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  private async measureStep<TValue>(
    timing: CommentListTiming | null,
    key: string,
    loader: () => Promise<TValue>,
  ) {
    if (!timing) return loader();
    const startedAt = Date.now();
    const value = await loader();
    timing[key] = Date.now() - startedAt;
    return value;
  }

  private async attachImages(comments: PictureCommentRow[]) {
    if (comments.length === 0) return [];
    const commentIds = comments.map((item) => item.id);
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_comment_images")
      .select("id,comment_id,file_object_id,sort_order,status,created_at,platform_file_objects(id,object_key,mime_type,size_bytes,width,height)")
      .in("comment_id", commentIds)
      .eq("status", "visible")
      .order("sort_order", { ascending: true });
    if (error) throw Errors.dbError("查询评论图片失败", error);

    const images = ((data || []) as unknown as PictureCommentImageRow[]).map((row) => {
      const fileObject = Array.isArray(row.platform_file_objects)
        ? row.platform_file_objects[0] ?? null
        : row.platform_file_objects;
      return {
        id: row.id,
        comment_id: row.comment_id,
        file_object_id: row.file_object_id,
        sort_order: row.sort_order,
        status: row.status,
        created_at: row.created_at,
        file_object: fileObject,
      };
    });
    return comments.map((comment) => ({
      ...comment,
      images: images.filter((image) => image.comment_id === comment.id),
    }));
  }

  private async attachImagesDirect(
    comments: PictureCommentRow[],
    sql: NonNullable<ReturnType<typeof getDirectPostgresSql>>,
  ) {
    if (comments.length === 0) return [];
    const commentIds = comments.map((item) => item.id);
    const rows = await sql<PictureCommentImageSqlRow[]>`
      SELECT
        pci.id,
        pci.comment_id,
        pci.file_object_id,
        pci.sort_order,
        pci.status,
        pci.created_at,
        CASE
          WHEN pfo.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', pfo.id,
            'object_key', pfo.object_key,
            'mime_type', pfo.mime_type,
            'size_bytes', pfo.size_bytes,
            'width', pfo.width,
            'height', pfo.height
          )
        END AS file_object
      FROM public.picture_asset_comment_images pci
      LEFT JOIN public.platform_file_objects pfo
        ON pfo.id = pci.file_object_id
      WHERE pci.comment_id = ANY(${this.toPostgresUuidArray(commentIds)}::uuid[])
        AND pci.status = 'visible'
      ORDER BY pci.comment_id ASC, pci.sort_order ASC, pci.created_at ASC
    `;
    return comments.map((comment) => ({
      ...comment,
      images: rows.filter((image) => image.comment_id === comment.id),
    }));
  }

  private toPostgresUuidArray(ids: string[]) {
    return `{${ids.join(",")}}`;
  }
}

export const visitorPictureCommentsRepository = new VisitorPictureCommentsRepository();
