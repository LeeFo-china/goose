import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

const REQUIRED_VARIANTS = ["cover", "thumb", "large", "detail"] as const;
const MAX_FETCH_ROWS = 10_000;

type PictureCategoryRow = {
  id: string;
  name: string;
  status: string;
  cover_asset_id: string | null;
};

type PictureAssetRow = {
  id: string;
  title: string;
  status: string;
  comment_count: number;
  deleted_at: string | null;
};

type PictureAssetVariantRow = {
  asset_id: string;
  variant: string;
};

type PictureAssetCategoryRow = {
  asset_id: string;
  category_id: string;
};

type PictureCommentRow = {
  id: string;
  asset_id: string;
  status: string;
  deleted_at: string | null;
};

export type PictureLibraryHealthIssue = {
  type:
    | "missing_variant"
    | "uncategorized_asset"
    | "category_without_cover"
    | "comment_count_mismatch";
  severity: "warning" | "danger";
  resource_type: "asset" | "category";
  resource_id: string;
  resource_label: string;
  detail: string;
};

export type PictureLibraryHealthReport = {
  generated_at: string;
  metrics: {
    category_total: number;
    active_category_total: number;
    inactive_category_total: number;
    asset_total: number;
    published_asset_total: number;
    draft_asset_total: number;
    hidden_asset_total: number;
    deleted_asset_total: number;
    pending_comment_total: number;
    visible_comment_total: number;
    hidden_comment_total: number;
    deleted_comment_total: number;
    missing_variant_asset_total: number;
    uncategorized_asset_total: number;
    category_without_cover_total: number;
    comment_count_mismatch_asset_total: number;
    issue_total: number;
  };
  issues: PictureLibraryHealthIssue[];
};

class PictureLibraryHealthRepository {
  async buildReport(issueLimit = 20): Promise<PictureLibraryHealthReport> {
    const [categories, assets, variants, assetCategories, comments] = await Promise.all([
      this.listCategories(),
      this.listAssets(),
      this.listVariants(),
      this.listAssetCategories(),
      this.listComments(),
    ]);

    const activeAssets = assets.filter((asset) => !asset.deleted_at && asset.status !== "deleted");
    const issues = this.buildIssues({
      categories,
      assets: activeAssets,
      variants,
      assetCategories,
      comments,
    });

    return {
      generated_at: new Date().toISOString(),
      metrics: this.buildMetrics({
        categories,
        assets,
        comments,
        issues,
      }),
      issues: issues.slice(0, issueLimit),
    };
  }

  async repairAssetCommentCount(assetId: string) {
    const asset = await this.findActiveAsset(assetId);
    if (!asset) throw Errors.notFound("图片不存在");
    const visibleCommentCount = await this.countVisibleComments(assetId);
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_assets")
      .update({ comment_count: visibleCommentCount })
      .eq("id", assetId)
      .is("deleted_at", null)
      .select("id,title,status,comment_count,deleted_at")
      .maybeSingle();
    if (error) throw Errors.dbError("修复图片评论计数失败", error);
    if (!data) throw Errors.notFound("图片不存在");

    return {
      asset: data as PictureAssetRow,
      previous_comment_count: asset.comment_count,
      repaired_comment_count: visibleCommentCount,
    };
  }

  async setCategoryCoverFromFirstPublishedAsset(categoryId: string) {
    const category = await this.findActiveCategory(categoryId);
    if (!category) throw Errors.notFound("图片分类不存在或未启用");
    const asset = await this.findFirstPublishedAssetByCategory(categoryId);
    if (!asset) throw Errors.business(409, "分类下没有已发布图片", "PICTURE_CATEGORY_NO_PUBLISHED_ASSET");

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_categories")
      .update({ cover_asset_id: asset.id })
      .eq("id", categoryId)
      .eq("status", "active")
      .select("id,name,status,cover_asset_id")
      .maybeSingle();
    if (error) throw Errors.dbError("设置分类封面失败", error);
    if (!data) throw Errors.notFound("图片分类不存在或未启用");

    return {
      category: data as PictureCategoryRow,
      cover_asset: asset,
      previous_cover_asset_id: category.cover_asset_id,
    };
  }

