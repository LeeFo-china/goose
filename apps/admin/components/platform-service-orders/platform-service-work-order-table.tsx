"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";

import {
  formatDateTime,
  formatFen,
  getOrderProductCode,
  getOrderTenantName,
  getServiceStatusMeta,
} from "./platform-service-order-rules";
import { PlatformServiceWorkOrderActions } from "./platform-service-work-order-actions";
import type { PlatformServiceWorkOrderListItem } from "./platform-service-order-types";

export function PlatformServiceWorkOrderTable({
  workOrders,
  canManage,
}: {
  workOrders: PlatformServiceWorkOrderListItem[];
  canManage: boolean;
}) {
  const columns: ColumnDef<PlatformServiceWorkOrderListItem>[] = [
    {
      accessorKey: "order_no",
      header: "订单号",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{row.original.order_no}</div>
          <div className="truncate text-xs text-muted-foreground">
            工单 {row.original.id}
          </div>
        </div>
      ),
      meta: { cellClassName: "min-w-[240px]" },
    },
    {
      id: "tenant",
      header: "租户",
      cell: ({ row }) => getOrderTenantName(row.original),
      meta: { cellClassName: "min-w-[180px]" },
    },
    {
      id: "product",
      header: "套餐",
      cell: ({ row }) => (
        <div>
          <div>{getOrderProductCode(row.original)}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.order?.term_years ?? "-"} 年
          </div>
        </div>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "amount",
      header: "金额",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatFen(row.original.order?.amount_fen)}</span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "status",
      header: "工单状态",
      cell: ({ row }) => {
        const meta = getServiceStatusMeta(row.original.status);
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "assignee_employee_id",
      header: "负责人",
      cell: ({ row }) => row.original.assignee_employee_id || "未分配",
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "acceptance_preparation",
      header: "客户验收",
      cell: ({ row }) => {
        const acceptance = row.original.acceptance_preparation;
        if (!acceptance) {
          return <span className="text-muted-foreground">未提交</span>;
        }
        const meta = getAcceptancePreparationStatusMeta(acceptance);
        return (
          <div className="space-y-1">
            <Badge variant={meta.variant}>{meta.label}</Badge>
            <div className="text-xs text-muted-foreground">
              {meta.timePrefix} {formatDateTime(acceptance.acceptance_due_at)}
            </div>
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
        <PlatformServiceWorkOrderActions
          workOrder={row.original}
          canManage={canManage}
        />
      ),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right",
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={workOrders}
      emptyText="当前筛选条件下没有实施工单"
      minWidth="min-w-[1400px]"
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}

function getAcceptancePreparationStatusMeta(
  acceptance: NonNullable<PlatformServiceWorkOrderListItem["acceptance_preparation"]>,
): {
  label: string;
  variant: "secondary" | "success" | "warning" | "danger";
  timePrefix: string;
} {
  switch (acceptance.status) {
    case "accepted":
      return {
        label: "已验收",
        variant: "success",
        timePrefix: "截止",
      };
    case "rejected":
      return {
        label: "已退回整改",
        variant: "danger",
        timePrefix: "截止",
      };
    case "cancelled":
      return {
        label: "已取消",
        variant: "secondary",
        timePrefix: "截止",
      };
    case "submitted":
      return acceptance.acceptance_overdue
        ? {
          label: "已逾期",
          variant: "danger",
          timePrefix: "截止",
        }
        : {
          label: "确认中",
          variant: "warning",
          timePrefix: "截止",
        };
    default:
      return {
        label: "草稿",
        variant: "secondary",
        timePrefix: "截止",
      };
  }
}
