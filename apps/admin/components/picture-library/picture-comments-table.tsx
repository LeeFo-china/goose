"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import {
  DeletePictureCommentButton,
  HidePictureCommentButton,
} from "@/components/picture-library/picture-comment-actions";
import type { PictureCommentRecord } from "@/components/picture-library/picture-library-types";
import {
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
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.images.length > 0
            ? `${row.original.images.length} 张（图片访问已停用）`
            : "无"}
        </span>
      ),
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
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        评论交流已停用。下方保留历史记录及原始状态，仅供治理，不代表当前对用户公开。
      </p>
      <DataTable
        columns={createColumns()}
        data={comments}
        emptyText="还没有图片评论"
        minWidth="min-w-[1080px]"
        tableClassName="border-t-0"
        rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
      />
    </>
  );
}
