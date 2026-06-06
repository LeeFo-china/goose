"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import {
  DisablePictureCategoryButton,
  EditPictureCategoryButton,
} from "@/components/picture-library/picture-category-actions";
import type {
  PictureAssetRecord,
  PictureCategoryRecord,
} from "@/components/picture-library/picture-library-types";
import {
  formatPictureDate,
  getCategoryStatusMeta,
} from "@/components/picture-library/picture-library-utils";

function createColumns(assets: PictureAssetRecord[]): ColumnDef<PictureCategoryRecord>[] {
  return [
    {
      accessorKey: "name",
      header: "分类",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.slug}</div>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => {
        const meta = getCategoryStatusMeta(row.original.status);
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "asset_count",
      header: "图片数",
      cell: ({ row }) => row.original.asset_count ?? 0,
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "sort_order",
      header: "排序",
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "updated_at",
      header: "更新时间",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatPictureDate(row.original.updated_at)}</span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <EditPictureCategoryButton category={row.original} assets={assets} />
          <DisablePictureCategoryButton category={row.original} />
        </div>
      ),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right",
      },
    },
  ];
}

export function PictureCategoryTable({
  categories,
  assets,
}: {
  categories: PictureCategoryRecord[];
  assets: PictureAssetRecord[];
}) {
  return (
    <DataTable
      columns={createColumns(assets)}
      data={categories}
      emptyText="还没有图片分类"
      minWidth="min-w-[860px]"
    />
  );
}
