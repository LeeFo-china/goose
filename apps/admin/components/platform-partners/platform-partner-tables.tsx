"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { MarkSettlementPaidButton } from "@/components/platform-partners/platform-partner-actions";
import { CreateInviteCodeButton } from "@/components/platform-partners/platform-partner-invite-actions";
import { UpdatePartnerMemberStatusButton } from "@/components/platform-partners/platform-partner-member-actions";
import {
  commissionStatusOptions,
  optionLabel,
  partnerMemberRoleOptions,
  partnerMemberStatusOptions,
  partnerStatusOptions,
  revenueStatusOptions,
  revenueTypeOptions,
  settlementStatusOptions,
  type PartnerCommissionLedgerRecord,
  type PartnerSettlementBatchRecord,
  type PlatformPartnerMemberRecord,
  type PlatformPartnerRecord,
  type PlatformRevenueEventRecord,
  type TenantPartnerBindingRecord,
} from "@/components/platform-partners/platform-partner-types";

const partnerColumns: ColumnDef<PlatformPartnerRecord>[] = [
  {
    accessorKey: "name",
    header: "合伙人",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{row.original.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {row.original.contact_name} / {row.original.phone}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => (
      <StatusBadge
        value={optionLabel(partnerStatusOptions, row.original.status)}
        tone={row.original.status}
      />
    ),
  },
  {
    id: "level",
    header: "等级",
    cell: ({ row }) => row.original.level?.name ?? "-",
  },
  {
    id: "region",
    header: "区域",
    cell: ({ row }) => row.original.region_codes.join(" / ") || "未限定",
  },
  {
    id: "commission",
    header: "分佣比例",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        充值 {formatBps(row.original.level?.tenant_recharge_commission_bps)}
        {" / "}
        线索 {formatBps(row.original.level?.lead_service_fee_commission_bps)}
      </span>
    ),
    meta: { cellClassName: "min-w-[180px]" },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row }) => (
      <div className="flex justify-end">
        <CreateInviteCodeButton partner={row.original} />
      </div>
    ),
    meta: { headerClassName: "text-right", cellClassName: "text-right" },
  },
];

const bindingColumns: ColumnDef<TenantPartnerBindingRecord>[] = [
  {
    id: "tenant",
    header: "装企",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{row.original.tenant?.name ?? row.original.tenant_id}</div>
        <div className="truncate text-xs text-muted-foreground">{row.original.tenant?.slug ?? row.original.tenant_id}</div>
      </div>
    ),
  },
  {
    id: "partner",
    header: "合伙人",
    cell: ({ row }) => row.original.partner?.name ?? row.original.partner_id,
  },
  {
    accessorKey: "source_type",
    header: "来源",
    cell: ({ row }) => sourceTypeLabel(row.original.source_type),
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => <StatusBadge value={bindingStatusLabel(row.original.status)} tone={row.original.status} />,
  },
  {
    accessorKey: "bound_at",
    header: "绑定时间",
    cell: ({ row }) => formatDate(row.original.bound_at),
    meta: { cellClassName: "whitespace-nowrap text-muted-foreground" },
  },
];

const memberColumns: ColumnDef<PlatformPartnerMemberRecord>[] = [
  {
    id: "partner",
    header: "合伙人",
    cell: ({ row }) => row.original.partner?.name ?? row.original.partner_id,
  },
  {
    accessorKey: "name",
    header: "姓名",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "phone",
    header: "手机号",
    cell: ({ row }) => row.original.phone,
    meta: { cellClassName: "whitespace-nowrap" },
  },
  {
    accessorKey: "role",
    header: "角色",
    cell: ({ row }) => optionLabel(partnerMemberRoleOptions, row.original.role),
  },
  {
    accessorKey: "status",
    header: "绑定状态",
    cell: ({ row }) => (
      <StatusBadge
        value={optionLabel(partnerMemberStatusOptions, row.original.status)}
        tone={row.original.status}
      />
    ),
  },
  {
    accessorKey: "auth_user_id",
    header: "微信绑定",
    cell: ({ row }) => row.original.auth_user_id ? "已绑定" : "未绑定",
  },
  {
    accessorKey: "created_at",
    header: "创建时间",
    cell: ({ row }) => formatDate(row.original.created_at),
    meta: { cellClassName: "whitespace-nowrap text-muted-foreground" },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row }) => (
      <div className="flex justify-end">
        <UpdatePartnerMemberStatusButton member={row.original} />
      </div>
    ),
    meta: { headerClassName: "text-right", cellClassName: "text-right" },
  },
];

const revenueColumns: ColumnDef<PlatformRevenueEventRecord>[] = [
  {
    id: "tenant",
    header: "收入来源",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{optionLabel(revenueTypeOptions, row.original.revenue_type)}</div>
        <div className="truncate text-xs text-muted-foreground">{row.original.tenant?.name ?? row.original.tenant_id}</div>
      </div>
    ),
  },
  {
    id: "partner",
    header: "合伙人",
    cell: ({ row }) => row.original.partner?.name ?? row.original.partner_id ?? "-",
  },
  {
    id: "amount",
    header: "平台收入",
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{formatFen(row.original.revenue_amount_fen)}</div>
        <div className="text-xs text-muted-foreground">实收 {formatFen(row.original.paid_amount_fen)}</div>
      </div>
    ),
    meta: { cellClassName: "whitespace-nowrap" },
  },
  {
    id: "rate",
    header: "规则",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        服务费 {formatBps(row.original.service_fee_rate_bps)}
        {" / "}
        分佣 {formatBps(row.original.commission_rate_bps)}
      </span>
    ),
    meta: { cellClassName: "min-w-[180px]" },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => <StatusBadge value={optionLabel(revenueStatusOptions, row.original.status)} tone={row.original.status} />,
  },
  {
    accessorKey: "created_at",
    header: "记录时间",
    cell: ({ row }) => formatDate(row.original.created_at),
    meta: { cellClassName: "whitespace-nowrap text-muted-foreground" },
  },
];

