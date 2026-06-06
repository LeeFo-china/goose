import { redirect } from "next/navigation";
import { StatusAlert } from "@/components/admin/status-alert";
import { CreatePictureAssetButton } from "@/components/picture-library/picture-asset-actions";
import { CreatePictureCategoryButton } from "@/components/picture-library/picture-category-actions";
import {
  PictureCommentFilters,
  PictureCommentPagination,
} from "@/components/picture-library/picture-comment-actions";
import { PictureCommentsTable } from "@/components/picture-library/picture-comments-table";
import { PictureAssetsTable } from "@/components/picture-library/picture-assets-table";
import { PictureCategoryTable } from "@/components/picture-library/picture-category-table";
import { PictureLibraryHealthCard } from "@/components/picture-library/picture-library-health-card";
import {
  PictureLibraryFilters,
  PictureLibraryPagination,
} from "@/components/picture-library/picture-library-list-actions";
import type {
  PictureAssetListData,
  PictureCategoryRecord,
  PictureCommentListData,
  PictureLibraryHealthReport,
} from "@/components/picture-library/picture-library-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type SearchParams = Promise<{
  page?: string;
  status?: string;
  category_id?: string;
  keyword?: string;
  comment_page?: string;
  comment_status?: string;
  comment_keyword?: string;
}>;

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readStatus(value: string | undefined) {
  return ["draft", "published", "hidden"].includes(value || "") ? value as string : "all";
}

function readCommentStatus(value: string | undefined) {
  return ["pending", "visible", "hidden", "rejected"].includes(value || "")
    ? value as string
    : "all";
}

