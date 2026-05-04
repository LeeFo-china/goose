"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { DataTable } from "@/components/admin/data-table";
import { h5PageStatusOptions } from "@/components/marketing/marketing-constants";
import { H5PageRowActions } from "@/components/marketing/h5-page-mutations";
import type { H5MarketingPageRecord } from "@/components/marketing/marketing-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const statusLabel = Object.fromEntries(h5PageStatusOptions);

const statusVariant: Record<string, "success" | "warning" | "secondary" | "outline" | "default"> = {
  draft: "outline",
  published: "success",
  offline: "warning",
  archived: "secondary",
};

function getH5BaseUrl() {
  return (process.env.NEXT_PUBLIC_GOOES_H5_BASE_URL || "https://h5.goodcms.cn").replace(/\/+$/, "");
}

function buildPageUrl(slug: string) {
  return `${getH5BaseUrl()}/p/${slug}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const columns: ColumnDef<H5MarketingPageRecord>[] = [
  {
    accessorKey: "title",
    header: "页面",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">
          {row.original.title || "未命名 H5 页面"}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          /p/{row.original.slug}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.status] || "outline"}>
        {statusLabel[row.original.status] || row.original.status}
      </Badge>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "public_url",
    header: "访问地址",
    cell: ({ row }) => {
      const url = buildPageUrl(row.original.slug);
      return (
        <Button
          type="button"
          variant="link"
          className="h-auto max-w-[260px] justify-start truncate p-0 text-muted-foreground"
          onClick={() => window.open(url, "_blank")}
        >
          <ExternalLink data-icon="inline-start" />
          <span className="truncate">{url}</span>
        </Button>
      );
    },
  },
  {
    accessorKey: "published_at",
    header: "发布时间",
    cell: ({ row }) => formatDateTime(row.original.published_at),
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    accessorKey: "updated_at",
    header: "更新时间",
    cell: ({ row }) => formatDateTime(row.original.updated_at),
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row }) => <H5PageRowActions page={row.original} />,
    meta: {
      headerClassName: "text-right",
      cellClassName: "relative min-w-[430px] whitespace-nowrap text-right",
    },
  },
];

export function H5MarketingPagesTable({
  pages,
}: {
  pages: H5MarketingPageRecord[];
}) {
  return (
    <DataTable
      columns={columns}
      data={pages}
      emptyText="还没有 H5 活动页"
      minWidth="min-w-[1120px]"
    />
  );
}
