import { Errors } from "@/errors/error-factory";
import type {
  CreateVisitorPictureCommentInput,
  VisitorPictureCommentListQuery,
} from "@/schema/visitor-picture-library";
import { SupabaseDB } from "@/utils/supabase";

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

class VisitorPictureCommentsRepository {
  async list(assetId: string, query: VisitorPictureCommentListQuery) {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const { data, error, count } = await SupabaseDB.getAdminClient()
      .from("picture_asset_comments")
      .select("*", { count: "exact" })
      .eq("asset_id", assetId)
      .eq("status", "visible")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw Errors.dbError("查询图片评论失败", error);

    const list = await this.attachImages((data || []) as PictureCommentRow[]);
    return {
      list,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / query.pageSize),
      },
    };
  }

  async create(input: {
    assetId: string;
    visitorId: string;
    body: CreateVisitorPictureCommentInput;
  }) {
    await this.assertPublishedAsset(input.assetId);
    await this.assertCommentImages(input.body.image_file_ids);

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_comments")
      .insert({
        asset_id: input.assetId,
        visitor_id: input.visitorId,
        content: input.body.content,
        status: "visible",
      })
      .select("*")
      .maybeSingle();
    if (error) throw Errors.dbError("创建图片评论失败", error);
    if (!data) throw Errors.badRequest("创建图片评论失败");

    const comment = data as PictureCommentRow;
    await this.insertCommentImages(comment.id, input.body.image_file_ids);
    const list = await this.attachImages([comment]);
    this.incrementCommentCountBestEffort(input.assetId);
    return list[0] ?? { ...comment, images: [] };
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
}

export const visitorPictureCommentsRepository = new VisitorPictureCommentsRepository();
