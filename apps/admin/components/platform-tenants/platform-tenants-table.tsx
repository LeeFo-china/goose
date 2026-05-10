"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import {
  EditPlatformTenantButton,
  PlatformTenantStatusButton,
} from "@/components/platform-tenants/platform-tenant-mutations";
import {
  getPlatformTenantStatusMeta,
  type PlatformTenantRecord,
  type PlatformTenantUsage,
} from "@/components/platform-tenants/platform-tenant-types";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function usageText(usage?: PlatformTenantUsage | null) {
  if (!usage) return "暂无统计";
  return [
    `员工 ${usage.employee_count}`,
    `客户 ${usage.customer_count}`,
    `项目 ${usage.project_count}`,
    `H5 ${usage.h5_page_count}`,
    `摄像头 ${usage.camera_count}`,
  ].join(" / ");
}

const columns: ColumnDef<PlatformTenantRecord>[] = [
  {
    accessorKey: "name",
    header: "租户",
    cell: ({ row }) => {
      const tenant = row.original;
      return (
        <div className="min-w-0">
          <div className="truncate font-medium">{tenant.name}</div>
          <div className="truncate text-xs text-muted-foreground">{tenant.slug}</div>
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const meta = getPlatformTenantStatusMeta(row.original.status);
      return <Badge variant={meta.variant}>{meta.label}</Badge>;
    },
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "contact_name",
    header: "联系人",
    cell: ({ row }) => {
      const tenant = row.original;
      return (
        <div className="min-w-0">
          <div className="truncate">{tenant.contact_name || "-"}</div>
          <div className="truncate text-xs text-muted-foreground">{tenant.contact_phone || "未填写电话"}</div>
        </div>
      );
    },
  },
  {
    id: "usage",
    header: "用量",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {usageText(row.original.usage)}
      </span>
    ),
    meta: {
      cellClassName: "min-w-[260px]",
    },
  },
  {
    accessorKey: "created_at",
    header: "创建时间",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatDate(row.original.created_at)}
      </span>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row }) => (
      <div className="flex justify-end gap-2">
        <EditPlatformTenantButton tenant={row.original} />
        <PlatformTenantStatusButton tenant={row.original} />
      </div>
    ),
    meta: {
      headerClassName: "text-right",
      cellClassName: "whitespace-nowrap text-right",
    },
  },
];

export function PlatformTenantsTable({ tenants }: { tenants: PlatformTenantRecord[] }) {
  return (
    <DataTable
      columns={columns}
      data={tenants}
      emptyText="还没有创建租户"
      minWidth="min-w-[1080px]"
    />
  );
}
