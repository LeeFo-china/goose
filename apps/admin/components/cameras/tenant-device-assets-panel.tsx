"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StatusAlert } from "@/components/admin/status-alert";
import { CreateCameraButton } from "@/components/cameras/camera-mutations";
import { Gb28181OnboardingButton } from "@/components/cameras/gb28181-onboarding-dialog";
import { CreateTencentDeviceButton } from "@/components/cameras/tencent-device-actions";
import type { Pagination, TenantDeviceAsset } from "@/components/cameras/camera-types";
import {
  SyncTenantDevicesButton,
  TenantDeviceRowActions,
} from "@/components/cameras/tenant-device-asset-actions";
import {
  assetDisplayName,
  compactIdentifier,
  renderStatus,
  vendorLabel,
} from "@/components/cameras/tenant-device-asset-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requestBackendJson } from "@/lib/backend-client";

type TenantDevicePage = {
  list: TenantDeviceAsset[];
  pagination: Pagination;
};

export function TenantDeviceAssetsPanel({
  assets,
  error,
  pagination,
  projectId,
}: {
  assets: TenantDeviceAsset[];
  error?: string | null;
  pagination?: Pagination;
  projectId?: string | null;
}) {
  const [visibleAssets, setVisibleAssets] = useState(assets);
  const [currentPage, setCurrentPage] = useState(pagination?.page || 1);
  const [pending, startTransition] = useTransition();
  const total = pagination?.total || visibleAssets.length;
  const totalPages = pagination?.totalPages || 0;
  const unboundCount = visibleAssets.filter((asset) => !asset.bound_camera_id).length;
  const onlineCount = visibleAssets.filter((asset) => asset.status === "online").length;

  useEffect(() => {
    setVisibleAssets(assets);
    setCurrentPage(pagination?.page || 1);
  }, [assets, pagination?.page]);

  function loadMore() {
    if (pending || currentPage >= totalPages) return;
    startTransition(async () => {
      try {
        const result = await requestBackendJson<TenantDevicePage>(
          `/tenant-devices?page=${currentPage + 1}&pageSize=${pagination?.pageSize || 100}`,
        );
        setVisibleAssets((current) => {
          const known = new Set(current.map((asset) => asset.id));
          return [...current, ...(result.list || []).filter((asset) => !known.has(asset.id))];
        });
        setCurrentPage(result.pagination?.page || currentPage + 1);
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : "设备加载失败");
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 flex flex-col justify-between gap-3 border-b bg-card px-4 py-3 md:flex-row md:items-center">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">设备管理</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            查看设备状态，或处理 NVR、多通道和手动绑定等高级场景。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">已加载 {visibleAssets.length} / {total}</Badge>
          <Badge variant="secondary">未绑定 {unboundCount}</Badge>
          <Badge variant="success">在线 {onlineCount}</Badge>
          {projectId ? (
            <CreateTencentDeviceButton
              projectId={projectId}
              sipServer={null}
            />
          ) : null}
          <CreateCameraButton projectId="" devices={[]} />
          <SyncTenantDevicesButton />
        </div>
      </div>
      {error ? (
        <div className="shrink-0 p-4">
          <StatusAlert tone="warning">{error}</StatusAlert>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <Table className="min-w-[920px] border-t">
          <TableHeader className="bg-muted/60">
            <TableRow>
              <TableHead>设备资产</TableHead>
              <TableHead>厂商</TableHead>
              <TableHead>设备 / 通道 ID</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>绑定</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleAssets.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{assetDisplayName(asset)}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {asset.device_type || "未标注类型"}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{vendorLabel(asset.vendor)}</Badge>
                </TableCell>
                <TableCell>
                  <div className="min-w-0 text-xs text-muted-foreground">
                    <div className="truncate">设备 {compactIdentifier(asset.vendor_device_serial)}</div>
                    <div className="truncate">通道 {compactIdentifier(asset.vendor_channel_id)}</div>
                  </div>
                </TableCell>
                <TableCell>{renderStatus(asset.status)}</TableCell>
                <TableCell>
                  {asset.bound_camera_id ? (
                    <Badge variant="success">已绑定</Badge>
                  ) : (
                    <Badge variant="secondary">未绑定</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {asset.vendor === "tencent_iotvideo_industry"
                      && asset.vendor_channel_id === null
                      && asset.device_type === "IPC"
                      && !asset.bound_camera_id
                      && asset.source_project_id ? (
                        <Gb28181OnboardingButton
                          projectId={asset.source_project_id || projectId || undefined}
                          initialAsset={asset}
                        />
                      ) : null}
                    <TenantDeviceRowActions asset={asset} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!visibleAssets.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                  暂无公司设备资产
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      {currentPage < totalPages ? (
        <div className="shrink-0 border-t bg-card px-4 py-3 text-center">
          <Button type="button" variant="outline" disabled={pending} onClick={loadMore}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            加载更多设备
          </Button>
        </div>
      ) : null}
    </div>
  );
}
