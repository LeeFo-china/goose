import Link from "next/link";
import { redirect } from "next/navigation";
import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import { CreatePictureAssetButton } from "@/components/picture-library/picture-asset-actions";
import { CreatePictureCategoryButton } from "@/components/picture-library/picture-category-actions";
import {
  PictureCommentFilters,
} from "@/components/picture-library/picture-comment-actions";
import { PictureCommentsTable } from "@/components/picture-library/picture-comments-table";
import { PictureAssetsTable } from "@/components/picture-library/picture-assets-table";
import { PictureCategoryTable } from "@/components/picture-library/picture-category-table";
import { PictureLibraryHealthCard } from "@/components/picture-library/picture-library-health-card";
import {
  PictureLibraryFilters,
} from "@/components/picture-library/picture-library-list-actions";
import type {
  PictureAssetListData,
  PictureCategoryRecord,
  PictureCommentListData,
  PictureLibraryHealthReport,
} from "@/components/picture-library/picture-library-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type SearchParams = Promise<{
  tab?: string;
  page?: string;
  pageSize?: string;
  status?: string;
  category_id?: string;
  keyword?: string;
  comment_page?: string;
  commentPageSize?: string;
  comment_status?: string;
  comment_keyword?: string;
}>;

type PictureLibraryTab = "assets" | "categories" | "comments" | "health";

