import Link from "next/link";
import { FileVideo2, Sparkles } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { SocialVideoPagination } from "@/components/social-video/social-video-pagination";
import { SocialVideoScriptsTable } from "@/components/social-video/social-video-scripts-table";
import type { SocialVideoScriptsData } from "@/components/social-video/social-video-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  return options.some((item) => item[0] === value) ? value : "";
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
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">自媒体脚本</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          查看小程序端生成的短视频脚本记录，用于运营复盘、复制文案和排查生成质量。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileVideo2 className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">脚本总数</div>
              <div className="text-xl font-semibold">{data.total}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-success text-success-foreground">
              <Sparkles className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页完成</div>
              <div className="text-xl font-semibold">{completedCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-destructive text-destructive-foreground">
              <FileVideo2 className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页失败</div>
              <div className="text-xl font-semibold">{failedCount}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <form className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto_auto] md:items-end">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">目标平台</span>
              <select
                name="target_platform"
                defaultValue={filters.targetPlatform}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="">全部平台</option>
                {TARGET_PLATFORMS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">脚本风格</span>
              <select
                name="style"
                defaultValue={filters.style}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="">全部风格</option>
                {STYLES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">状态</span>
              <select
                name="status"
                defaultValue={filters.status}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="">全部状态</option>
                {STATUSES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <Button type="submit">筛选</Button>
            <Button asChild type="button" variant="outline">
              <Link href="/social-video">重置</Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <SocialVideoScriptsTable items={data.items} />

      <SocialVideoPagination page={data.page} pageSize={data.pageSize} total={data.total} />
    </div>
  );
}