  private async listCategories() {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_categories")
      .select("id,name,status,cover_asset_id")
      .range(0, MAX_FETCH_ROWS - 1);
    if (error) throw Errors.dbError("查询图片资料库分类健康数据失败", error);
    return (data || []) as PictureCategoryRow[];
  }

  private async listAssets() {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_assets")
      .select("id,title,status,comment_count,deleted_at")
      .range(0, MAX_FETCH_ROWS - 1);
    if (error) throw Errors.dbError("查询图片资料库图片健康数据失败", error);
    return (data || []) as PictureAssetRow[];
  }

  private async listVariants() {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_variants")
      .select("asset_id,variant")
      .range(0, MAX_FETCH_ROWS - 1);
    if (error) throw Errors.dbError("查询图片资料库规格健康数据失败", error);
    return (data || []) as PictureAssetVariantRow[];
  }

  private async listAssetCategories() {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_categories")
      .select("asset_id,category_id")
      .range(0, MAX_FETCH_ROWS - 1);
    if (error) throw Errors.dbError("查询图片资料库分类关系健康数据失败", error);
    return (data || []) as PictureAssetCategoryRow[];
  }

  private async listComments() {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_comments")
      .select("id,asset_id,status,deleted_at")
      .range(0, MAX_FETCH_ROWS - 1);
    if (error) throw Errors.dbError("查询图片资料库评论健康数据失败", error);
    return (data || []) as PictureCommentRow[];
  }

  private async findActiveAsset(assetId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_assets")
      .select("id,title,status,comment_count,deleted_at")
      .eq("id", assetId)
      .is("deleted_at", null)
      .neq("status", "deleted")
      .maybeSingle();
    if (error) throw Errors.dbError("查询图片失败", error);
    return (data as PictureAssetRow | null) ?? null;
  }

