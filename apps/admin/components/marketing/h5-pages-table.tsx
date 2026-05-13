"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { DataTable } from "@/components/admin/data-table";
import { h5PageDisplaySceneOptions, h5PageStatusOptions } from "@/components/marketing/marketing-constants";
import { H5PageOrderControls, H5PageRowActions } from "@/components/marketing/h5-page-mutations";
import type { H5MarketingPageRecord } from "@/components/marketing/marketing-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const statusLabel = Object.fromEntries(h5PageStatusOptions);
const sceneLabel = Object.fromEntries(h5PageDisplaySceneOptions);

const statusVariant: Record<string, "success" | "warning" | "secondary" | "outline" | "default"> = {
  draft: "outline",
  published: "success",
  offline: "warning",
  archived: "secondary",
};

function getH5BaseUrl() {
  return (process.env.NEXT_PUBLIC_GOOES_H5_BASE_URL || "https://h5.goodcms.cn").replace(/\/+$/, "");
}

function buildPageUrl(slug: string, tenantSlug?: string | null) {
  const encodedSlug = encodeURIComponent(slug);
  return tenantSlug
    ? `${getH5BaseUrl()}/t/${encodeURIComponent(tenantSlug)}/p/${encodedSlug}`
    : `${getH5BaseUrl()}/p/${encodedSlug}`;
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

function isActivePublishedPage(page: H5MarketingPageRecord, now = Date.now()) {
  if (page.status !== "published") return false;
  const startAt = page.start_at ? new Date(page.start_at).getTime() : null;
  const endAt = page.end_at ? new Date(page.end_at).getTime() : null;

  if (startAt != null && !Number.isNaN(startAt) && startAt > now) return false;
  if (endAt != null && !Number.isNaN(endAt) && endAt < now) return false;

  return true;
}

type H5MarketingPagesTableProps = {
  pages: H5MarketingPageRecord[];
  apiBasePath?: string;
  editBasePath?: string;
  returnTo?: string;
  tenantSlug?: string | null;
  stickyActionColumn?: boolean;
};

function createColumns({
  pages,
  apiBasePath,
  editBasePath,
  returnTo,
  tenantSlug,
  stickyActionColumn,
}: H5MarketingPagesTableProps): ColumnDef<H5MarketingPageRecord>[] {
  const activePages = pages
    .filter((page) => isActivePublishedPage(page))
    .sort((a, b) => {
      const sortDiff = (a.sort_order ?? 100) - (b.sort_order ?? 100);
      if (sortDiff !== 0) return sortDiff;
      return new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime();
    });
  const activeOrderMap = new Map(activePages.map((page, index) => [page.id, index + 1]));

  return [
    {
      accessorKey: "title",
      header: "页面",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">
            {row.original.title || "未命名 H5 页面"}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {tenantSlug ? `/t/${tenantSlug}/p/${row.original.slug}` : `/p/${row.original.slug}`}
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
        const url = buildPageUrl(row.original.slug, tenantSlug);
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
      accessorKey: "display_scene",
      header: "小程序展示",
      cell: ({ row }) => {
        const position = activeOrderMap.get(row.original.id) ?? null;
        return (
          <div className="flex min-w-[160px] flex-col gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-sm">{sceneLabel[row.original.display_scene] || row.original.display_scene}</span>
              <span className="text-xs text-muted-foreground">
                {position ? `展示第 ${position} / ${activePages.length} 位` : "未参与当前排序"}
              </span>
            </div>
            {position ? (
              <H5PageOrderControls
                page={row.original}
                apiBasePath={apiBasePath}
                position={position}
                total={activePages.length}
              />
            ) : null}
          </div>
        );
      },
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "active_window",
      header: "展示时间",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>开始 {formatDateTime(row.original.start_at)}</span>
          <span>结束 {formatDateTime(row.original.end_at)}</span>
        </div>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
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
      cell: ({ row }) => (
        <H5PageRowActions
          page={row.original}
          pages={pages}
          apiBasePath={apiBasePath}
          editBasePath={editBasePath}
          returnTo={returnTo}
          tenantSlug={tenantSlug}
        />
      ),
      meta: {
        headerClassName: stickyActionColumn
          ? "sticky right-0 bg-muted text-right shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]"
          : "text-right",
        cellClassName: stickyActionColumn
          ? "sticky right-0 min-w-[96px] whitespace-nowrap bg-background text-right shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]"
          : "relative min-w-[96px] whitespace-nowrap text-right",
      },
    },
  ];
}

export function H5MarketingPagesTable({
  pages,
  apiBasePath,
  editBasePath,
  returnTo,
  tenantSlug,
  stickyActionColumn,
}: H5MarketingPagesTableProps) {
  const columns = createColumns({
    pages,
    apiBasePath,
    editBasePath,
    returnTo,
    tenantSlug,
    stickyActionColumn,
  });

  return (
    <DataTable
      columns={columns}
      data={pages}
      emptyText="还没有 H5 活动页"
      minWidth="min-w-[960px]"
    />
  );
}
