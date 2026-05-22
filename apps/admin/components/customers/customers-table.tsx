"use client";

import { type ColumnDef } from "@tanstack/react-table";
import {
  CustomerOriginConfig,
  CustomerStatusConfig,
  isCustomerOrigin,
  isCustomerStatus,
} from "@gooes/domain";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CustomerRowActions,
  type CustomerRecord,
} from "@/components/customers/customer-mutations";

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline" | "danger" | "default";
}> = {
  potential: { label: CustomerStatusConfig.potential.label, variant: "outline" },
  following: { label: CustomerStatusConfig.following.label, variant: "default" },
  arrived: { label: CustomerStatusConfig.arrived.label, variant: "warning" },
  designing: { label: CustomerStatusConfig.designing.label, variant: "default" },
  dormant: { label: CustomerStatusConfig.dormant.label, variant: "secondary" },
  invalid: { label: CustomerStatusConfig.invalid.label, variant: "danger" },
};

const sourceMeta: Record<string, string> = {
  douyin: "抖音/短视频",
  referral: "老客介绍",
  walk_in: "自然进店",
  telemarketing: "电销开发",
  platform: "装修平台",
};

function originBadge(origin: string | null | undefined) {
  if (!isCustomerOrigin(origin)) {
    return <Badge variant="outline">员工登记</Badge>;
  }

  if (origin === "visitor_self_registered") {
    return <Badge variant="warning">{CustomerOriginConfig[origin].label}</Badge>;
  }

  if (origin === "employee_created") {
    return <Badge variant="outline">{CustomerOriginConfig[origin].label}</Badge>;
  }

  return <Badge variant="secondary">{CustomerOriginConfig[origin].label}</Badge>;
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function ownerName(customer: CustomerRecord) {
  const owner = relationOne(customer.owner);
  return customer.owner_name || owner?.name || owner?.phone || "-";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function followUpBadge(state: string | null | undefined) {
  if (state === "overdue") {
    return <Badge className="whitespace-nowrap" variant="danger">超期</Badge>;
  }
  if (state === "due") {
    return <Badge className="whitespace-nowrap" variant="warning">待跟进</Badge>;
  }
  if (state === "upcoming") {
    return <Badge className="whitespace-nowrap" variant="success">已计划</Badge>;
  }
  return <Badge className="whitespace-nowrap" variant="secondary">无计划</Badge>;
}

function sourceBadges(customer: CustomerRecord) {
  return [
    customer.has_old_customer_new_lead
      ? { key: "old_customer_new_lead", label: "老客户新线索", variant: "warning" as const }
      : null,
    customer.has_platform_new_lead
      ? { key: "platform_new_lead", label: "平台新线索", variant: "default" as const }
      : null,
    customer.has_employee_share
      ? { key: "employee_share", label: "员工分享", variant: "secondary" as const }
      : null,
  ].filter((item): item is { key: string; label: string; variant: "warning" | "default" | "secondary" } => Boolean(item));
}

function CustomerIdentityCell({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="min-w-0 cursor-default border-0 bg-transparent p-0 text-left text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="w-[5em] truncate font-medium">
          {name}
        </div>
        <div className="w-[5em] truncate text-xs text-muted-foreground">
          {id}
        </div>
      </TooltipTrigger>
      <TooltipContent align="start" className="max-w-[280px]">
        <div className="flex flex-col gap-1">
          <div className="break-all font-medium">{name}</div>
          <div className="break-all text-xs opacity-90">{id}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

const columns: ColumnDef<CustomerRecord>[] = [
  {
    accessorKey: "name",
    header: "客户",
    cell: ({ row }) => {
      const name = row.original.name || "未命名客户";

      return (
        <CustomerIdentityCell id={row.original.id} name={name} />
      );
    },
    meta: {
      cellClassName: "w-[5em] max-w-[5em]",
    },
  },
  {
    id: "phone",
    header: "手机号",
    cell: ({ row }) => row.original.phone || row.original.phone_masked || "-",
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "owner",
    header: "负责人",
    cell: ({ row }) => ownerName(row.original),
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    accessorKey: "source",
    header: "来源",
    cell: ({ row }) => {
      const badges = sourceBadges(row.original);

      return (
        <div className="flex min-w-[150px] flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            {sourceMeta[row.original.source || ""] || row.original.source || "-"}
          </span>
          {badges.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {badges.map((badge) => (
                <Badge key={badge.key} variant={badge.variant}>{badge.label}</Badge>
              ))}
            </div>
          ) : null}
        </div>
      );
    },
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "customer_origin",
    header: "创建渠道",
    cell: ({ row }) => originBadge(row.original.customer_origin),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const status = row.original.status;
      const meta = status && isCustomerStatus(status)
        ? statusMeta[status]
        : {
            label: status || "未知",
            variant: "outline" as const,
          };

      return <Badge className="whitespace-nowrap" variant={meta.variant}>{meta.label}</Badge>;
    },
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "followUp",
    header: "跟进",
    cell: ({ row }) => (
      <div className="min-w-[180px]">
        <div className="flex items-center gap-2">
          {followUpBadge(row.original.follow_up_state)}
          <span className="text-xs text-muted-foreground">
            最近 {formatDateTime(row.original.last_follow_at)}
          </span>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          下次 {formatDateTime(row.original.next_follow_at)}
        </div>
        {row.original.latest_follow_up?.content ? (
          <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">
            {row.original.latest_follow_up.content}
          </div>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "created_at",
    header: "创建时间",
    cell: ({ row }) => formatDate(row.original.created_at),
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row }) => <CustomerRowActions customer={row.original} />,
    meta: {
      headerClassName: "text-right",
      cellClassName: "relative whitespace-nowrap text-right",
    },
  },
];

export function CustomersTable({
  customers,
}: {
  customers: CustomerRecord[];
}) {
  return (
    <DataTable
      columns={columns}
      data={customers}
      emptyText="没有符合条件的客户"
      minWidth="min-w-[1240px]"
    />
  );
}
