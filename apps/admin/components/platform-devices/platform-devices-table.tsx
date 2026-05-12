"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import {
  getPlatformDeviceStatusMeta,
  getPlatformDeviceVendorLabel,
  type PlatformDeviceRecord,
} from "@/components/platform-devices/platform-device-types";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function compactIdentifier(value: string | null | undefined) {
  if (!value) return "-";
  if (value.length <= 22) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function deviceName(device: PlatformDeviceRecord) {
  return (
    device.vendor_channel_name ||
    device.vendor_device_name ||
    device.vendor_channel_code ||
    device.vendor_device_code ||
    compactIdentifier(device.vendor_channel_id || device.vendor_device_serial)
  );
}

const columns: ColumnDef<PlatformDeviceRecord>[] = [
  {
    accessorKey: "vendor_device_name",
    header: "设备资产",
    cell: ({ row }) => {
      const device = row.original;
      return (
        <div className="min-w-0">
          <div className="truncate font-medium">{deviceName(device)}</div>
          <div className="truncate text-xs text-muted-foreground">
            {device.device_type || "未标注类型"}
          </div>
        </div>
      );
    },
    meta: {
      cellClassName: "min-w-[180px]",
    },
  },
  {
    id: "tenant",
    header: "归属租户",
    cell: ({ row }) => {
      const tenant = row.original.tenant;
      return (
        <div className="min-w-0">
          <div className="truncate">{tenant?.name || "未知租户"}</div>
          <div className="truncate text-xs text-muted-foreground">{tenant?.slug || row.original.tenant_id}</div>
        </div>
      );
    },
    meta: {
      cellClassName: "min-w-[180px]",
    },
  },
  {
    accessorKey: "vendor",
    header: "厂商",
    cell: ({ row }) => (
      <Badge variant="outline">{getPlatformDeviceVendorLabel(row.original.vendor)}</Badge>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "identifier",
    header: "设备 / 通道 ID",
    cell: ({ row }) => (
      <div className="min-w-0 text-xs text-muted-foreground">
        <div className="truncate">设备 {compactIdentifier(row.original.vendor_device_serial)}</div>
        <div className="truncate">通道 {compactIdentifier(row.original.vendor_channel_id)}</div>
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
    id: "binding",
    header: "绑定项目",
    cell: ({ row }) => {
      const device = row.original;
      if (!device.bound_camera_id && !device.bound_project_id) {
        return <Badge variant="secondary">未绑定</Badge>;
      }

      return (
        <div className="min-w-0">
          <Badge variant="success">已绑定</Badge>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {device.bound_project?.name || device.bound_project_id || "-"}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {device.bound_camera?.name || device.bound_camera_id || "-"}
          </div>
        </div>
      );
    },
    meta: {
      cellClassName: "min-w-[180px]",
    },
  },
  {
    accessorKey: "updated_at",
    header: "更新时间",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{formatDate(row.original.updated_at)}</span>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
];

export function PlatformDevicesTable({ devices }: { devices: PlatformDeviceRecord[] }) {
  return (
    <DataTable
      columns={columns}
      data={devices}
      emptyText="暂无平台设备资产"
      minWidth="min-w-[1180px]"
    />
  );
}
