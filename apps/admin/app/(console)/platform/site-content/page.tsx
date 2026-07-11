import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { SiteContentFilters, SiteContentTable } from "@/components/site-content/site-content-table";
import {
  hasSiteContentPermission,
  normalizeSiteContentPageSize,
  readPositivePage,
  type SiteContentListData,
} from "@/components/site-content/site-content-types";
import { Button } from "@/components/ui/button";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";

type SearchParams = Promise<{
  page?: string;
  pageSize?: string;
  contentType?: string;
  status?: string;
  keyword?: string;
}>;

const validTypes = new Set(["article", "case", "city"]);
const validStatuses = new Set(["draft", "published", "archived"]);

async function fetchList(path: string, page: number, pageSize: number) {
  const fallback: SiteContentListData = {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
  const token = await getAdminToken();
  if (!token) return { data: fallback, error: "缺少登录凭证" };
  try {
    const response = await fetch(buildBackendUrl(path), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await parseBackendJson<SiteContentListData>(response);
    return { data: payload.data ?? fallback, error: null };
  } catch (error) {
    return { data: fallback, error: error instanceof Error ? error.message : "官网内容列表加载失败" };
  }
}

export default async function SiteContentListPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  if (!isPlatformOnlySession(session) || !hasSiteContentPermission(session.permissions, "platform.site_content.read")) notFound();

  const params = await searchParams;
  const page = readPositivePage(params.page);
  const pageSize = normalizeSiteContentPageSize(params.pageSize);
  const contentType = validTypes.has(params.contentType ?? "") ? params.contentType! : "";
  const status = validStatuses.has(params.status ?? "") ? params.status! : "";
  const keyword = (params.keyword ?? "").trim().slice(0, 120);
  if (params.pageSize !== String(pageSize)) {
    const canonicalQuery = new URLSearchParams();
    if (page > 1) canonicalQuery.set("page", String(page));
    canonicalQuery.set("pageSize", String(pageSize));
    if (contentType) canonicalQuery.set("contentType", contentType);
    if (status) canonicalQuery.set("status", status);
    if (keyword) canonicalQuery.set("keyword", keyword);
    redirect(`/platform/site-content?${canonicalQuery}`);
  }
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (contentType) query.set("contentType", contentType);
  if (status) query.set("status", status);
  if (keyword) query.set("keyword", keyword);
  const result = await fetchList(`/platform/site-content?${query}`, page, pageSize);
  const canManage = hasSiteContentPermission(session.permissions, "platform.site_content.manage");

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col overflow-hidden">
      <PlatformListPageShell
        title="官网内容"
        description="管理文章、案例和城市页草稿，按版本预览后再发布。"
        action={canManage ? <Button asChild><Link href="/platform/site-content/new"><Plus data-icon="inline-start" />新建内容</Link></Button> : <Button disabled title="需要 platform.site_content.manage 权限"><Plus data-icon="inline-start" />新建内容</Button>}
        error={result.error}
        filters={<SiteContentFilters contentType={contentType || "all"} status={status || "all"} keyword={keyword} />}
        pagination={result.data.pagination}
        currentCount={result.data.list.length}
        tableViewportTestId="site-content-list-table-viewport"
        unit="条内容"
      >
        <SiteContentTable items={result.data.list} />
      </PlatformListPageShell>
    </div>
  );
}
