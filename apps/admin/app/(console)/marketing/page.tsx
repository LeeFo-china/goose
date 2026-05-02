import {
  Gift,
  Megaphone,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { campaignStatusOptions } from "@/components/marketing/marketing-constants";
import {
  MarketingFilters,
  MarketingPagination,
} from "@/components/marketing/marketing-list-actions";
import { CreateMarketingCampaignButton } from "@/components/marketing/marketing-mutations";
import { MarketingCampaignsTable } from "@/components/marketing/marketing-table";
import type {
  MarketingCampaignRecord,
  MarketingProjectOption,
  Pagination,
} from "@/components/marketing/marketing-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type MarketingPageSearchParams = {
  page?: string;
  campaign_type?: string;
  status?: string;
  keyword?: string;
};

type CampaignListData = {
  list: MarketingCampaignRecord[];
  pagination: Pagination;
};

type ProjectListData = {
  list: Array<{
    id: string;
    name: string | null;
    status?: string | null;
    address?: string | null;
  }>;
  pagination: Pagination;
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

async function fetchBackendData<T>(token: string, path: string) {
  const response = await fetch(buildBackendUrl(path), {
    headers: {
      authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const payload = await parseBackendJson<T>(response);
  return payload.data as T;
}

async function getCampaigns(token: string | null, params: MarketingPageSearchParams) {
  const page = normalizePage(params.page);
  if (!token) {
    return {
      list: [] as MarketingCampaignRecord[],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  const campaignType = params.campaign_type?.trim() || "";
  const status = params.status?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  if (campaignType) query.set("campaign_type", campaignType);
  if (status) query.set("status", status);
  if (keyword) query.set("keyword", keyword);

  try {
    const data = await fetchBackendData<CampaignListData>(
      token,
      `/employee/marketing-center/campaigns?${query}`,
    );
    return {
      list: data?.list || [],
      pagination: data?.pagination || { page, pageSize: 20, total: 0, totalPages: 0 },
      error: null,
    };
  } catch (error) {
    return {
      list: [] as MarketingCampaignRecord[],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "营销活动列表加载失败",
    };
  }
}

async function getProjects(token: string | null) {
  if (!token) return [] as MarketingProjectOption[];

  try {
    const data = await fetchBackendData<ProjectListData>(
      token,
      "/projects?page=1&pageSize=200",
    );
    return (data?.list || []).map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status || null,
      address: project.address || null,
    }));
  } catch {
    return [] as MarketingProjectOption[];
  }
}

const statusLabel = Object.fromEntries(campaignStatusOptions);

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<MarketingPageSearchParams>;
}) {
  const params = await searchParams;
  const token = await getAdminToken();
  const [{ list, pagination, error }, projects] = await Promise.all([
    getCampaigns(token, params),
    getProjects(token),
  ]);
  const campaignType = params.campaign_type?.trim() || "";
  const status = params.status?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const activeCount = list.filter((item) => item.status === "active").length;
  const pausedCount = list.filter((item) => item.status === "paused").length;
  const rewardCount = list.filter((item) => item.campaign_type === "appointment_reward").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">营销活动</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            分享助力、预约奖励活动的创建、范围配置、启停和实例查看。当前筛选共 {pagination.total} 条记录。
          </p>
        </div>
        <CreateMarketingCampaignButton projects={projects} />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Megaphone className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页活动</div>
              <div className="text-xl font-semibold">{list.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <PlayCircle className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{statusLabel.active}</div>
              <div className="text-xl font-semibold">{activeCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <PauseCircle className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{statusLabel.paused}</div>
              <div className="text-xl font-semibold">{pausedCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-warning text-warning-foreground">
              <Gift className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">预约奖励</div>
              <div className="text-xl font-semibold">{rewardCount}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <MarketingFilters
            campaignType={campaignType}
            status={status}
            keyword={keyword}
          />
        </CardContent>
      </Card>

      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle>活动列表</CardTitle>
          <Badge variant="outline">
            第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <MarketingCampaignsTable campaigns={list} projects={projects} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          每页 {pagination.pageSize} 条，共 {pagination.total} 条
        </div>
        <MarketingPagination
          pagination={pagination}
          campaignType={campaignType}
          status={status}
          keyword={keyword}
        />
      </div>
    </div>
  );
}