function buildAssetQuery(input: {
  page: number;
  status: string;
  categoryId: string;
  keyword: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", "20");
  if (input.status && input.status !== "all") query.set("status", input.status);
  if (input.categoryId) query.set("category_id", input.categoryId);
  if (input.keyword) query.set("keyword", input.keyword);
  return query.toString();
}

function buildCommentQuery(input: {
  page: number;
  status: string;
  keyword: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", "10");
  if (input.status && input.status !== "all") query.set("status", input.status);
  if (input.keyword) query.set("keyword", input.keyword);
  return query.toString();
}

async function requestPlatformData<T>(path: string, fallback: T) {
  const token = await getAdminToken();
  if (!token) throw new Error("缺少登录凭证");
  const response = await fetch(buildBackendUrl(path), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await parseBackendJson<T>(response);
  return payload.data || fallback;
}

async function loadPictureLibraryData(input: {
  page: number;
  status: string;
  categoryId: string;
  keyword: string;
  commentPage: number;
  commentStatus: string;
  commentKeyword: string;
}) {
  const emptyAssets: PictureAssetListData = {
    list: [],
    pagination: { page: input.page, pageSize: 20, total: 0, totalPages: 0 },
  };
  const emptyComments: PictureCommentListData = {
    list: [],
    pagination: { page: input.commentPage, pageSize: 10, total: 0, totalPages: 0 },
  };
  const [categories, assets, comments, health] = await Promise.all([
    requestPlatformData<PictureCategoryRecord[]>("/platform/picture-library/categories", []),
    requestPlatformData<PictureAssetListData>(
      `/platform/picture-library/assets?${buildAssetQuery(input)}`,
      emptyAssets,
    ),
    requestPlatformData<PictureCommentListData>(
      `/platform/picture-library/comments?${buildCommentQuery({
        page: input.commentPage,
        status: input.commentStatus,
        keyword: input.commentKeyword,
      })}`,
      emptyComments,
    ),
    requestPlatformData<PictureLibraryHealthReport | null>(
      "/platform/picture-library/health?issue_limit=20",
      null,
    ),
  ]);
  return { categories, assets, comments, health, error: null as string | null };
}

function summarize(input: {
  categories: PictureCategoryRecord[];
  assets: PictureAssetListData;
  comments: PictureCommentListData;
}) {
  return {
    activeCategories: input.categories.filter((item) => item.status === "active").length,
    inactiveCategories: input.categories.filter((item) => item.status === "inactive").length,
    currentPublished: input.assets.list.filter((item) => item.status === "published").length,
    currentDraft: input.assets.list.filter((item) => item.status === "draft").length,
    currentVisibleComments: input.comments.list.filter((item) => item.status === "visible").length,
    currentHiddenComments: input.comments.list.filter((item) => item.status === "hidden").length,
  };
}

export default async function PlatformPictureLibraryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const hasPlatformAccess = session.roles.includes("platform_admin");
  const params = await searchParams;
  const page = readPositiveInteger(params.page, 1);
  const status = readStatus(params.status);
  const categoryId = (params.category_id || "").trim();
  const keyword = (params.keyword || "").trim().slice(0, 80);
  const commentPage = readPositiveInteger(params.comment_page, 1);
  const commentStatus = readCommentStatus(params.comment_status);
  const commentKeyword = (params.comment_keyword || "").trim().slice(0, 80);

  let categories: PictureCategoryRecord[] = [];
  let assets: PictureAssetListData = {
    list: [],
    pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
  };
  let comments: PictureCommentListData = {
    list: [],
    pagination: { page: commentPage, pageSize: 10, total: 0, totalPages: 0 },
  };
  let health: PictureLibraryHealthReport | null = null;
  let error = hasPlatformAccess ? null : "当前账号不是平台超管，无法访问图片资料库";

  if (hasPlatformAccess) {
    try {
      const data = await loadPictureLibraryData({
        page,
        status,
        categoryId,
        keyword,
        commentPage,
        commentStatus,
        commentKeyword,
      });
      categories = data.categories;
      assets = data.assets;
      comments = data.comments;
      health = data.health;
    } catch (err) {
      error = err instanceof Error ? err.message : "图片资料库加载失败";
    }
  }

  const summary = summarize({ categories, assets, comments });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">图片资料库</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理装修封面图、风格分类和 visitor 首页展示状态。
          </p>
        </div>
        {hasPlatformAccess ? (
          <div className="flex gap-2">
            <CreatePictureCategoryButton assets={assets.list} />
            <CreatePictureAssetButton categories={categories} />
          </div>
        ) : null}
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>图片总数</CardDescription>
            <CardTitle>{assets.pagination.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>启用分类</CardDescription>
            <CardTitle>{summary.activeCategories}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页已发布</CardDescription>
            <CardTitle>{summary.currentPublished}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页草稿</CardDescription>
            <CardTitle>{summary.currentDraft}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <PictureLibraryHealthCard health={health} />

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>图片列表</CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                当前筛选：
                <Badge variant="outline">{status === "all" ? "全部状态" : status}</Badge>
                {categoryId ? <Badge variant="outline">已选分类</Badge> : <Badge variant="outline">全部分类</Badge>}
              </div>
            </div>
            <Badge variant="outline">共 {assets.pagination.total} 张</Badge>
          </div>
          <PictureLibraryFilters
            status={status}
            categoryId={categoryId}
            keyword={keyword}
            categories={categories}
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-0">
          <PictureAssetsTable assets={assets.list} categories={categories} />
          <div className="px-4 pb-4">
            <PictureLibraryPagination
              pagination={assets.pagination}
              status={status}
              categoryId={categoryId}
              keyword={keyword}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>分类管理</CardTitle>
            <CardDescription>
              已停用 {summary.inactiveCategories} 个，启用中的分类会提供给小程序端展示。
            </CardDescription>
          </div>
          <Badge variant="outline">共 {categories.length} 个</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <PictureCategoryTable categories={categories} assets={assets.list} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>评论治理</CardTitle>
              <CardDescription>
                本页可见 {summary.currentVisibleComments} 条，已隐藏 {summary.currentHiddenComments} 条。
              </CardDescription>
            </div>
            <Badge variant="outline">共 {comments.pagination.total} 条</Badge>
          </div>
          <PictureCommentFilters
            assetPage={page}
            assetStatus={status}
            categoryId={categoryId}
            assetKeyword={keyword}
            commentStatus={commentStatus}
            commentKeyword={commentKeyword}
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-0">
          <PictureCommentsTable comments={comments.list} />
          <div className="px-4 pb-4">
            <PictureCommentPagination
              pagination={comments.pagination}
              assetPage={page}
              assetStatus={status}
              categoryId={categoryId}
              assetKeyword={keyword}
              commentStatus={commentStatus}
              commentKeyword={commentKeyword}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
