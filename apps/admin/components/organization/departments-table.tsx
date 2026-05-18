"use client";

import { useMemo } from "react";
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
    header: "显示名称",
    cell: ({ row }) => {
      const label = row.original.template_name || getDepartmentLabel(row.original.code);

      return (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name}</div>
          {label ? (
            <div className="mt-1 truncate text-xs text-muted-foreground">
              标准部门：{label}
            </div>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: "enabled",
    header: "状态",
    cell: ({ row }) => (
      <Badge variant={row.original.enabled === false ? "secondary" : "success"}>
        {row.original.enabled === false ? "已停用" : "已启用"}
      </Badge>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
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
    accessorKey: "sort",
    header: "排序",
    cell: ({ row }) => row.original.sort ?? "-",
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
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
  onDepartmentDisabled,
}: {
  departments: DepartmentRecord[];
  onDepartmentDisabled?: (code: string) => void;
}) {
  const tableColumns = useMemo<ColumnDef<DepartmentRecord>[]>(() => columns.map((column) => {
    if (column.id !== "actions") return column;
    return {
      ...column,
      cell: ({ row }) => (
        <DepartmentRowActions
          department={row.original}
          onDisabled={onDepartmentDisabled}
        />
      ),
    };
  }), [onDepartmentDisabled]);

  return (
    <DataTable
      columns={tableColumns}
      data={departments}
      emptyText="没有符合条件的部门"
      minWidth="min-w-[900px]"
    />
  );
}
