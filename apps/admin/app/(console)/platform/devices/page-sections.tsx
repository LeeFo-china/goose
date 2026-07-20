import Link from "next/link";
import { buildPlatformDevicesHref } from "@/components/platform-devices/platform-device-href";
import {
  PlatformDeviceFilters,
} from "@/components/platform-devices/platform-device-list-actions";
import { PlatformDevicesTable } from "@/components/platform-devices/platform-devices-table";
import {
  PlatformTencentDeviceFilters,
} from "@/components/platform-devices/platform-tencent-device-list-actions";
import { PlatformTencentDevicesTable } from "@/components/platform-devices/platform-tencent-devices-table";
import {
  type PlatformDeviceListData,
  type PlatformDevicesTabValue,
  type PlatformTencentDeviceListData,
} from "@/components/platform-devices/platform-device-types";
import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { platformTabsListClassName, platformTabsTriggerWithBadgeClassName } from "@/components/platform/platform-tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  summarizeOwnershipPage,
  summarizeTencentPage,
} from "./page-data";

export function PlatformDevicesContent({
  activeTab,
  ownershipData,
  tencentData,
  vendor,
  status,
  onlyUnbound,
  keyword,
}: {
  activeTab: PlatformDevicesTabValue;
  ownershipData: PlatformDeviceListData & { error: string | null };
  tencentData: PlatformTencentDeviceListData & { error: string | null };
  vendor: string;
  status: string;
  onlyUnbound: boolean;
  keyword: string;
}) {
  const error = activeTab === "ownership" ? ownershipData.error : tencentData.error;
  const ownershipSummary = summarizeOwnershipPage(ownershipData.list);
  const tencentSummary = summarizeTencentPage(tencentData.list);
  const currentPageSize = activeTab === "ownership"
    ? ownershipData.pagination.pageSize
    : tencentData.pagination.pageSize;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <Tabs value={activeTab} className="contents">
        <PlatformListPageShell
          title="设备资产"
          description="平台分别从资产归属和腾讯云原始设备两个视角查看设备接入状态。"
          error={error}
          summary={activeTab === "ownership" ? (
            <OwnershipSummaryCards
              total={ownershipData.pagination.total}
              summary={ownershipSummary}
            />
          ) : (
            <TencentSummaryCards
              total={tencentData.pagination.total}
              summary={tencentSummary}
            />
          )}
          tabs={
            <TabsList className={platformTabsListClassName}>
              <TabsTrigger value="ownership" asChild className={platformTabsTriggerWithBadgeClassName}>
                <Link
                  href={buildPlatformDevicesHref({
                    tab: "ownership",
                    pageSize: currentPageSize,
                    vendor,
                    status,
                    onlyUnbound: onlyUnbound ? "true" : "__all",
                    keyword,
                  })}
                >
                  资产归属
                  {activeTab === "ownership" ? (
                    <Badge variant="default">{ownershipData.pagination.total}</Badge>
                  ) : null}
                </Link>
              </TabsTrigger>
              <TabsTrigger value="tencent" asChild className={platformTabsTriggerWithBadgeClassName}>
                <Link
                  href={buildPlatformDevicesHref({
                    tab: "tencent",
                    pageSize: currentPageSize,
                    status,
                    keyword,
                  })}
                >
                  腾讯云设备
                  {activeTab === "tencent" ? (
                    <Badge variant="default">{tencentData.pagination.total}</Badge>
                  ) : null}
                </Link>
              </TabsTrigger>
            </TabsList>
          }
          filters={activeTab === "ownership" ? (
            <PlatformDeviceFilters
              vendor={vendor}
              status={status}
              onlyUnbound={onlyUnbound}
              keyword={keyword}
            />
          ) : (
            <PlatformTencentDeviceFilters status={status} keyword={keyword} />
          )}
          pagination={activeTab === "ownership" ? ownershipData.pagination : tencentData.pagination}
          currentCount={activeTab === "ownership" ? ownershipData.list.length : tencentData.list.length}
          tableViewportTestId="platform-device-list-table-viewport"
          unit={activeTab === "ownership" ? "个设备资产" : "台腾讯云设备"}
        >
          {activeTab === "ownership" ? (
            <PlatformDevicesTable devices={ownershipData.list} />
          ) : (
            <PlatformTencentDevicesTable devices={tencentData.list} />
          )}
        </PlatformListPageShell>
      </Tabs>
    </div>
  );
}

function OwnershipSummaryCards({
  total,
  summary,
}: {
  total: number;
  summary: ReturnType<typeof summarizeOwnershipPage>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      <SummaryCard label="设备总数" value={total} />
      <SummaryCard label="本页在线" value={summary.online} />
      <SummaryCard label="本页离线" value={summary.offline} />
      <SummaryCard label="本页已绑定" value={summary.bound} />
      <SummaryCard label="本页未绑定" value={summary.unbound} />
    </div>
  );
}

function TencentSummaryCards({
  total,
  summary,
}: {
  total: number;
  summary: ReturnType<typeof summarizeTencentPage>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      <SummaryCard label="设备总数" value={total} />
      <SummaryCard label="本页在线" value={summary.online} />
      <SummaryCard label="本页离线" value={summary.offline} />
      <SummaryCard label="本页已纳入通道" value={summary.claimedChannels} />
      <SummaryCard label="本页未纳入通道" value={summary.unclaimedChannels} />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
