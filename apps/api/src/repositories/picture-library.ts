import { Errors } from "@/errors/error-factory";
import type {
  CreatePictureAssetInput,
  CreatePictureCategoryInput,
  PictureAssetListQuery,
  PictureCategoryListQuery,
  UpdatePictureAssetInput,
  UpdatePictureCategoryInput,
} from "@/schema/picture-library";
import { SupabaseDB } from "@/utils/supabase";

type PictureCategoryRow = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  cover_asset_id: string | null;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
};

type PictureAssetRow = {
  id: string;
  title: string;
  description: string | null;
  source: string;
  original_filename: string | null;
  checksum: string | null;
  dominant_color: string | null;
  width: number | null;
  height: number | null;
  status: string;
  sort_order: number;
  like_count: number;
  favorite_count: number;
  comment_count: number;
  share_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PictureAssetVariantRecord = {
  id: string;
  asset_id: string;
  variant: string;
  file_object_id: string;
  object_key: string;
  width: number | null;
  height: number | null;
  file_size: number;
  mime_type: string;
  created_at: string;
};

export type PlatformFileObjectBrief = {
  id: string;
  scene: string;
  object_key: string;
  original_name: string | null;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  checksum: string | null;
  status: string;
  deleted_at: string | null;
};

export type PictureCategoryRecord = PictureCategoryRow & {
  cover_asset?: PictureAssetRecord | null;
  asset_count?: number;
};

export type PictureAssetRecord = PictureAssetRow & {
  variants: PictureAssetVariantRecord[];
  categories: PictureCategoryRow[];
};

class PictureLibraryRepository {
  async listCategories(query: PictureCategoryListQuery) {
    let request = SupabaseDB.getAdminClient()
      .from("picture_categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (query.status) request = request.eq("status", query.status);
    if (query.keyword) request = request.ilike("name", `%${query.keyword}%`);

    const { data, error } = await request;
    if (error) throw Errors.dbError("查询图片分类失败", error);

    const categories = (data || []) as PictureCategoryRow[];
    const [coverMap, countMap] = await Promise.all([
      this.getCoverAssets(categories),
      this.countAssetsByCategory(categories.map((item) => item.id)),
    ]);

    return categories.map((item) => ({
      ...item,
      cover_asset: item.cover_asset_id ? coverMap.get(item.cover_asset_id) ?? null : null,
      asset_count: countMap.get(item.id) ?? 0,
    }));
  }

  async findCategoryBySlug(slug: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_categories")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw Errors.dbError("查询图片分类失败", error);
    return (data as PictureCategoryRow | null) ?? null;
  }

  async findCategoryById(id: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_categories")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw Errors.dbError("查询图片分类失败", error);
    return (data as PictureCategoryRow | null) ?? null;
  }

  async createCategory(input: CreatePictureCategoryInput) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_categories")
      .insert(input)
      .select("*")
      .maybeSingle();
    if (error) throw Errors.dbError("创建图片分类失败", error);
    if (!data) throw Errors.badRequest("创建图片分类失败");
    return data as PictureCategoryRow;
  }

  async updateCategory(id: string, input: UpdatePictureCategoryInput) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_categories")
      .update(input)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw Errors.dbError("更新图片分类失败", error);
    return (data as PictureCategoryRow | null) ?? null;
  }

  async listAssets(query: PictureAssetListQuery) {
    const page = query.page;
    const pageSize = query.pageSize;
    const categoryAssetIds = query.category_id
      ? await this.findAssetIdsByCategory(query.category_id)
      : null;

    if (categoryAssetIds && categoryAssetIds.length === 0) {
      return this.toAssetPage([], page, pageSize, 0);
    }

    let request = SupabaseDB.getAdminClient()
      .from("picture_assets")
      .select("*", { count: "exact" })
      .is("deleted_at", null);

    if (query.status && query.status !== "all") request = request.eq("status", query.status);
    if (!query.status) request = request.neq("status", "deleted");
    if (query.keyword) request = request.ilike("title", `%${query.keyword}%`);
    if (categoryAssetIds) request = request.in("id", categoryAssetIds);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await request
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw Errors.dbError("查询图片列表失败", error);

    const assets = await this.attachAssetRelations((data || []) as PictureAssetRow[]);
    return this.toAssetPage(assets, page, pageSize, count || 0);
  }

  async findAssetById(id: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_assets")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw Errors.dbError("查询图片失败", error);
    const assets = await this.attachAssetRelations(data ? [data as PictureAssetRow] : []);
    return assets[0] ?? null;
  }

  async findFileObject(id: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("platform_file_objects")
      .select("id,scene,object_key,original_name,mime_type,size_bytes,width,height,checksum,status,deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw Errors.dbError("查询图片文件失败", error);
    return (data as PlatformFileObjectBrief | null) ?? null;
  }

  async createAsset(input: CreatePictureAssetInput, file: PlatformFileObjectBrief) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_assets")
      .insert({
        title: input.title,
        description: input.description ?? null,
        source: "admin_upload",
        original_filename: file.original_name,
        checksum: file.checksum,
        width: file.width,
        height: file.height,
        status: input.status,
        sort_order: input.sort_order,
      })
      .select("*")
      .maybeSingle();
    if (error) throw Errors.dbError("创建图片失败", error);
    if (!data) throw Errors.badRequest("创建图片失败");

    const asset = data as PictureAssetRow;
    await this.replaceAssetVariants(asset.id, file);
    await this.replaceAssetCategories(asset.id, input.category_ids);
    return this.findAssetById(asset.id);
  }

  async updateAsset(id: string, input: UpdatePictureAssetInput) {
    const payload: Record<string, unknown> = {};
    if (input.title !== undefined) payload.title = input.title;
    if (input.description !== undefined) payload.description = input.description;
    if (input.status !== undefined) payload.status = input.status;
    if (input.sort_order !== undefined) payload.sort_order = input.sort_order;

    if (Object.keys(payload).length > 0) {
      const { error } = await SupabaseDB.getAdminClient()
        .from("picture_assets")
        .update(payload)
        .eq("id", id)
        .is("deleted_at", null);
      if (error) throw Errors.dbError("更新图片失败", error);
    }

    if (input.category_ids) {
      await this.replaceAssetCategories(id, input.category_ids);
    }

    return this.findAssetById(id);
  }

  async updateAssetStatus(id: string, status: "published" | "hidden" | "draft") {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_assets")
      .update({ status })
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw Errors.dbError("更新图片状态失败", error);
    return data ? this.findAssetById((data as PictureAssetRow).id) : null;
  }

  async softDeleteAsset(id: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_assets")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw Errors.dbError("删除图片失败", error);
    return (data as PictureAssetRow | null) ?? null;
  }

  private async replaceAssetVariants(assetId: string, file: PlatformFileObjectBrief) {
    const rows = ["original", "cover"].map((variant) => ({
      asset_id: assetId,
      variant,
      file_object_id: file.id,
      object_key: file.object_key,
      width: file.width,
      height: file.height,
      file_size: file.size_bytes,
      mime_type: file.mime_type,
    }));
    const { error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_variants")
      .upsert(rows, { onConflict: "asset_id,variant" });
    if (error) throw Errors.dbError("保存图片规格失败", error);
  }

  private async replaceAssetCategories(assetId: string, categoryIds: string[]) {
    const { error: deleteError } = await SupabaseDB.getAdminClient()
      .from("picture_asset_categories")
      .delete()
      .eq("asset_id", assetId);
    if (deleteError) throw Errors.dbError("更新图片分类失败", deleteError);
    if (categoryIds.length === 0) return;

    const rows = categoryIds.map((categoryId, index) => ({
      asset_id: assetId,
      category_id: categoryId,
      sort_order: index + 1,
    }));
    const { error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_categories")
      .insert(rows);
    if (error) throw Errors.dbError("更新图片分类失败", error);
  }

  private async attachAssetRelations(assets: PictureAssetRow[]) {
    if (assets.length === 0) return [];
    const ids = assets.map((item) => item.id);
    const [variants, categoryRows] = await Promise.all([
      this.findVariants(ids),
      this.findCategoriesByAssetIds(ids),
    ]);
    return assets.map((asset) => ({
      ...asset,
      variants: variants.filter((item) => item.asset_id === asset.id),
      categories: categoryRows
        .filter((item) => item.asset_id === asset.id)
        .map((item) => item.category),
    }));
  }

  private async findVariants(assetIds: string[]) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_variants")
      .select("*")
      .in("asset_id", assetIds)
      .order("variant", { ascending: true });
    if (error) throw Errors.dbError("查询图片规格失败", error);
    return (data || []) as PictureAssetVariantRecord[];
  }

  private async findCategoriesByAssetIds(assetIds: string[]) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_categories")
      .select("asset_id, picture_categories(*)")
      .in("asset_id", assetIds);
    if (error) throw Errors.dbError("查询图片分类失败", error);
    return ((data || []) as unknown as Array<{
      asset_id: string;
      picture_categories: PictureCategoryRow | PictureCategoryRow[] | null;
    }>)
      .map((item) => ({
        asset_id: item.asset_id,
        category: Array.isArray(item.picture_categories)
          ? item.picture_categories[0] ?? null
          : item.picture_categories,
      }))
      .filter((item): item is { asset_id: string; category: PictureCategoryRow } => Boolean(item.category))
      .map((item) => ({
        asset_id: item.asset_id,
        category: item.category,
      }));
  }

  private async findAssetIdsByCategory(categoryId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_categories")
      .select("asset_id")
      .eq("category_id", categoryId);
    if (error) throw Errors.dbError("查询分类图片失败", error);
    return (data || []).map((item) => item.asset_id);
  }

  private async getCoverAssets(categories: PictureCategoryRow[]) {
    const ids = categories.map((item) => item.cover_asset_id).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return new Map<string, PictureAssetRecord>();
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_assets")
      .select("*")
      .in("id", ids)
      .is("deleted_at", null);
    if (error) throw Errors.dbError("查询分类封面失败", error);
    const assets = await this.attachAssetRelations((data || []) as PictureAssetRow[]);
    return new Map(assets.map((item) => [item.id, item]));
  }

  private async countAssetsByCategory(categoryIds: string[]) {
    const result = new Map<string, number>();
    if (categoryIds.length === 0) return result;
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_categories")
      .select("category_id")
      .in("category_id", categoryIds);
    if (error) throw Errors.dbError("统计分类图片数量失败", error);
    for (const item of data || []) {
      result.set(item.category_id, (result.get(item.category_id) || 0) + 1);
    }
    return result;
  }

  private toAssetPage(
    list: PictureAssetRecord[],
    page: number,
    pageSize: number,
    total: number,
  ) {
    return {
      list,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}

export const pictureLibraryRepository = new PictureLibraryRepository();
