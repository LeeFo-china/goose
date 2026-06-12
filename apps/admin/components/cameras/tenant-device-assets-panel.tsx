"use client";

import { StatusAlert } from "@/components/admin/status-alert";
import { CreateTencentDeviceButton } from "@/components/cameras/tencent-device-actions";
import type { TenantDeviceAsset } from "@/components/cameras/camera-types";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function TenantDeviceAssetsPanel({
  assets,
  error,
  projectId,
}: {
  assets: TenantDeviceAsset[];
  error?: string | null;
  projectId?: string | null;
}) {
  const unboundCount = assets.filter((asset) => !asset.bound_camera_id).length;
  const onlineCount = assets.filter((asset) => asset.status === "online").length;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col justify-between gap-3 border-b bg-card px-4 py-3 md:flex-row md:items-center">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">设备资产池</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            统一管理当前租户设备资产，新增设备后同步通道，再绑定到项目摄像头。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">共 {assets.length} 个</Badge>
          <Badge variant="secondary">未绑定 {unboundCount}</Badge>
          <Badge variant="success">在线 {onlineCount}</Badge>
          {projectId ? (
            <CreateTencentDeviceButton
              projectId={projectId}
              sipServer={null}
            />
          ) : null}
          <SyncTenantDevicesButton />
        </div>
      </div>
      {error ? (
        <div className="p-4">
          <StatusAlert tone="warning">{error}</StatusAlert>
        </div>
      ) : null}
      <div className="overflow-x-auto">
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
            {assets.map((asset) => (
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
                  <TenantDeviceRowActions asset={asset} />
                </TableCell>
              </TableRow>
            ))}
            {!assets.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                  暂无租户设备资产
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
