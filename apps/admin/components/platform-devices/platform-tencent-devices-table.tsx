"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { DataTable } from "@/components/admin/data-table";
import {
  getPlatformDeviceStatusMeta,
  type PlatformTencentDeviceChannel,
  type PlatformTencentDeviceRecord,
} from "@/components/platform-devices/platform-device-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function compactIdentifier(value: string | null | undefined) {
  if (!value) return "-";
  if (value.length <= 22) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function channelStateLabel(channel: PlatformTencentDeviceChannel) {
  if (channel.bound_camera_id) return "已绑定项目";
  if (channel.tenant_device_id) return "已纳入资产";
  return "未纳入资产";
}

function ChannelDetailDialog({
  device,
  open,
  onOpenChange,
}: {
  device: PlatformTencentDeviceRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[960px]">
        <DialogHeader>
          <DialogTitle>{device?.device_name || device?.device_code || device?.device_id || "腾讯云设备"}</DialogTitle>
          <DialogDescription>
            查看云端设备下的通道状态、资产归属和项目绑定信息。
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto rounded-md border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="sticky top-0 bg-muted/80 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">通道</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">资产归属</th>
                <th className="px-4 py-3 font-medium">绑定项目</th>
                <th className="px-4 py-3 font-medium">绑定摄像头</th>
              </tr>
            </thead>
            <tbody>
              {(device?.channels || []).map((channel) => {
                const statusMeta = getPlatformDeviceStatusMeta(channel.status);
                return (
                  <tr key={channel.channel_id} className="border-t align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{channel.channel_name || channel.channel_id}</div>
                      <div className="text-xs text-muted-foreground">
                        {compactIdentifier(channel.channel_id)}
                        {channel.channel_code ? ` / ${channel.channel_code}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div>{channel.tenant_name || "未归属"}</div>
                      <div className="text-xs text-muted-foreground">
                        {channel.tenant_slug || channelStateLabel(channel)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {channel.bound_project_name || channel.bound_project_id || "-"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {channel.bound_camera_name || channel.bound_camera_id || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TencentDeviceDetailAction({ device }: { device: PlatformTencentDeviceRecord }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Eye data-icon="inline-start" />
          查看通道
        </Button>
      </div>
      <ChannelDetailDialog device={device} open={open} onOpenChange={setOpen} />
    </>
  );
}

const columns: ColumnDef<PlatformTencentDeviceRecord>[] = [
  {
    accessorKey: "device_name",
    header: "腾讯云设备",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">
          {row.original.device_name || row.original.device_code || row.original.device_id}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {row.original.device_type_label || "未标注类型"}
        </div>
      </div>
    ),
    meta: {
      cellClassName: "min-w-[220px]",
    },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const meta = getPlatformDeviceStatusMeta(row.original.status);
      return <Badge variant={meta.variant}>{meta.label}</Badge>;
    },
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "identifier",
    header: "接入标识",
    cell: ({ row }) => (
      <div className="min-w-0 text-xs text-muted-foreground">
        <div className="truncate">DeviceId {compactIdentifier(row.original.device_id)}</div>
        <div className="truncate">DeviceCode {compactIdentifier(row.original.device_code)}</div>
      </div>
    ),
    meta: {
      cellClassName: "min-w-[220px]",
    },
  },
  {
    id: "tenants",
    header: "归属租户",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.tenants.length ? row.original.tenants.map((tenant) => (
          <Badge key={tenant.id} variant="outline">
            {tenant.name || tenant.slug || tenant.id}
          </Badge>
        )) : (
          <Badge variant="secondary">未纳入资产</Badge>
        )}
      </div>
    ),
    meta: {
      cellClassName: "min-w-[220px]",
    },
  },
  {
    id: "channels",
    header: "通道概况",
    cell: ({ row }) => (
      <div className="min-w-0 text-xs text-muted-foreground">
        <div>总通道 {row.original.channel_count}</div>
        <div>已纳入 {row.original.claimed_channel_count} / 已绑定 {row.original.bound_channel_count}</div>
        <div>未纳入 {row.original.unclaimed_channel_count}</div>
      </div>
    ),
    meta: {
      cellClassName: "min-w-[170px]",
    },
  },
  {
    accessorKey: "group_name",
    header: "分组 / 协议",
    cell: ({ row }) => (
      <div className="min-w-0 text-xs text-muted-foreground">
        <div className="truncate">{row.original.group_name || row.original.group_id || "-"}</div>
        <div className="truncate">{row.original.protocol || "-"}</div>
      </div>
    ),
    meta: {
      cellClassName: "min-w-[160px]",
    },
  },
  {
    id: "actions",
    header: "通道信息",
    cell: ({ row }) => <TencentDeviceDetailAction device={row.original} />,
    meta: {
      headerClassName:
        "sticky right-0 z-10 bg-muted text-right shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]",
      cellClassName:
        "sticky right-0 z-10 whitespace-nowrap bg-background text-right shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]",
    },
  },
];

export function PlatformTencentDevicesTable({ devices }: { devices: PlatformTencentDeviceRecord[] }) {
  return (
    <DataTable
      columns={columns}
      data={devices}
      emptyText="暂无腾讯云设备"
      minWidth="min-w-[1340px]"
    />
  );
}