const PICTURE_LIBRARY_TABS = [
  { value: "assets", label: "图片" },
  { value: "categories", label: "分类" },
  { value: "comments", label: "评论" },
  { value: "health", label: "健康" },
] as const satisfies ReadonlyArray<{
  value: PictureLibraryTab;
  label: string;
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

function readTab(params: Awaited<SearchParams>): PictureLibraryTab {
  if (["assets", "categories", "comments", "health"].includes(params.tab || "")) {
    return params.tab as PictureLibraryTab;
  }
  if (params.comment_page || params.comment_status || params.comment_keyword) return "comments";
  return "assets";
}

function buildAssetQuery(input: {
  page: number;
  pageSize: number;
  status: string;
  categoryId: string;
  keyword: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  if (input.status && input.status !== "all") query.set("status", input.status);
  if (input.categoryId) query.set("category_id", input.categoryId);
  if (input.keyword) query.set("keyword", input.keyword);
  return query.toString();
}

function buildCommentQuery(input: {
  page: number;
  pageSize: number;
  status: string;
  keyword: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
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
  pageSize: number;
  status: string;
  categoryId: string;
  keyword: string;
  commentPage: number;
  commentPageSize: number;
  commentStatus: string;
  commentKeyword: string;
}) {
  const emptyAssets: PictureAssetListData = {
    list: [],
    pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
  };
  const emptyComments: PictureCommentListData = {
    list: [],
    pagination: { page: input.commentPage, pageSize: input.commentPageSize, total: 0, totalPages: 0 },
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
        pageSize: input.commentPageSize,
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

function buildTabHref(input: {
  tab: PictureLibraryTab;
  page: number;
  pageSize: number;
  status: string;
  categoryId: string;
  keyword: string;
  commentPage: number;
  commentPageSize: number;
  commentStatus: string;
  commentKeyword: string;
}) {
  const query = new URLSearchParams();
  query.set("tab", input.tab);
  if (input.page > 1) query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  if (input.status !== "all") query.set("status", input.status);
  if (input.categoryId) query.set("category_id", input.categoryId);
  if (input.keyword) query.set("keyword", input.keyword);
  if (input.commentPage > 1) query.set("comment_page", String(input.commentPage));
  query.set("commentPageSize", String(input.commentPageSize));
  if (input.commentStatus !== "all") query.set("comment_status", input.commentStatus);
  if (input.commentKeyword) query.set("comment_keyword", input.commentKeyword);
  return `/platform/picture-library?${query.toString()}`;
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
  const activeTab = readTab(params);
  const page = readPositiveInteger(params.page, 1);
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const status = readStatus(params.status);
  const categoryId = (params.category_id || "").trim();
  const keyword = (params.keyword || "").trim().slice(0, 80);
  const commentPage = readPositiveInteger(params.comment_page, 1);
  const commentPageSize = normalizePlatformListPageSize(params.commentPageSize);
  const commentStatus = readCommentStatus(params.comment_status);
  const commentKeyword = (params.comment_keyword || "").trim().slice(0, 80);

  let categories: PictureCategoryRecord[] = [];
  let assets: PictureAssetListData = {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
  let comments: PictureCommentListData = {
    list: [],
    pagination: { page: commentPage, pageSize: commentPageSize, total: 0, totalPages: 0 },
  };
  let health: PictureLibraryHealthReport | null = null;
  let error = hasPlatformAccess ? null : "当前账号不是平台超管，无法访问图片资料库";

  if (hasPlatformAccess) {
    try {
      const data = await loadPictureLibraryData({
        page,
        pageSize,
        status,
        categoryId,
        keyword,
        commentPage,
        commentPageSize,
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
  const buildHref = (tab: PictureLibraryTab) => buildTabHref({
    tab,
    page,
    pageSize,
    status,
    categoryId,
    keyword,
    commentPage,
    commentPageSize,
    commentStatus,
    commentKeyword,
  });
  const issueTotal = health?.metrics.issue_total ?? 0;
  const activePagination = activeTab === "assets"
    ? assets.pagination
    : activeTab === "comments"
      ? comments.pagination
      : activeTab === "categories"
        ? { page: 1, pageSize, total: categories.length, totalPages: 1 }
        : { page: 1, pageSize, total: issueTotal, totalPages: 1 };
  const activeCount = activeTab === "assets"
    ? assets.list.length
    : activeTab === "comments"
      ? comments.list.length
      : activeTab === "categories"
        ? categories.length
        : issueTotal;
  const activeUnit = activeTab === "assets"
    ? "张图片"
    : activeTab === "comments"
      ? "条评论"
      : activeTab === "categories"
        ? "个分类"
        : "项健康问题";
  const tabCounts: Record<PictureLibraryTab, number> = {
    assets: assets.pagination.total,
    categories: categories.length,
    comments: comments.pagination.total,
    health: issueTotal,
  };

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <Tabs defaultValue={activeTab} className="contents">
        <PlatformListPageShell
          title="图片资料库"
          description="管理装修封面图、风格分类和 visitor 首页展示状态。"
          action={hasPlatformAccess ? (
            <div className="flex gap-2">
              <CreatePictureCategoryButton assets={assets.list} />
              <CreatePictureAssetButton categories={categories} />
            </div>
          ) : null}
          error={error}
          summary={
            <div className="grid gap-3 md:grid-cols-4">
              <Card key="total">
                <CardHeader className="pb-2">
                  <CardDescription>图片总数</CardDescription>
                  <CardTitle>{assets.pagination.total}</CardTitle>
                </CardHeader>
              </Card>
              <Card key="active-categories">
                <CardHeader className="pb-2">
                  <CardDescription>启用分类</CardDescription>
                  <CardTitle>{summary.activeCategories}</CardTitle>
                </CardHeader>
              </Card>
              <Card key="published">
                <CardHeader className="pb-2">
                  <CardDescription>本页已发布</CardDescription>
                  <CardTitle>{summary.currentPublished}</CardTitle>
                </CardHeader>
              </Card>
              <Card key="draft">
                <CardHeader className="pb-2">
                  <CardDescription>本页草稿</CardDescription>
                  <CardTitle>{summary.currentDraft}</CardTitle>
                </CardHeader>
              </Card>
            </div>
          }
          tabs={
            <TabsList>
              {PICTURE_LIBRARY_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} asChild>
                  <Link href={buildHref(tab.value)}>
                    {tab.label}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {tabCounts[tab.value]}
                    </span>
                  </Link>
                </TabsTrigger>
              ))}
            </TabsList>
          }
          listHeader={activeTab === "categories" ? (
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>分类管理</CardTitle>
                <CardDescription>
                  已停用 {summary.inactiveCategories} 个，启用中的分类会提供给小程序端展示。
                </CardDescription>
              </div>
              <Badge variant="outline">共 {categories.length} 个</Badge>
            </div>
          ) : activeTab === "comments" ? (
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <CardTitle>评论治理</CardTitle>
                <CardDescription>
                  本页可见 {summary.currentVisibleComments} 条，已隐藏 {summary.currentHiddenComments} 条。
                </CardDescription>
              </div>
              <Badge variant="outline">共 {comments.pagination.total} 条</Badge>
            </div>
          ) : activeTab === "health" ? (
            <div className="flex flex-col gap-1">
              <CardTitle>健康检查</CardTitle>
              <CardDescription>资源引用、图片变体和分类状态检查。</CardDescription>
            </div>
          ) : null}
          filters={activeTab === "assets" ? (
              <PictureLibraryFilters
                status={status}
                categoryId={categoryId}
                keyword={keyword}
                categories={categories}
              />
          ) : activeTab === "comments" ? (
              <PictureCommentFilters
                assetPage={page}
                assetStatus={status}
                categoryId={categoryId}
                assetKeyword={keyword}
                commentStatus={commentStatus}
                commentKeyword={commentKeyword}
              />
          ) : null}
          pagination={activePagination}
          currentCount={activeCount}
          pageKey={activeTab === "comments" ? "comment_page" : "page"}
          pageSizeKey={activeTab === "comments" ? "commentPageSize" : "pageSize"}
          tableViewportTestId="platform-picture-library-list-table-viewport"
          unit={activeUnit}
        >
          <TabsContent value="assets" className="m-0 data-[state=inactive]:hidden">
            <PictureAssetsTable assets={assets.list} categories={categories} />
          </TabsContent>
          <TabsContent value="categories" className="m-0 data-[state=inactive]:hidden">
            <PictureCategoryTable categories={categories} assets={assets.list} />
          </TabsContent>
          <TabsContent value="comments" className="m-0 data-[state=inactive]:hidden">
            <PictureCommentsTable comments={comments.list} />
          </TabsContent>
          <TabsContent value="health" className="m-0 data-[state=inactive]:hidden">
            <PictureLibraryHealthCard health={health} />
          </TabsContent>
        </PlatformListPageShell>
      </Tabs>
    </div>
  );
}
