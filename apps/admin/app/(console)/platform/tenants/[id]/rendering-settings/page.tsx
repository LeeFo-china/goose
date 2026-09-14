import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { TenantRenderingSettingsAudit } from "@/components/platform-customer-rendering-settings/settings-audit";
import { TenantRenderingSettingsForm } from "@/components/platform-customer-rendering-settings/settings-form";
import { TenantRenderingSettingsOverview } from "@/components/platform-customer-rendering-settings/settings-overview";
import type { TenantRenderingAuditPage, TenantRenderingDailyUsage,
  TenantRenderingSettings } from "@/components/platform-customer-rendering-settings/settings-types";
import { getPlatformTenantStatusMeta, type PlatformTenantRecord } from "@/components/platform-tenants/platform-tenant-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type RouteParams = Promise<{ id: string }>;
type LoadResult<T> = { data: T | null; error: string | null };

async function load<T>(path: string, token: string, fallback: string): Promise<LoadResult<T>> {
  try {
    const response = await fetch(buildBackendUrl(path), {
      headers: { authorization: `Bearer ${token}` }, cache: "no-store",
    });
    const payload = await parseBackendJson<T>(response);
    return { data: payload.data ?? null, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : fallback };
  }
}

export default async function TenantRenderingSettingsPage({ params }: { params: RouteParams }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  if (!session.is_platform_super_admin) {
    return <StatusAlert>当前账号不是平台超管，无法管理客户生图额度。</StatusAlert>;
  }

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const token = await getAdminToken();
  if (!token) redirect("/login");

  const tenantResult = await load<PlatformTenantRecord>(`/platform/tenants/${id}`, token, "租户详情加载失败");
  if (!tenantResult.data) {
    return <StatusAlert>{tenantResult.error || "租户不存在"}</StatusAlert>;
  }
  const tenant = tenantResult.data;
  const auditQuery = new URLSearchParams({ page: "1", pageSize: "10",
    action: "customer_rendering_settings_update", target_tenant_id: id,
    resource_type: "tenant_customer_rendering_settings" });
  const [settingsResult, usageResult, auditResult] = await Promise.all([
    load<TenantRenderingSettings>(`/platform/customer-rendering-settings/${id}`, token, "额度设置加载失败"),
    load<TenantRenderingDailyUsage>(`/platform/customer-rendering-settings/${id}/usage`, token, "今日用量加载失败"),
    load<TenantRenderingAuditPage>(`/platform/audit-logs?${auditQuery}`, token, "额度审计加载失败"),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pb-6 pr-1 [scrollbar-gutter:stable]">
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" className="w-fit px-0">
          <Link href={`/platform/tenants/${id}`}><ArrowLeft data-icon="inline-start" />返回租户详情</Link>
        </Button>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal">客户生图额度 · {tenant.name}</h1>
            <Badge variant={getPlatformTenantStatusMeta(tenant.status).variant}>
              {getPlatformTenantStatusMeta(tenant.status).label}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">管理该租户的试点开关、每日任务数和预算。</p>
        </div>
      </div>
      {settingsResult.error ? <StatusAlert>{settingsResult.error}</StatusAlert> : null}
      {usageResult.error ? <StatusAlert>今日用量暂不可用：{usageResult.error}</StatusAlert> : null}
      {auditResult.error ? <StatusAlert>修改记录暂不可用：{auditResult.error}</StatusAlert> : null}
      {settingsResult.data ? (
        <>
          <TenantRenderingSettingsOverview settings={settingsResult.data} usage={usageResult.data} />
          <TenantRenderingSettingsForm tenantId={id}
            tenantActive={tenant.status === "active"} settings={settingsResult.data} />
        </>
      ) : null}
      {auditResult.data ? <TenantRenderingSettingsAudit data={auditResult.data} /> : null}
    </div>
  );
}
