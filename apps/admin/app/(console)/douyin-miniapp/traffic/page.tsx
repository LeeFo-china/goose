import { redirect } from "next/navigation";

import { TrafficDashboard, normalizeTrafficStats, parseTrafficFilters,
  type TrafficStats } from "@/components/douyin-miniapp/traffic-dashboard";
import { StatusAlert } from "@/components/admin/status-alert";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type PageSearchParams = Partial<Record<"days" | "groupBy" | "page", string>>;

export default async function TenantDouyinTrafficPage({ searchParams }: {
  searchParams: Promise<PageSearchParams>;
}) {
  const [session, token, raw] = await Promise.all([
    getAdminSession(), getAdminToken(), searchParams,
  ]);
  if (!session) redirect("/login");
  const canRead = session.tenant !== null && session.permissions.some(
    (permission) => permission.code === "douyin_miniapp.read"
      && permission.scope === "all",
  );
  if (!canRead) return <main className="p-6">
    <StatusAlert>当前账号缺少抖音小程序统计查看权限</StatusAlert>
  </main>;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.set(key, value);
  }
  const filters = parseTrafficFilters(params);
  let data: TrafficStats | null = null;
  let error: string | null = null;
  if (!token) error = "缺少登录凭证，请重新登录后重试";
  else {
    try {
      const query = new URLSearchParams({ days: String(filters.days),
        groupBy: filters.groupBy, page: String(filters.page), pageSize: "20" });
      const response = await fetch(buildBackendUrl(
        `/tenant/douyin-miniapp/source-stats?${query}`), {
        headers: { authorization: `Bearer ${token}` }, cache: "no-store",
      });
      const payload = await parseBackendJson<unknown>(response);
      data = normalizeTrafficStats(payload.data, filters);
      if (!data) error = "流量统计响应无效，请重试";
    } catch {
      error = "流量统计加载失败，请稍后重试";
    }
  }
  return <TrafficDashboard data={data} filters={filters} error={error} />;
}
