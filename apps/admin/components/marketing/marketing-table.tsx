"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { CalendarClock } from "lucide-react";
import { DataTable } from "@/components/admin/data-table";
import {
  campaignStatusOptions,
  campaignTypeOptions,
  targetScopeOptions,
} from "@/components/marketing/marketing-constants";
import { MarketingRowActions } from "@/components/marketing/marketing-mutations";
import type {
  MarketingCampaignRecord,
  MarketingProjectOption,
} from "@/components/marketing/marketing-types";
import { Badge } from "@/components/ui/badge";

const typeLabel = Object.fromEntries(campaignTypeOptions);
const scopeLabel = Object.fromEntries(targetScopeOptions);

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline" | "danger" | "default";
}> = Object.fromEntries(
  campaignStatusOptions.map(([value, label]) => [
    value,
    {
      label,
      variant: value === "active"
        ? "success"
        : value === "paused"
          ? "warning"
          : value === "closed"
            ? "secondary"
            : "outline",
    },
  ]),
);

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderPeriod(campaign: MarketingCampaignRecord) {
  if (!campaign.valid_from && !campaign.valid_until) {
    return <span className="text-muted-foreground">长期有效</span>;
  }

  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center gap-1">
        <CalendarClock className="size-3.5 text-muted-foreground" />
        <span>{formatDateTime(campaign.valid_from)}</span>
      </div>
      <div className="pl-5 text-muted-foreground">
        至 {formatDateTime(campaign.valid_until)}
      </div>
    </div>
  );
}

const columns: ColumnDef<MarketingCampaignRecord>[] = [
  {
    accessorKey: "name",
    header: "活动",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">
          {row.original.name || "未命名营销活动"}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {row.original.id}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "campaign_type",
    header: "类型",
    cell: ({ row }) => (
      <Badge variant="outline">
        {typeLabel[row.original.campaign_type] || row.original.campaign_type}
      </Badge>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const meta = statusMeta[row.original.status] || {
        label: row.original.status,
        variant: "outline" as const,
      };
      return (
        <div className="flex flex-wrap gap-1">
          <Badge variant={meta.variant}>{meta.label}</Badge>
          <Badge variant={row.original.enabled ? "success" : "secondary"}>
            {row.original.enabled ? "已启用" : "未启用"}
          </Badge>
        </div>
      );
    },
  },
  {
    accessorKey: "target_scope_type",
    header: "项目范围",
    cell: ({ row }) => scopeLabel[row.original.target_scope_type] || row.original.target_scope_type,
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    id: "period",
    header: "有效期",
    cell: ({ row }) => renderPeriod(row.original),
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row, table }) => {
      const meta = table.options.meta as {
        projects: MarketingProjectOption[];
      };
      return (
        <MarketingRowActions
          campaign={row.original}
          projects={meta.projects}
        />
      );
    },
    meta: {
      headerClassName: "text-right",
      cellClassName: "relative min-w-[360px] whitespace-nowrap text-right",
    },
  },
];

export function MarketingCampaignsTable({
  campaigns,
  projects,
}: {
  campaigns: MarketingCampaignRecord[];
  projects: MarketingProjectOption[];
}) {
  return (
    <DataTable
      columns={columns}
      data={campaigns}
      emptyText="还没有符合条件的营销活动"
      minWidth="min-w-[1120px]"
      tableMeta={{ projects }}
    />
  );
}
