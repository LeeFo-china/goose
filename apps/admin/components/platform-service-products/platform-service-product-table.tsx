"use client";

import { useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { PlatformServiceProductDetail } from "./platform-service-product-detail";
import {
  formatDateTime,
  formatDiscount,
  formatFen,
  getProductStatusMeta,
} from "./platform-service-product-rules";
import type { PlatformServiceProductListItem } from "./platform-service-product-types";

export function PlatformServiceProductTable({
  products,
  canManage,
}: {
  products: PlatformServiceProductListItem[];
  canManage: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = products.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selected, selectedId]);

  const columns: ColumnDef<PlatformServiceProductListItem>[] = [
    {
      accessorKey: "draft.title",
      header: "套餐",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{row.original.draft.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.code}
          </div>
        </div>
      ),
      meta: { cellClassName: "min-w-[280px]" },
    },
    {
      accessorKey: "draft.term_years",
      header: "服务年限",
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.draft.term_years} 年</span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "draft.list_amount_fen",
      header: "标价",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatFen(row.original.draft.list_amount_fen)}</span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "draft.amount_fen",
      header: "实付价",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatFen(row.original.draft.amount_fen)}</span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "draft.price_rate_basis_points",
      header: "折扣",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatDiscount(row.original.draft.price_rate_basis_points)}
        </span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "status",
      header: "发布状态",
      cell: ({ row }) => {
        const status = getProductStatusMeta(row.original.status);
        return (
          <div className="flex flex-wrap gap-2">
            <Badge variant={status.variant}>{status.label}</Badge>
            {row.original.has_unpublished_changes ? (
              <Badge variant="warning">未发布修改</Badge>
            ) : (
              <Badge variant="outline">已同步</Badge>
            )}
          </div>
        );
      },
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "updated_at",
      header: "更新时间",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {formatDateTime(row.original.updated_at)}
        </span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSelectedId(row.original.id)}
          >
            <Eye data-icon="inline-start" />
            查看配置
          </Button>
        </div>
      ),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right",
      },
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={products}
        emptyText="当前没有平台技术服务套餐"
        minWidth="min-w-[1080px]"
        tableClassName="border-t-0"
        rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
      />
      {selected ? (
        <PlatformServiceProductDetail
          product={selected}
          open
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
          canManage={canManage}
        />
      ) : null}
    </>
  );
}