  private async countVisibleComments(assetId: string) {
    const { count, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_comments")
      .select("id", { count: "exact", head: true })
      .eq("asset_id", assetId)
      .eq("status", "visible")
      .is("deleted_at", null);
    if (error) throw Errors.dbError("统计图片可见评论失败", error);
    return count || 0;
  }

  private async findActiveCategory(categoryId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_categories")
      .select("id,name,status,cover_asset_id")
      .eq("id", categoryId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw Errors.dbError("查询图片分类失败", error);
    return (data as PictureCategoryRow | null) ?? null;
  }

  private async findFirstPublishedAssetByCategory(categoryId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_categories")
      .select("picture_assets(id,title,status,comment_count,deleted_at)")
      .eq("category_id", categoryId)
      .order("sort_order", { ascending: true })
      .limit(20);
    if (error) throw Errors.dbError("查询分类首图失败", error);

    const rows = (data || []) as unknown as Array<{
      picture_assets: PictureAssetRow | PictureAssetRow[] | null;
    }>;
    for (const row of rows) {
      const asset = Array.isArray(row.picture_assets)
        ? row.picture_assets[0] ?? null
        : row.picture_assets;
      if (asset && asset.status === "published" && !asset.deleted_at) return asset;
    }
    return null;
  }

  private buildIssues(input: {
    categories: PictureCategoryRow[];
    assets: PictureAssetRow[];
    variants: PictureAssetVariantRow[];
    assetCategories: PictureAssetCategoryRow[];
    comments: PictureCommentRow[];
  }) {
    const variantsByAsset = this.groupValues(input.variants, (item) => item.asset_id);
    const categoriesByAsset = this.groupValues(input.assetCategories, (item) => item.asset_id);
    const visibleCommentCounts = this.countVisibleCommentsByAsset(input.comments);
    const issues: PictureLibraryHealthIssue[] = [];

    for (const asset of input.assets) {
      const assetVariants = new Set((variantsByAsset.get(asset.id) || []).map((item) => item.variant));
      const missingVariants = REQUIRED_VARIANTS.filter((variant) => !assetVariants.has(variant));
      if (missingVariants.length > 0) {
        issues.push({
          type: "missing_variant",
          severity: missingVariants.includes("cover") ? "danger" : "warning",
          resource_type: "asset",
          resource_id: asset.id,
          resource_label: asset.title,
          detail: `缺少图片规格：${missingVariants.join(", ")}`,
        });
      }

      if ((categoriesByAsset.get(asset.id) || []).length === 0) {
        issues.push({
          type: "uncategorized_asset",
          severity: "warning",
          resource_type: "asset",
          resource_id: asset.id,
          resource_label: asset.title,
          detail: "图片未绑定任何分类",
        });
      }

      const actualCommentCount = visibleCommentCounts.get(asset.id) || 0;
      if (asset.comment_count !== actualCommentCount) {
        issues.push({
          type: "comment_count_mismatch",
          severity: "warning",
          resource_type: "asset",
          resource_id: asset.id,
          resource_label: asset.title,
          detail: `评论计数为 ${asset.comment_count}，实际可见评论为 ${actualCommentCount}`,
        });
      }
    }

    for (const category of input.categories) {
      if (category.status === "active" && !category.cover_asset_id) {
        issues.push({
          type: "category_without_cover",
          severity: "warning",
          resource_type: "category",
          resource_id: category.id,
          resource_label: category.name,
          detail: "启用分类未设置封面图片",
        });
      }
    }

    return issues.sort((left, right) => {
      const severityOrder = { danger: 0, warning: 1 };
      return severityOrder[left.severity] - severityOrder[right.severity] ||
        left.type.localeCompare(right.type) ||
        left.resource_label.localeCompare(right.resource_label);
    });
  }

  private buildMetrics(input: {
    categories: PictureCategoryRow[];
    assets: PictureAssetRow[];
    comments: PictureCommentRow[];
    issues: PictureLibraryHealthIssue[];
  }): PictureLibraryHealthReport["metrics"] {
    const activeAssets = input.assets.filter((asset) => !asset.deleted_at && asset.status !== "deleted");
    const issuesByType = this.countIssuesByType(input.issues);
    return {
      category_total: input.categories.length,
      active_category_total: input.categories.filter((item) => item.status === "active").length,
      inactive_category_total: input.categories.filter((item) => item.status === "inactive").length,
      asset_total: activeAssets.length,
      published_asset_total: activeAssets.filter((item) => item.status === "published").length,
      draft_asset_total: activeAssets.filter((item) => item.status === "draft").length,
      hidden_asset_total: activeAssets.filter((item) => item.status === "hidden").length,
      deleted_asset_total: input.assets.filter((item) => item.deleted_at || item.status === "deleted").length,
      pending_comment_total: input.comments.filter((item) => item.status === "pending" && !item.deleted_at).length,
      visible_comment_total: input.comments.filter((item) => item.status === "visible" && !item.deleted_at).length,
      hidden_comment_total: input.comments.filter((item) => item.status === "hidden" && !item.deleted_at).length,
      deleted_comment_total: input.comments.filter((item) => item.deleted_at || item.status === "deleted").length,
      missing_variant_asset_total: issuesByType.get("missing_variant") || 0,
      uncategorized_asset_total: issuesByType.get("uncategorized_asset") || 0,
      category_without_cover_total: issuesByType.get("category_without_cover") || 0,
      comment_count_mismatch_asset_total: issuesByType.get("comment_count_mismatch") || 0,
      issue_total: input.issues.length,
    };
  }

  private countVisibleCommentsByAsset(comments: PictureCommentRow[]) {
    const result = new Map<string, number>();
    for (const comment of comments) {
      if (comment.status !== "visible" || comment.deleted_at) continue;
      result.set(comment.asset_id, (result.get(comment.asset_id) || 0) + 1);
    }
    return result;
  }

  private countIssuesByType(issues: PictureLibraryHealthIssue[]) {
    const result = new Map<PictureLibraryHealthIssue["type"], number>();
    for (const issue of issues) {
      result.set(issue.type, (result.get(issue.type) || 0) + 1);
    }
    return result;
  }

  private groupValues<TItem>(items: TItem[], getKey: (item: TItem) => string) {
    const result = new Map<string, TItem[]>();
    for (const item of items) {
      const key = getKey(item);
      result.set(key, [...(result.get(key) || []), item]);
    }
    return result;
  }
}

export const pictureLibraryHealthRepository = new PictureLibraryHealthRepository();
