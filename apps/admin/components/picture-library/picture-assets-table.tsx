"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import {
  DeletePictureAssetButton,
  EditPictureAssetButton,
  PictureAssetStatusButton,
} from "@/components/picture-library/picture-asset-actions";
import type {
  PictureAssetRecord,
  PictureCategoryRecord,
} from "@/components/picture-library/picture-library-types";
import {
  formatPictureDate,
  getAssetPreviewUrl,
  getAssetStatusMeta,
} from "@/components/picture-library/picture-library-utils";

function dimensionsText(asset: PictureAssetRecord) {
  return asset.width && asset.height ? `${asset.width} x ${asset.height}` : "未知尺寸";
}

function createColumns(categories: PictureCategoryRecord[]): ColumnDef<PictureAssetRecord>[] {
  return [
    {
      accessorKey: "title",
      header: "图片",
      cell: ({ row }) => {
        const asset = row.original;
        const previewUrl = getAssetPreviewUrl(asset);
        return (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
              {previewUrl ? (
                <img src={previewUrl} alt={asset.title} className="size-full object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground">无图</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium">{asset.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {asset.original_filename || asset.source} · {dimensionsText(asset)}
              </div>
            </div>
          </div>
        );
      },
      meta: { cellClassName: "min-w-[280px]" },
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => {
        const meta = getAssetStatusMeta(row.original.status);
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "categories",
      header: "分类",
      cell: ({ row }) => (
        <div className="flex max-w-56 flex-wrap gap-1">
          {row.original.categories.length > 0
            ? row.original.categories.map((category) => (
              <Badge key={category.id} variant="outline">{category.name}</Badge>
            ))
            : <span className="text-sm text-muted-foreground">未分类</span>}
        </div>
      ),
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
          <EditPictureAssetButton asset={row.original} categories={categories} />
          <PictureAssetStatusButton asset={row.original} action="publish" />
          <PictureAssetStatusButton asset={row.original} action="hide" />
          <DeletePictureAssetButton asset={row.original} />
        </div>
      ),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right",
      },
    },
  ];
}

export function PictureAssetsTable({
  assets,
  categories,
}: {
  assets: PictureAssetRecord[];
  categories: PictureCategoryRecord[];
}) {
  return (
    <DataTable
      columns={createColumns(categories)}
      data={assets}
      emptyText="还没有上传图片"
      minWidth="min-w-[1180px]"
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}
