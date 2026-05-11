"use client";

import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/admin/data-table";
import type { PlatformTenantUsageItem } from "@/components/usage/usage-types";

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

function statusLabel(status?: string | null) {
  if (status === "active") return "正常";
  if (status === "suspended") return "停用";
  if (status === "archived") return "归档";
  return status || "未知";
}

function statusVariant(status?: string | null) {
  if (status === "active") return "success" as const;
  if (status === "suspended") return "warning" as const;
  return "outline" as const;
}

function usageLink(input: {
  tenantId: string;
  tab: "ai" | "sms";
  dateFrom: string;
  dateTo: string;
}) {
  const params = new URLSearchParams({
    tab: input.tab,
    tenant_id: input.tenantId,
    date_from: input.dateFrom,
    date_to: input.dateTo,
  });
  return `/platform/usage?${params.toString()}`;
}

export function PlatformUsageTable({
  list,
  dateFrom,
  dateTo,
}: {
  list: PlatformTenantUsageItem[];
  dateFrom: string;
  dateTo: string;
}) {
  const columns: ColumnDef<PlatformTenantUsageItem>[] = [
    {
      id: "tenant",
      header: "租户",
      cell: ({ row }) => {
        const tenant = row.original.tenant;
        return (
          <div className="min-w-0">
            <div className="truncate font-medium">{tenant.name || "未命名租户"}</div>
            <div className="truncate text-xs text-muted-foreground">{tenant.slug || tenant.id}</div>
          </div>
        );
      },
      meta: {
        cellClassName: "min-w-[220px]",
      },
    },
    {
      id: "status",
      header: "状态",
      cell: ({ row }) => (
        <Badge variant={statusVariant(row.original.tenant.status)}>
          {statusLabel(row.original.tenant.status)}
        </Badge>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "ai",
      header: "AI 用量",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium">{formatNumber(row.original.ai.total_tokens)} tokens</div>
          <div className="text-xs text-muted-foreground">
            调用 {formatNumber(row.original.ai.call_count)} / 失败 {formatNumber(row.original.ai.failure_count)}
          </div>
        </div>
      ),
      meta: {
        cellClassName: "min-w-[180px]",
      },
    },
    {
      id: "sms",
      header: "短信用量",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium">{formatNumber(row.original.sms.send_count)} 条</div>
          <div className="text-xs text-muted-foreground">
            成功 {formatNumber(row.original.sms.success_count)} / 失败 {formatNumber(row.original.sms.failure_count)}
          </div>
        </div>
      ),
      meta: {
        cellClassName: "min-w-[180px]",
      },
    },
    {
      id: "missing",
      header: "缺失",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          AI token 缺失 {formatNumber(row.original.ai.missing_token_count)}
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
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={usageLink({
              tenantId: row.original.tenant.id,
              tab: "ai",
              dateFrom,
              dateTo,
            })}
            >
              AI 明细
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={usageLink({
              tenantId: row.original.tenant.id,
              tab: "sms",
              dateFrom,
              dateTo,
            })}
            >
              短信明细
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

  return (
    <DataTable
      columns={columns}
      data={list}
      emptyText="暂无租户用量"
      minWidth="min-w-[1060px]"
    />
  );
}
