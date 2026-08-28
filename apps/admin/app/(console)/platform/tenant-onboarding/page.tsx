import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import { TenantManagementTabs } from "@/components/platform-tenants/tenant-management-tabs";
import { ServiceProviderPublicationTable } from "@/components/tenant-onboarding/service-provider-publication-table";
import {
  TenantOnboardingFilters,
  type TenantOnboardingTab,
} from "@/components/tenant-onboarding/tenant-onboarding-filters";
import { TenantOnboardingTable } from "@/components/tenant-onboarding/tenant-onboarding-table";
import type {
  ListData,
  ServiceProviderPublicationListRecord,
  TenantOnboardingApplicationListRecord,
} from "@/components/tenant-onboarding/tenant-onboarding-types";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const APPLICATION_STATUSES = [
  "submitted",
  "reviewing",
  "supplement_required",
  "approved",
  "rejected",
  "withdrawn",
] as const;
const ASSIST_STATUSES = [
  "not_applicable",
  "pending",
  "verified",
  "supplement_suggested",
  "not_recommended",
  "expired",
] as const;
const PUBLICATION_STATUSES = ["draft", "pending_review", "published", "suspended"] as const;

type SearchParams = Promise<{
  tab?: string;
  page?: string;
  pageSize?: string;
  status?: string;
  assist_status?: string;
  candidate_partner_id?: string;
  keyword?: string;
  region_code?: string;
}>;

export default async function PlatformTenantOnboardingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const tab = readTab(params.tab);
  const page = readPositiveInteger(params.page, 1);
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const status = readStatus(tab, params.status);
  const assistStatus = readAllowed(params.assist_status, ASSIST_STATUSES);
  const candidatePartnerId = cleanParam(params.candidate_partner_id, 36);
  const keyword = cleanParam(params.keyword, 120);
  const regionCode = cleanParam(params.region_code, 6);
  const hasPlatformAccess = session.roles.includes("platform_admin");
  const canReviewApplications = hasPlatformAccess && session.permissions.some(
    ({ code }) => code === "platform.tenant_onboarding.review",
  );
  const canPublishProfiles = hasPlatformAccess && session.permissions.some(
    ({ code }) => code === "platform.service_provider.publish",
  );
  const canAccessActiveTab = tab === "applications"
    ? canReviewApplications
    : canPublishProfiles;
  const accessError = !hasPlatformAccess
    ? "当前账号不是平台超管，无法访问租户管理"
    : canAccessActiveTab
      ? null
      : tab === "applications"
        ? "当前账号缺少入驻申请审核权限"
        : "当前账号缺少服务商公开发布权限";

  const applicationsResult = tab === "applications" && canReviewApplications
    ? await fetchBackend<ListData<TenantOnboardingApplicationListRecord>>(
      `/platform/tenant-onboarding/applications?${buildQuery({
        page,
        pageSize,
        status,
        assist_status: assistStatus,
        candidate_partner_id: candidatePartnerId,
        keyword,
        region_code: regionCode,
      })}`,
      emptyList<TenantOnboardingApplicationListRecord>(page, pageSize),
    )
    : { data: emptyList<TenantOnboardingApplicationListRecord>(page, pageSize), error: null };
  const publicationsResult = tab === "publications" && canPublishProfiles
    ? await fetchBackend<ListData<ServiceProviderPublicationListRecord>>(
      `/platform/service-provider-publications?${buildQuery({
        page,
        pageSize,
        status,
        keyword,
      })}`,
      emptyList<ServiceProviderPublicationListRecord>(page, pageSize),
    )
    : { data: emptyList<ServiceProviderPublicationListRecord>(page, pageSize), error: null };
  const activeList = tab === "applications"
    ? applicationsResult.data
    : publicationsResult.data;
  const activeError = accessError || applicationsResult.error || publicationsResult.error;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <Tabs value={tab} className="contents">
        <PlatformListPageShell
          title="租户管理"
          description={tab === "applications"
            ? "复核装修公司入驻资料，并跟踪申请到租户创建的完整状态。"
            : "审核服务商公开资料，并控制面向用户的区域展示状态。"}
          leading={
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
              <Building2 className="size-4" aria-hidden="true" />
            </span>
          }
          titleMeta={
            <Badge variant="outline">
              {tab === "applications" ? "入驻复核" : "发布审核"}
            </Badge>
          }
          error={activeError}
          tabs={
            <TenantManagementTabs
              activeTab={tab}
              permissions={session.permissions}
              isPlatformSuperAdmin={hasPlatformAccess}
              pageSize={pageSize}
            />
          }
          filters={
            <TenantOnboardingFilters
              tab={tab}
              status={status}
              assistStatus={assistStatus}
              candidatePartnerId={candidatePartnerId}
              keyword={keyword}
              regionCode={regionCode}
            />
          }
          pagination={activeList.pagination}
          currentCount={activeList.list.length}
          tableViewportTestId="platform-tenant-onboarding-table-viewport"
          unit={tab === "applications" ? "条申请" : "家公司"}
        >
          {tab === "applications" ? (
            <TabsContent value="applications" className="m-0 min-h-full">
              <TenantOnboardingTable applications={applicationsResult.data.list} />
            </TabsContent>
          ) : (
            <TabsContent value="publications" className="m-0 min-h-full">
              <ServiceProviderPublicationTable publications={publicationsResult.data.list} />
            </TabsContent>
          )}
        </PlatformListPageShell>
      </Tabs>
    </div>
  );
}

function readTab(value: string | undefined): TenantOnboardingTab {
  return value === "publications" ? "publications" : "applications";
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readStatus(tab: TenantOnboardingTab, value: string | undefined) {
  return tab === "applications"
    ? readAllowed(value, APPLICATION_STATUSES)
    : readAllowed(value, PUBLICATION_STATUSES);
}

function readAllowed<const Value extends string>(
  value: string | undefined,
  allowed: readonly Value[],
) {
  return allowed.includes(value as Value) ? value as Value : "";
}

function cleanParam(value: string | undefined, max: number) {
  return (value || "").trim().slice(0, max);
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.toString();
}

function emptyList<RecordType>(page: number, pageSize: number): ListData<RecordType> {
  return { list: [], pagination: { page, pageSize, total: 0, totalPages: 0 } };
}

async function fetchBackend<Result>(path: string, fallback: Result) {
  const token = await getAdminToken();
  if (!token) return { data: fallback, error: "缺少登录凭证" };
  try {
    const response = await fetch(buildBackendUrl(path), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await parseBackendJson<Result>(response);
    return { data: payload.data ?? fallback, error: null };
  } catch (error) {
    return {
      data: fallback,
      error: error instanceof Error ? error.message : "服务商入驻数据加载失败",
    };
  }
}
