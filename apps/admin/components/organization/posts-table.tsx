"use client";

import { type ColumnDef } from "@tanstack/react-table";
import {
  EmployeePostConfig,
  PostStatusConfig,
  SalaryTypeConfig,
  type EmployeePostCode,
  type PostStatus,
  type SalaryType,
} from "@gooes/domain";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import { PostRowActions } from "@/components/organization/post-mutations";
import type { PostRecord } from "@/components/organization/organization-types";

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

function formatMoney(value: number | null | undefined) {
  if (value == null) return "-";
  return value.toLocaleString("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  });
}

function postCodeLabel(code: string | null) {
  if (!code) return null;
  return EmployeePostConfig[code as EmployeePostCode]?.label || code;
}

function salaryTypeLabel(value: string | null) {
  if (!value) return null;
  return SalaryTypeConfig[value as SalaryType]?.label || value;
}

function statusMeta(status: number | null) {
  const normalized = status === 0 ? 0 : 1;
  const config = PostStatusConfig[normalized as PostStatus];
  return {
    label: config.label,
    variant: normalized === 1 ? "success" as const : "secondary" as const,
  };
}

const columns: ColumnDef<PostRecord>[] = [
  {
    accessorKey: "name",
    header: "岗位",
    cell: ({ row }) => {
      const codeLabel = postCodeLabel(row.original.code);

      return (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {row.original.code || "未设置编码"}
            {codeLabel ? ` · ${codeLabel}` : ""}
          </div>
          {row.original.description ? (
            <div className="mt-1 max-w-[360px] truncate text-xs text-muted-foreground">
              {row.original.description}
            </div>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: "salary_type",
    header: "薪资类型",
    cell: ({ row }) => salaryTypeLabel(row.original.salary_type) || "-",
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    accessorKey: "base_salary",
    header: "基础薪资",
    cell: ({ row }) => formatMoney(row.original.base_salary),
    meta: {
      headerClassName: "text-right",
      cellClassName: "whitespace-nowrap text-right tabular-nums",
    },
  },
  {
    accessorKey: "sort",
    header: "排序",
    cell: ({ row }) => row.original.sort ?? 0,
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const meta = statusMeta(row.original.status);
      return <Badge variant={meta.variant}>{meta.label}</Badge>;
    },
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
    cell: ({ row }) => <PostRowActions post={row.original} />,
    meta: {
      headerClassName: "text-right",
      cellClassName: "whitespace-nowrap text-right",
    },
  },
];

export function PostsTable({
  posts,
}: {
  posts: PostRecord[];
}) {
  return (
    <DataTable
      columns={columns}
      data={posts}
      emptyText="没有符合条件的岗位"
      minWidth="min-w-[1120px]"
    />
  );
}
