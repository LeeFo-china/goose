"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import {
  PermissionRowActions,
  type PermissionRecord,
} from "@/components/permissions/permission-mutations";

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "secondary" | "outline";
}> = {
  active: { label: "启用", variant: "success" },
  inactive: { label: "停用", variant: "secondary" },
};

const columns: ColumnDef<PermissionRecord>[] = [
  {
    accessorKey: "code",
    header: "权限",
    cell: ({ row }) => {
      const permission = row.original;

      return (
        <div className="min-w-0">
          <div className="truncate font-medium">
            {permission.name || permission.code}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {permission.code}
          </div>
          {permission.description ? (
            <div className="mt-1 max-w-[420px] truncate text-xs text-muted-foreground">
              {permission.description}
            </div>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: "module",
    header: "模块",
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    accessorKey: "resource",
    header: "资源",
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    accessorKey: "action",
    header: "动作",
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const meta = statusMeta[row.original.status || ""] || {
        label: row.original.status || "未知",
        variant: "outline" as const,
      };

      return <Badge className="whitespace-nowrap" variant={meta.variant}>{meta.label}</Badge>;
    },
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row }) => <PermissionRowActions permission={row.original} />,
    meta: {
      headerClassName: "text-right",
      cellClassName: "relative whitespace-nowrap text-right",
    },
  },
];

export function PermissionsTable({
  permissions,
  canManageDefinitions = false,
}: {
  permissions: PermissionRecord[];
  canManageDefinitions?: boolean;
}) {
  const visibleColumns = canManageDefinitions
    ? columns
    : columns.filter((column) => column.id !== "actions");

  return (
    <DataTable
      columns={visibleColumns}
      data={permissions}
      emptyText="没有符合条件的权限"
      minWidth={canManageDefinitions ? "min-w-[1120px]" : "min-w-[900px]"}
    />
  );
}
