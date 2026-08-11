"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { useState } from "react";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { PlatformServiceTrialDetail } from "./platform-service-trial-detail";
import {
  formatTrialDateTime,
  formatTrialPeriod,
  formatTrialRemaining,
  getTrialConversionLabel,
  getTrialSourceLabel,
  getTrialStatusMeta,
  getTrialTypeLabel,
} from "./platform-service-trial-rules";
import type { PlatformServiceTrialListItem } from "./platform-service-trial-types";

export function PlatformServiceTrialTable({
  trials,
  serverTime,
}: {
  trials: PlatformServiceTrialListItem[];
  serverTime: string;
}) {
  const [selectedTrial, setSelectedTrial] = useState<PlatformServiceTrialListItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const openDetail = (trial: PlatformServiceTrialListItem) => {
    setSelectedTrial(trial);
    setDetailOpen(true);
  };

  const columns: ColumnDef<PlatformServiceTrialListItem>[] = [
    {
      id: "tenant",
      header: "装企",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{row.original.tenant.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.contact_name || row.original.contact_phone || row.original.tenant.slug}
          </div>
        </div>
      ),
      meta: { cellClassName: "min-w-[180px]" },
    },
    {
      accessorKey: "source",
      header: "申请来源",
      cell: ({ row }) => getTrialSourceLabel(row.original.source),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "trial_type",
      header: "试用类型",
      cell: ({ row }) => <Badge variant="outline">{getTrialTypeLabel(row.original.trial_type)}</Badge>,
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "requested_at",
      header: "申请时间",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {formatTrialDateTime(row.original.requested_at || row.original.granted_at)}
        </span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "period",
      header: "试用周期",
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatTrialPeriod(row.original)}
        </span>
      ),
    },
    {
      id: "remaining",
      header: "剩余时间",
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums text-muted-foreground">
          {formatTrialRemaining(row.original, serverTime)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => {
        const meta = getTrialStatusMeta(row.original.status);
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "assignee",
      header: "跟进人",
      cell: ({ row }) => row.original.assignee?.name || "未分配",
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "conversion",
      header: "转化状态",
      cell: ({ row }) => (
        <Badge variant={row.original.converted_at ? "success" : "secondary"}>
          {getTrialConversionLabel(row.original)}
        </Badge>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation();
            openDetail(row.original);
          }}
        >
          <Eye data-icon="inline-start" />
          查看
        </Button>
      ),
      meta: { cellClassName: "whitespace-nowrap text-right" },
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={trials}
        emptyText="当前筛选条件下没有技术服务试用记录"
        minWidth="min-w-[1320px]"
        tableClassName="border-t-0"
        rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
        onRowClick={openDetail}
      />
      {selectedTrial ? (
        <PlatformServiceTrialDetail
          key={selectedTrial.id}
          trial={selectedTrial}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      ) : null}
    </>
  );
}
