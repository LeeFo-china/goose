import { buildPlatformDevicesHref } from "@/components/platform-devices/platform-device-href";
import { PlatformDeviceTabsNav } from "@/components/platform-devices/platform-device-tabs-nav";
import {
  PlatformDeviceFilters,
  PlatformDevicePagination,
} from "@/components/platform-devices/platform-device-list-actions";
import { PlatformDevicesTable } from "@/components/platform-devices/platform-devices-table";
import {
  PlatformTencentDeviceFilters,
  PlatformTencentDevicePagination,
} from "@/components/platform-devices/platform-tencent-device-list-actions";
import { PlatformTencentDevicesTable } from "@/components/platform-devices/platform-tencent-devices-table";
import {
  getPlatformDeviceStatusMeta,
  getPlatformDeviceVendorLabel,
  type PlatformDeviceListData,
  type PlatformDevicesTabValue,
  type PlatformTencentDeviceListData,
} from "@/components/platform-devices/platform-device-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
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
  const currentTotal = activeTab === "ownership"
    ? ownershipData.pagination.total
    : tencentData.pagination.total;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">设备资产</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          平台分别从资产归属和腾讯云原始设备两个视角查看设备接入状态。
        </p>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <Tabs value={activeTab} className="flex flex-col gap-4">
        {activeTab === "ownership" ? (
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

        <Card>
          <CardHeader className="flex flex-col gap-4">
            <PlatformDeviceTabsNav
              activeTab={activeTab}
              hrefs={{
                ownership: buildPlatformDevicesHref({
                  tab: "ownership",
                  vendor,
                  status,
                  onlyUnbound: onlyUnbound ? "true" : "__all",
                  keyword,
                }),
                tencent: buildPlatformDevicesHref({
                  tab: "tencent",
                  status,
                  keyword,
                }),
              }}
              counts={{
                ownership: activeTab === "ownership" ? ownershipData.pagination.total : undefined,
                tencent: activeTab === "tencent" ? tencentData.pagination.total : undefined,
              }}
            />
            <DeviceListHeader
              activeTab={activeTab}
              vendor={vendor}
              status={status}
              onlyUnbound={onlyUnbound}
              currentTotal={currentTotal}
            />
            {activeTab === "ownership" ? (
              <PlatformDeviceFilters
                vendor={vendor}
                status={status}
                onlyUnbound={onlyUnbound}
                keyword={keyword}
              />
            ) : (
              <PlatformTencentDeviceFilters status={status} keyword={keyword} />
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-0">
            {activeTab === "ownership" ? (
              <>
                <PlatformDevicesTable devices={ownershipData.list} />
                <div className="px-4 pb-4">
                  <PlatformDevicePagination
                    pagination={ownershipData.pagination}
                    vendor={vendor}
                    status={status}
                    onlyUnbound={onlyUnbound}
                    keyword={keyword}
                  />
                </div>
              </>
            ) : (
              <>
                <PlatformTencentDevicesTable devices={tencentData.list} />
                <div className="px-4 pb-4">
                  <PlatformTencentDevicePagination
                    pagination={tencentData.pagination}
                    status={status}
                    keyword={keyword}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
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

function DeviceListHeader({
  activeTab,
  vendor,
  status,
  onlyUnbound,
  currentTotal,
}: {
  activeTab: PlatformDevicesTabValue;
  vendor: string;
  status: string;
  onlyUnbound: boolean;
  currentTotal: number;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
      <div>
        <CardTitle>{activeTab === "ownership" ? "设备归属列表" : "腾讯云设备列表"}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          {activeTab === "ownership" ? (
            <>
              {vendor ? <Badge variant="outline">{getPlatformDeviceVendorLabel(vendor)}</Badge> : <Badge variant="outline">全部厂商</Badge>}
              {status ? <Badge variant={getPlatformDeviceStatusMeta(status).variant}>{getPlatformDeviceStatusMeta(status).label}</Badge> : <Badge variant="outline">全部状态</Badge>}
              {onlyUnbound ? <Badge variant="secondary">仅未绑定</Badge> : <Badge variant="outline">全部绑定</Badge>}
            </>
          ) : (
            <>
              {status ? <Badge variant={getPlatformDeviceStatusMeta(status).variant}>{getPlatformDeviceStatusMeta(status).label}</Badge> : <Badge variant="outline">全部状态</Badge>}
              <Badge variant="outline">包含设备基本信息与通道归属</Badge>
            </>
          )}
        </CardDescription>
      </div>
      <Badge variant="outline">共 {currentTotal} {activeTab === "ownership" ? "个" : "台"}</Badge>
    </div>
  );
}
