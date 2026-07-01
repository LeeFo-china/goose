"use client";

import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { DataTable } from "@/components/admin/data-table";
import {
  formatWechatPayApplymentTime,
  getWechatPayApplymentStatusMeta,
} from "@/components/finance/finance-wechat-pay-applyment-requests";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WechatPayApplymentRecord } from "./platform-wechat-pay-applyment-requests";

const columns: ColumnDef<WechatPayApplymentRecord>[] = [
  {
    accessorKey: "merchant_short_name",
    header: "申请",
    cell: ({ row }) => {
      const applyment = row.original;
      return (
        <div className="min-w-0">
          <div className="truncate font-medium">{applyment.merchant_short_name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {applyment.application_no}
          </div>
        </div>
      );
    },
    meta: {
      cellClassName: "min-w-[220px]",
    },
  },
  {
    id: "tenant",
    header: "租户",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate">{row.original.tenant?.name || "-"}</div>
        <div className="truncate text-xs text-muted-foreground">
          {row.original.tenant?.slug || row.original.tenant_id}
        </div>
      </div>
    ),
    meta: {
      cellClassName: "min-w-[180px]",
    },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const meta = getWechatPayApplymentStatusMeta(row.original.status);
      return <Badge variant={meta.variant}>{meta.label}</Badge>;
    },
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "applyment_state",
    header: "微信进件",
    cell: ({ row }) => (
      <div className="text-sm">
        <div>{row.original.applyment_state || "-"}</div>
        <div className="text-xs text-muted-foreground">
          {row.original.applyment_id || row.original.applyment_business_code || "-"}
        </div>
      </div>
    ),
    meta: {
      cellClassName: "min-w-[180px]",
    },
  },
  {
    accessorKey: "sub_mchid",
    header: "子商户",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.sub_mchid || "-"}
      </span>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "submitted_at",
    header: "提交时间",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatWechatPayApplymentTime(row.original.submitted_at)}
      </span>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row }) => (
      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href={`/platform/wechat-pay/applyments/${row.original.id}`}>
            <Eye data-icon="inline-start" />
            查看
          </Link>
        </Button>
      </div>
    ),
    meta: {
      headerClassName: "text-right",
      cellClassName: "whitespace-nowrap text-right",
    },
  },
];

export function PlatformWechatPayApplymentsTable({
  rows,
}: {
  rows: WechatPayApplymentRecord[];
}) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyText="暂无微信支付进件申请"
      minWidth="min-w-[1180px]"
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}