const commissionColumns: ColumnDef<PartnerCommissionLedgerRecord>[] = [
  {
    id: "partner",
    header: "合伙人",
    cell: ({ row }) => row.original.partner?.name ?? row.original.partner_id,
  },
  {
    accessorKey: "revenue_type",
    header: "收入类型",
    cell: ({ row }) => optionLabel(revenueTypeOptions, row.original.revenue_type),
  },
  {
    id: "amount",
    header: "分佣金额",
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{formatFen(row.original.commission_amount_fen)}</div>
        <div className="text-xs text-muted-foreground">
          基数 {formatFen(row.original.base_amount_fen)}
        </div>
      </div>
    ),
    meta: { cellClassName: "whitespace-nowrap" },
  },
  {
    accessorKey: "commission_rate_bps",
    header: "比例",
    cell: ({ row }) => formatBps(row.original.commission_rate_bps),
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => <StatusBadge value={optionLabel(commissionStatusOptions, row.original.status)} tone={row.original.status} />,
  },
  {
    accessorKey: "available_at",
    header: "可结算时间",
    cell: ({ row }) => formatDate(row.original.available_at),
    meta: { cellClassName: "whitespace-nowrap text-muted-foreground" },
  },
];

const settlementColumns: ColumnDef<PartnerSettlementBatchRecord>[] = [
  {
    accessorKey: "batch_no",
    header: "批次",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{row.original.batch_no}</div>
        <div className="truncate text-xs text-muted-foreground">{row.original.partner?.name ?? row.original.partner_id}</div>
      </div>
    ),
  },
  {
    id: "period",
    header: "周期",
    cell: ({ row }) => `${row.original.period_start} 至 ${row.original.period_end}`,
    meta: { cellClassName: "whitespace-nowrap" },
  },
  {
    accessorKey: "total_amount_fen",
    header: "应打款",
    cell: ({ row }) => <span className="font-medium">{formatFen(row.original.total_amount_fen)}</span>,
    meta: { cellClassName: "whitespace-nowrap" },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => <StatusBadge value={optionLabel(settlementStatusOptions, row.original.status)} tone={row.original.status} />,
  },
  {
    accessorKey: "paid_at",
    header: "打款时间",
    cell: ({ row }) => formatDate(row.original.paid_at),
    meta: { cellClassName: "whitespace-nowrap text-muted-foreground" },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row }) => (
      <div className="flex justify-end">
        <MarkSettlementPaidButton batch={row.original} />
      </div>
    ),
    meta: { headerClassName: "text-right", cellClassName: "text-right" },
  },
];

export function PlatformPartnersTable({ list }: { list: PlatformPartnerRecord[] }) {
  return <PartnerDataTable columns={partnerColumns} data={list} emptyText="还没有城市合伙人" minWidth="min-w-[1080px]" />;
}

export function TenantPartnerBindingsTable({ list }: { list: TenantPartnerBindingRecord[] }) {
  return <PartnerDataTable columns={bindingColumns} data={list} emptyText="还没有装企绑定记录" minWidth="min-w-[980px]" />;
}

export function PlatformPartnerMembersTable({ list }: { list: PlatformPartnerMemberRecord[] }) {
  return <PartnerDataTable columns={memberColumns} data={list} emptyText="还没有登录成员" minWidth="min-w-[1080px]" />;
}

export function PlatformRevenueEventsTable({ list }: { list: PlatformRevenueEventRecord[] }) {
  return <PartnerDataTable columns={revenueColumns} data={list} emptyText="还没有平台收入事件" minWidth="min-w-[1120px]" />;
}

export function PartnerCommissionLedgersTable({ list }: { list: PartnerCommissionLedgerRecord[] }) {
  return <PartnerDataTable columns={commissionColumns} data={list} emptyText="还没有分佣台账" minWidth="min-w-[980px]" />;
}

export function PartnerSettlementBatchesTable({ list }: { list: PartnerSettlementBatchRecord[] }) {
  return <PartnerDataTable columns={settlementColumns} data={list} emptyText="还没有月结批次" minWidth="min-w-[1040px]" />;
}

function PartnerDataTable<TData>({
  columns,
  data,
  emptyText,
  minWidth,
}: {
  columns: ColumnDef<TData>[];
  data: TData[];
  emptyText: string;
  minWidth: string;
}) {
  return (
    <DataTable
      columns={columns}
      data={data}
      emptyText={emptyText}
      minWidth={minWidth}
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}

function StatusBadge({ value, tone }: { value: string; tone: string }) {
  const variant = tone === "active" || tone === "confirmed" || tone === "available" || tone === "paid"
    ? "success"
    : tone === "pending" || tone === "pending_bind" || tone === "reviewing" || tone === "settling"
      ? "warning"
      : tone === "suspended" || tone === "disabled" || tone === "blocked" || tone === "failed"
        ? "danger"
        : "outline";
  return <Badge variant={variant}>{value}</Badge>;
}

function formatFen(value: number | null | undefined) {
  return `¥${((value ?? 0) / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatBps(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${(value / 100).toFixed(2)}%`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function sourceTypeLabel(value: string) {
  if (value === "invite_code") return "邀请码";
  if (value === "manual") return "手工绑定";
  if (value === "lead_source") return "线索来源";
  return value;
}

function bindingStatusLabel(value: string) {
  if (value === "active") return "有效";
  if (value === "pending_transfer") return "转移中";
  if (value === "ended") return "已结束";
  return value;
}
