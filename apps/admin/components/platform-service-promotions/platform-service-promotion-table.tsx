"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlatformServicePromotionDetail } from "./platform-service-promotion-detail";
import { formatPromotionDateTime, getPromotionPhaseMeta } from "./platform-service-promotion-rules";
import type { PlatformServicePromotionListItem } from "./platform-service-promotion-types";

export function PlatformServicePromotionTable({ promotions, canManage, serverTime }: {
  promotions: PlatformServicePromotionListItem[];
  canManage: boolean;
  serverTime: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = promotions.find((item) => item.id === selectedId);
  const columns: ColumnDef<PlatformServicePromotionListItem>[] = [
    {
      id: "activity", header: "活动",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="max-w-72 truncate font-semibold">{(row.original.draft ?? row.original.published)?.name ?? row.original.code}</div>
          <div className="max-w-72 truncate text-xs text-muted-foreground">{(row.original.draft ?? row.original.published)?.badge_text}</div>
        </div>
      ),
      meta: { cellClassName: "min-w-[220px]" },
    },
    {
      id: "discount", header: "折扣",
      cell: ({ row }) => {
        const version = row.original.draft ?? row.original.published;
        return <span className="tabular-nums">{version ? `${version.discount_rate_basis_points / 1000} 折` : "未设置"}</span>;
      },
    },
    {
      id: "schedule", header: "活动时间",
      cell: ({ row }) => {
        const version = row.original.draft ?? row.original.published;
        return <div className="whitespace-nowrap text-xs tabular-nums"><div>{formatPromotionDateTime(version?.starts_at)}</div><div className="text-muted-foreground">至 {formatPromotionDateTime(version?.ends_at)}</div></div>;
      },
    },
    {
      accessorKey: "phase", header: "状态",
      cell: ({ row }) => {
        const phase = getPromotionPhaseMeta(row.original.phase);
        return <Badge variant={phase.variant}>{phase.label}</Badge>;
      },
    },
    {
      accessorKey: "version", header: "版本",
      cell: ({ row }) => <span className="tabular-nums">v{row.original.version}</span>,
    },
    {
      accessorKey: "updated_at", header: "更新时间",
      cell: ({ row }) => <span className="whitespace-nowrap tabular-nums text-muted-foreground">{formatPromotionDateTime(row.original.updated_at)}</span>,
    },
    {
      id: "actions", header: "操作",
      cell: ({ row }) => <Button type="button" size="sm" variant="outline" onClick={() => setSelectedId(row.original.id)}><Eye data-icon="inline-start" />查看配置</Button>,
      meta: { headerClassName: "text-right", cellClassName: "whitespace-nowrap text-right" },
    },
  ];
  return (
    <>
      <DataTable columns={columns} data={promotions} emptyText="暂无限时活动，可新建活动草稿。" minWidth="min-w-[1060px]" tableClassName="border-t-0" rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME} />
      {selected ? <PlatformServicePromotionDetail key={selected.id} promotion={selected} serverTime={serverTime} canManage={canManage} open onOpenChange={(open) => { if (!open) setSelectedId(null); }} /> : null}
    </>
  );
}
