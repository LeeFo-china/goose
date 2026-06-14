"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Check, X } from "lucide-react";
import { DataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  WechatRebindRequest,
  WechatRebindStatus,
  WechatRebindTargetRole,
} from "@/components/wechat-rebind-requests/wechat-rebind-types";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger";

const statusMeta: Record<WechatRebindStatus, { label: string; variant: BadgeVariant }> = {
  pending: { label: "待审核", variant: "warning" },
  approved: { label: "已通过", variant: "success" },
  rejected: { label: "已拒绝", variant: "danger" },
  cancelled: { label: "已取消", variant: "secondary" },
};

const roleMeta: Record<WechatRebindTargetRole, string> = {
  customer: "客户",
  employee: "员工",
};

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

function targetId(request: WechatRebindRequest) {
  return request.target_role === "customer"
    ? request.target_customer_id
    : request.target_employee_id;
}

function requestHint(request: WechatRebindRequest) {
  return [
    request.project_hint,
    request.community_hint,
    request.remark,
  ].map((item) => item?.trim()).filter(Boolean).join(" / ");
}

const columns: ColumnDef<WechatRebindRequest>[] = [
  {
    id: "applicant",
    header: "申请人",
    cell: ({ row }) => (
      <div className="min-w-[150px]">
        <div className="font-medium">{row.original.applicant_name || "未填写"}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {row.original.phone_masked || "-"}
        </div>
      </div>
    ),
  },
  {
    id: "target",
    header: "目标身份",
    cell: ({ row }) => (
      <div className="min-w-[180px]">
        <div className="font-medium">{roleMeta[row.original.target_role]}</div>
        <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">
          {targetId(row.original) || "-"}
        </div>
      </div>
    ),
  },
  {
    id: "hint",
    header: "申请说明",
    cell: ({ row }) => (
      <div className="min-w-[240px] max-w-[360px] line-clamp-2 text-sm">
        {requestHint(row.original) || "-"}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const meta = statusMeta[row.original.status] || {
        label: row.original.status,
        variant: "outline" as const,
      };
      return <Badge variant={meta.variant}>{meta.label}</Badge>;
    },
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "created_at",
    header: "提交时间",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {formatDateTime(row.original.created_at)}
      </span>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "review",
    header: "审核信息",
    cell: ({ row }) => (
      <div className="min-w-[160px] text-sm text-muted-foreground">
        <div>{formatDateTime(row.original.reviewed_at)}</div>
        {row.original.review_comment ? (
          <div className="mt-1 max-w-[220px] truncate">{row.original.review_comment}</div>
        ) : null}
      </div>
    ),
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row, table }) => {
      const meta = table.options.meta as
        | {
          openReview?: (
            request: WechatRebindRequest,
            action: "approve" | "reject",
          ) => void;
        }
        | undefined;
      if (row.original.status !== "pending") {
        return <span className="text-sm text-muted-foreground">已处理</span>;
      }

      return (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => meta?.openReview?.(row.original, "approve")}
          >
            <Check data-icon="inline-start" />
            通过
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => meta?.openReview?.(row.original, "reject")}
          >
            <X data-icon="inline-start" />
            拒绝
          </Button>
        </div>
      );
    },
    meta: {
      headerClassName: "text-right",
      cellClassName: "whitespace-nowrap text-right",
    },
  },
];

export function WechatRebindTable({
  requests,
  onReview,
}: {
  requests: WechatRebindRequest[];
  onReview: (request: WechatRebindRequest, action: "approve" | "reject") => void;
}) {
  return (
    <DataTable
      columns={columns}
      data={requests}
      emptyText="暂无微信换绑申请"
      minWidth="min-w-[1060px]"
      tableMeta={{ openReview: onReview }}
    />
  );
}
