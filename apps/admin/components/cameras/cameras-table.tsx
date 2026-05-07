"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import {
  CameraRowActions,
} from "@/components/cameras/camera-mutations";
import type {
  CameraDeviceChannel,
  CameraRecord,
} from "@/components/cameras/camera-types";

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline" | "danger" | "default";
}> = {
  online: { label: "在线", variant: "success" },
  offline: { label: "离线", variant: "danger" },
  unknown: { label: "未知", variant: "secondary" },
};

const capabilityLabel: Record<string, string> = {
  live: "直播",
  ptz: "云台",
  zoom: "变焦",
  talk: "对讲",
  playback: "回放",
};

function renderStatus(status: string) {
  const meta = statusMeta[status] || {
    label: status || "未知",
    variant: "outline" as const,
  };

  return <Badge className="whitespace-nowrap" variant={meta.variant}>{meta.label}</Badge>;
}

function renderCapabilities(capabilities: string[]) {
  if (!capabilities.length) return <span className="text-muted-foreground">-</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {capabilities.map((capability) => (
        <Badge key={capability} variant="outline">
          {capabilityLabel[capability] || capability}
        </Badge>
      ))}
    </div>
  );
}

function renderVendor(vendor: string) {
  if (vendor === "tencent_iotvideo_industry") {
    return <Badge variant="default">腾讯云</Badge>;
  }

  if (vendor === "ezviz") {
    return <Badge variant="outline">萤石</Badge>;
  }

  return <Badge variant="secondary">{vendor || "未知"}</Badge>;
}

const columns: ColumnDef<CameraRecord>[] = [
  {
    accessorKey: "name",
    header: "摄像头",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">
          {row.original.name || "未命名摄像头"}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {row.original.position || "未设置位置"}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => renderStatus(row.original.status),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "vendor",
    header: "厂商",
    cell: ({ row }) => renderVendor(row.original.vendor),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "permission",
    header: "权限",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        <Badge variant={row.original.can_view ? "success" : "secondary"}>
          {row.original.can_view ? "可查看" : "隐藏"}
        </Badge>
        <Badge variant={row.original.can_control ? "warning" : "outline"}>
          {row.original.can_control ? "可控制" : "不可控"}
        </Badge>
      </div>
    ),
  },
  {
    accessorKey: "capabilities",
    header: "能力",
    cell: ({ row }) => renderCapabilities(row.original.capabilities),
  },
  {
    accessorKey: "video_encrypted",
    header: "加密",
    cell: ({ row }) => row.original.video_encrypted ? (
      <Badge variant="warning">已加密</Badge>
    ) : (
      <Badge variant="success">可播放</Badge>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "sort_order",
    header: "排序",
    cell: ({ row }) => row.original.sort_order,
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row, table }) => {
      const meta = table.options.meta as {
        projectId: string;
        devices: CameraDeviceChannel[];
      };

      return (
        <CameraRowActions
          projectId={meta.projectId}
          camera={row.original}
          devices={meta.devices}
        />
      );
    },
    meta: {
      headerClassName: "text-right",
      cellClassName: "relative whitespace-nowrap text-right",
    },
  },
];

export function CamerasTable({
  projectId,
  cameras,
  devices,
}: {
  projectId: string;
  cameras: CameraRecord[];
  devices: CameraDeviceChannel[];
}) {
  return (
    <DataTable
      columns={columns}
      data={cameras}
      emptyText="当前项目还没有绑定摄像头"
      minWidth="min-w-[1080px]"
      tableMeta={{ projectId, devices }}
    />
  );
}
