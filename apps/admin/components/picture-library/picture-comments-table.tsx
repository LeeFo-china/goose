"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import {
  DeletePictureCommentButton,
  HidePictureCommentButton,
  ShowPictureCommentButton,
} from "@/components/picture-library/picture-comment-actions";
import type { PictureCommentRecord } from "@/components/picture-library/picture-library-types";
import {
  buildStoredFilePreviewUrl,
  formatPictureDate,
  getAssetStatusMeta,
  getCommentStatusMeta,
} from "@/components/picture-library/picture-library-utils";

function createColumns(): ColumnDef<PictureCommentRecord>[] {
  return [
    {
      accessorKey: "content",
      header: "评论",
      cell: ({ row }) => {
        const comment = row.original;
        return (
          <div className="min-w-0">
            <div className="line-clamp-2 max-w-xl text-sm">{comment.content}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              visitor：{comment.visitor_id}
            </div>
          </div>
        );
      },
      meta: { cellClassName: "min-w-[320px]" },
    },
    {
      id: "asset",
      header: "图片",
      cell: ({ row }) => {
        const asset = row.original.asset;
        if (!asset) return <span className="text-sm text-muted-foreground">图片不存在</span>;
        const meta = getAssetStatusMeta(asset.status);
        return (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{asset.title}</div>
            <Badge className="mt-1" variant={meta.variant}>{meta.label}</Badge>
          </div>
        );
      },
      meta: { cellClassName: "min-w-[180px]" },
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => {
        const meta = getCommentStatusMeta(row.original.status);
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "images",
      header: "图片附件",
      cell: ({ row }) => {
        const images = row.original.images.slice(0, 3);
        if (images.length === 0) {
          return <span className="text-sm text-muted-foreground">无</span>;
        }
        return (
          <div className="flex gap-1">
            {images.map((image) => {
              const url = buildStoredFilePreviewUrl(image.file_object
                ? {
                  id: image.file_object.id,
                  asset_id: row.original.asset_id,
                  variant: "comment",
                  file_object_id: image.file_object_id,
                  object_key: image.file_object.object_key,
                  width: image.file_object.width,
                  height: image.file_object.height,
                  file_size: image.file_object.size_bytes,
                  mime_type: image.file_object.mime_type,
                  created_at: image.created_at,
                }
                : null);
              return (
                <div key={image.id} className="flex size-10 items-center justify-center overflow-hidden rounded-md border bg-muted">
                  {url ? <img src={url} alt="评论图片" className="size-full object-cover" /> : <span className="text-xs text-muted-foreground">图</span>}
                </div>
              );
            })}
          </div>
        );
      },
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "created_at",
      header: "评论时间",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatPictureDate(row.original.created_at)}</span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <HidePictureCommentButton comment={row.original} />
          <ShowPictureCommentButton comment={row.original} />
          <DeletePictureCommentButton comment={row.original} />
        </div>
      ),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right",
      },
    },
  ];
}

export function PictureCommentsTable({ comments }: { comments: PictureCommentRecord[] }) {
  return (
    <DataTable
      columns={createColumns()}
      data={comments}
      emptyText="还没有图片评论"
      minWidth="min-w-[1080px]"
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}
