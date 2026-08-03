"use client";

import { useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { PlatformVirtualProductDetail } from "./platform-virtual-product-detail";
import {
  formatFen,
  formatVirtualProductDate,
  getProductTypeLabel,
  productStatusMeta,
} from "./platform-virtual-product-rules";
import type { PlatformVirtualProductListItem } from "./platform-virtual-product-types";

export function PlatformVirtualProductTable({
  products,
  canManage,
  canPublish,
}: {
  products: PlatformVirtualProductListItem[];
  canManage: boolean;
  canPublish: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = products.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selected, selectedId]);

  const columns: ColumnDef<PlatformVirtualProductListItem>[] = [
    {
      accessorKey: "name",
      header: "虚拟商品",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{row.original.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.code}
          </div>
        </div>
      ),
      meta: { cellClassName: "min-w-[260px]" },
    },
    {
      accessorKey: "product_type",
      header: "类型",
      cell: ({ row }) => getProductTypeLabel(row.original.product_type),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "amount_fen",
      header: "售价",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatFen(row.original.amount_fen)}</span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => {
        const meta = productStatusMeta[row.original.status];
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "updated_at",
      header: "更新时间",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {formatVirtualProductDate(row.original.updated_at)}
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
        emptyText="当前筛选条件下没有虚拟商品"
        minWidth="min-w-[980px]"
        tableClassName="border-t-0"
        rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
      />
      {selected ? (
        <PlatformVirtualProductDetail
          product={selected}
          open
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
          canManage={canManage}
          canPublish={canPublish}
        />
      ) : null}
    </>
  );
}
