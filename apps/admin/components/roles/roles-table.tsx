"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { RoleStatusConfig, type RoleStatus } from "@gooes/domain";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import {
  RoleRowActions,
  type RoleRecord,
} from "@/components/roles/role-mutations";

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "secondary" | "outline";
}> = {
  active: { label: RoleStatusConfig.active.label, variant: "success" },
  inactive: { label: RoleStatusConfig.inactive.label, variant: "secondary" },
};

const columns: ColumnDef<RoleRecord>[] = [
  {
    accessorKey: "name",
    header: "角色",
    cell: ({ row }) => {
      const role = row.original;
      return (
        <div className="min-w-0">
          <div className="truncate font-medium">{role.name}</div>
          <div className="truncate text-xs text-muted-foreground">{role.code}</div>
          {role.description ? (
            <div className="mt-1 max-w-[520px] truncate text-xs text-muted-foreground">
              {role.description}
            </div>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const status = row.original.status as RoleStatus;
      const meta = statusMeta[status] || {
        label: row.original.status || "未知",
        variant: "outline" as const,
      };
      return <Badge variant={meta.variant}>{meta.label}</Badge>;
    },
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "updated_at",
    header: "更新时间",
    cell: ({ row }) => {
      const value = row.original.updated_at;
      if (!value) return <span className="text-muted-foreground">-</span>;
      const date = new Date(value);
      return (
        <span className="text-muted-foreground">
          {Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN")}
        </span>
      );
    },
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row }) => <RoleRowActions role={row.original} />,
    meta: {
      headerClassName: "text-right",
      cellClassName: "whitespace-nowrap text-right",
    },
  },
];

export function RolesTable({ roles }: { roles: RoleRecord[] }) {
  return (
    <DataTable
      columns={columns}
      data={roles}
      emptyText="还没有创建角色"
      minWidth="min-w-[860px]"
    />
  );
}
