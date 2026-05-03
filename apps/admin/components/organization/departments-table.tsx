"use client";

import { type ColumnDef } from "@tanstack/react-table";
import {
  DepartmentConfig,
  type DepartmentCode,
} from "@gooes/domain";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import { DepartmentRowActions } from "@/components/organization/department-mutations";
import type { DepartmentRecord } from "@/components/organization/organization-types";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getDepartmentLabel(code: string | null) {
  if (!code) return null;
  return DepartmentConfig[code as DepartmentCode]?.label || code;
}

const columns: ColumnDef<DepartmentRecord>[] = [
  {
    accessorKey: "name",
    header: "部门",
    cell: ({ row }) => {
      const label = getDepartmentLabel(row.original.code);

      return (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name}</div>
          {label ? (
            <div className="mt-1 text-xs text-muted-foreground">{label}</div>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: "code",
    header: "编码",
    cell: ({ row }) => row.original.code ? (
      <Badge variant="outline">{row.original.code}</Badge>
    ) : (
      <span className="text-muted-foreground">未设置</span>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "created_at",
    header: "创建时间",
    cell: ({ row }) => formatDate(row.original.created_at),
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row }) => <DepartmentRowActions department={row.original} />,
    meta: {
      headerClassName: "text-right",
      cellClassName: "whitespace-nowrap text-right",
    },
  },
];

export function DepartmentsTable({
  departments,
}: {
  departments: DepartmentRecord[];
}) {
  return (
    <DataTable
      columns={columns}
      data={departments}
      emptyText="没有符合条件的部门"
      minWidth="min-w-[760px]"
    />
  );
}
