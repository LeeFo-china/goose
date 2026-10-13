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

function renderStatus(status: string) {
  const meta = statusMeta[status] || {
    label: status || "未知",
    variant: "outline" as const,
  };

  return <Badge className="whitespace-nowrap" variant={meta.variant}>{meta.label}</Badge>;
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
        {row.original.position ? <div className="mt-1 text-xs text-muted-foreground">{row.original.position}</div> : null}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => <div className="flex items-center gap-2">{renderStatus(row.original.status)}{row.original.status_source === "persisted" ? <span className="text-xs text-muted-foreground">最近记录</span> : null}</div>,
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "permission",
    header: "客户可见性",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        <Badge variant={row.original.can_view ? "success" : "secondary"}>
          {row.original.can_view ? "客户可见" : "客户隐藏"}
        </Badge>

      </div>
    ),
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
      minWidth="min-w-[660px]"
      tableMeta={{ projectId, devices }}
    />
  );
}
