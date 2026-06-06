import { Errors } from "@/errors/error-factory";
import type { PictureCommentListQuery } from "@/schema/picture-library";
import { SupabaseDB } from "@/utils/supabase";

type PictureAssetBrief = {
  id: string;
  title: string;
  status: string;
};

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

export type PictureCommentRecord = PictureCommentRow & {
  asset: PictureAssetBrief | null;
  images: PictureCommentImageRecord[];
};

type PictureCommentSelectRow = PictureCommentRow & {
  picture_assets: PictureAssetBrief | PictureAssetBrief[] | null;
};

type PictureCommentImageRow = Omit<PictureCommentImageRecord, "file_object"> & {
  platform_file_objects: PictureCommentImageRecord["file_object"]
    | PictureCommentImageRecord["file_object"][]
    | null;
};

class PictureLibraryCommentsRepository {
  async listComments(query: PictureCommentListQuery) {
    const page = query.page;
    const pageSize = query.pageSize;
    let request = SupabaseDB.getAdminClient()
      .from("picture_asset_comments")
      .select("*, picture_assets(id,title,status)", { count: "exact" })
      .is("deleted_at", null);

    if (query.status && query.status !== "all") request = request.eq("status", query.status);
    if (!query.status) request = request.neq("status", "deleted");
    if (query.asset_id) request = request.eq("asset_id", query.asset_id);
    if (query.keyword) request = request.ilike("content", `%${query.keyword}%`);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await request
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw Errors.dbError("查询图片评论失败", error);

    const comments = ((data || []) as unknown as PictureCommentSelectRow[])
      .map((item) => ({
        ...item,
        asset: Array.isArray(item.picture_assets)
          ? item.picture_assets[0] ?? null
          : item.picture_assets,
      }));
    const list = await this.attachCommentImages(comments);
    return {
      list,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    };
  }

  async updateCommentStatus(id: string, status: "hidden" | "visible") {
    const row = await this.updateComment(id, { status }, "更新图片评论失败");
    return row ? this.attachSingleComment(row) : null;
  }

  async softDeleteComment(id: string) {
    const row = await this.updateComment(
      id,
      { status: "deleted", deleted_at: new Date().toISOString() },
      "删除图片评论失败",
    );
    return row ? this.attachSingleComment(row) : null;
  }

  private async updateComment(
    id: string,
    payload: Record<string, unknown>,
    errorMessage: string,
  ) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_comments")
      .update(payload)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*, picture_assets(id,title,status)")
      .maybeSingle();
    if (error) throw Errors.dbError(errorMessage, error);
    return (data as unknown as PictureCommentSelectRow | null) ?? null;
  }

  private async attachSingleComment(row: PictureCommentSelectRow) {
    const comments = await this.attachCommentImages([{
      ...row,
      asset: Array.isArray(row.picture_assets)
        ? row.picture_assets[0] ?? null
        : row.picture_assets,
    }]);
    return comments[0] ?? null;
  }

  private async attachCommentImages(
    comments: Array<PictureCommentRow & { asset: PictureAssetBrief | null }>,
  ) {
    if (comments.length === 0) return [];
    const commentIds = comments.map((item) => item.id);
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_comment_images")
      .select("id,comment_id,file_object_id,sort_order,status,created_at,platform_file_objects(id,object_key,mime_type,size_bytes,width,height)")
      .in("comment_id", commentIds)
      .neq("status", "deleted")
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

export const pictureLibraryCommentsRepository = new PictureLibraryCommentsRepository();
