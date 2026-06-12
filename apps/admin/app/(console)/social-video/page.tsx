import { CircleCheck, CircleX, FileVideo2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { SocialVideoFilters } from "@/components/social-video/social-video-filters";
import { SocialVideoPagination } from "@/components/social-video/social-video-pagination";
import { SocialVideoScriptsTable } from "@/components/social-video/social-video-scripts-table";
import type { SocialVideoScriptsData } from "@/components/social-video/social-video-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type SocialVideoPageSearchParams = {
  page?: string;
  target_platform?: string;
  style?: string;
  status?: string;
};

const PAGE_SIZE = 12;
const TARGET_PLATFORMS = [
  ["douyin", "抖音"],
  ["xiaohongshu", "小红书"],
  ["shipinhao", "视频号"],
  ["kuaishou", "快手"],
] as const;
const STYLES = [
  ["practical", "实用口播"],
  ["seeding", "种草分享"],
  ["professional", "专业可信"],
  ["down_to_earth", "接地气"],
] as const;
const STATUSES = [
  ["completed", "已完成"],
  ["failed", "失败"],
] as const;

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function includesValue<T extends readonly (readonly [string, string])[]>(
  options: T,
  value: string | undefined,
) {
  return value && options.some((item) => item[0] === value) ? value : "";
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

async function getSocialVideoData(params: SocialVideoPageSearchParams) {
  const page = normalizePage(params.page);
  const targetPlatform = includesValue(TARGET_PLATFORMS, params.target_platform);
  const style = includesValue(STYLES, params.style);
  const status = includesValue(STATUSES, params.status);
  const token = await getAdminToken();

  if (!token) {
    return {
      data: { items: [], total: 0, page, pageSize: PAGE_SIZE },
      filters: { targetPlatform, style, status },
      error: "缺少登录凭证",
    };
  }

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  if (targetPlatform) query.set("target_platform", targetPlatform);
  if (style) query.set("style", style);
  if (status) query.set("status", status);

  try {
    const data = await fetchBackendData<SocialVideoScriptsData>(
      token,
      `/admin/social-video/scripts?${query}`,
    );
    return {
      data: data || { items: [], total: 0, page, pageSize: PAGE_SIZE },
      filters: { targetPlatform, style, status },
      error: null,
    };
  } catch (error) {
    return {
      data: { items: [], total: 0, page, pageSize: PAGE_SIZE },
      filters: { targetPlatform, style, status },
      error: error instanceof Error ? error.message : "短视频脚本加载失败",
    };
  }
}

export default async function SocialVideoPage({
  searchParams,
}: {
  searchParams: Promise<SocialVideoPageSearchParams>;
}) {
  const params = await searchParams;
  const { data, filters, error } = await getSocialVideoData(params);
  const completedCount = data.items.filter((item) => item.status === "completed").length;
  const failedCount = data.items.filter((item) => item.status === "failed").length;

  return (
    <div className="flex min-h-[calc(100vh-6.5rem)] flex-col gap-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
          <FileVideo2 aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-normal">自媒体脚本</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            小程序端生成的短视频脚本记录。当前筛选共 {data.total} 条。
          </p>
        </div>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <SocialVideoFilters
              targetPlatform={filters.targetPlatform}
              style={filters.style}
              status={filters.status}
              targetPlatformOptions={TARGET_PLATFORMS.map(([value, label]) => ({ value, label }))}
              styleOptions={STYLES.map(([value, label]) => ({ value, label }))}
              statusOptions={STATUSES.map(([value, label]) => ({ value, label }))}
            />
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="tabular-nums">
                共 {data.total}
              </Badge>
              <Badge variant="outline" className="tabular-nums">
                <CircleCheck data-icon="inline-start" />
                完成 {completedCount}
              </Badge>
              <Badge variant={failedCount > 0 ? "danger" : "outline"} className="tabular-nums">
                <CircleX data-icon="inline-start" />
                失败 {failedCount}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
          {error ? (
            <div className="shrink-0 px-4 pt-4">
              <StatusAlert>{error}</StatusAlert>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">
            <SocialVideoScriptsTable items={data.items} />
          </div>
          <div className="shrink-0 border-t bg-card px-4 py-3">
            <SocialVideoPagination page={data.page} pageSize={data.pageSize} total={data.total} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
