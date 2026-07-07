"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Eye, XCircle } from "lucide-react";
import { type ReactNode } from "react";
import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import {
  type FieldConfig,
  MutationDialogButton,
  stringField,
} from "@/components/platform-partners/platform-partner-actions";
import {
  optionLabel,
  partnerMemberRebindStatusOptions,
  type PlatformPartnerMemberRebindRecord,
} from "@/components/platform-partners/platform-partner-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function PlatformPartnerMemberRebindTable({
  list,
}: {
  list: PlatformPartnerMemberRebindRecord[];
}) {
  return (
    <DataTable
      columns={rebindColumns}
      data={list}
      emptyText="还没有合伙人成员换绑申请"
      minWidth="min-w-[1160px]"
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}

const rebindColumns: ColumnDef<PlatformPartnerMemberRebindRecord>[] = [
  {
    id: "partner",
    header: "合伙人",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">
          {row.original.partner?.name ?? row.original.partner_id}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {row.original.partner_id}
        </div>
      </div>
    ),
  },
  {
    id: "member",
    header: "成员",
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.member?.name ?? row.original.member_id}</div>
        <div className="text-xs text-muted-foreground">{row.original.phone}</div>
      </div>
    ),
    meta: { cellClassName: "whitespace-nowrap" },
  },
  {
    accessorKey: "applicant_name",
    header: "申请人",
    cell: ({ row }) => row.original.applicant_name || "-",
  },
  {
    accessorKey: "reason",
    header: "原因",
    cell: ({ row }) => (
      <span className="line-clamp-2 text-muted-foreground">
        {row.original.reason || "-"}
      </span>
    ),
    meta: { cellClassName: "min-w-[220px]" },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => <RebindStatusBadge status={row.original.status} />,
    meta: { cellClassName: "whitespace-nowrap" },
  },
  {
    accessorKey: "created_at",
    header: "提交时间",
    cell: ({ row }) => formatDate(row.original.created_at),
    meta: { cellClassName: "whitespace-nowrap text-muted-foreground" },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row }) => (
      <div className="flex justify-end gap-2">
        <RebindDetailButton request={row.original} />
        <ApproveRebindRequestButton request={row.original} />
        <RejectRebindRequestButton request={row.original} />
      </div>
    ),
    meta: { headerClassName: "text-right", cellClassName: "text-right" },
  },
];

function ApproveRebindRequestButton({
  request,
}: {
  request: PlatformPartnerMemberRebindRecord;
}) {
  const fields: FieldConfig[] = [
    { name: "comment", label: "审核备注", type: "textarea", defaultValue: "人工核实通过" },
  ];

  return (
    <MutationDialogButton
      title="通过换绑申请"
      description={`通过后会把「${request.member?.name ?? request.phone}」的城市合伙人成员身份绑定到申请人的当前微信。`}
      trigger={
        <Button type="button" size="sm" variant="outline" disabled={request.status !== "pending"}>
          <CheckCircle2 data-icon="inline-start" />
          通过
        </Button>
      }
      submitLabel="确认通过"
      fallbackMessage="审核通过失败"
      endpoint={`/platform/partner-member-rebind-requests/${request.id}/approve`}
      fields={fields}
      buildPayload={(formData) => ({
        comment: stringField(formData, "comment") || undefined,
      })}
    />
  );
}

function RejectRebindRequestButton({
  request,
}: {
  request: PlatformPartnerMemberRebindRecord;
}) {
  const fields: FieldConfig[] = [
    { name: "comment", label: "驳回原因", type: "textarea", required: true },
  ];

  return (
    <MutationDialogButton
      title="驳回换绑申请"
      description="驳回后不会修改合伙人成员的微信绑定关系。"
      trigger={
        <Button type="button" size="sm" variant="outline" disabled={request.status !== "pending"}>
          <XCircle data-icon="inline-start" />
          驳回
        </Button>
      }
      submitLabel="确认驳回"
      fallbackMessage="驳回失败"
      endpoint={`/platform/partner-member-rebind-requests/${request.id}/reject`}
      fields={fields}
      buildPayload={(formData) => ({
        comment: stringField(formData, "comment"),
      })}
    />
  );
}

function RebindDetailButton({
  request,
}: {
  request: PlatformPartnerMemberRebindRecord;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          <Eye data-icon="inline-start" />
          详情
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{request.member?.name ?? request.phone}</DialogTitle>
          <DialogDescription>
            {request.partner?.name ?? request.partner_id} / {formatDate(request.created_at)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <DetailItem label="状态">
            <RebindStatusBadge status={request.status} />
          </DetailItem>
          <DetailItem label="申请人">{request.applicant_name || "-"}</DetailItem>
          <DetailItem label="成员手机号">{request.phone}</DetailItem>
          <DetailItem label="成员 ID">{request.member_id}</DetailItem>
          <DetailItem label="旧 auth_user_id" wide>{request.old_auth_user_id}</DetailItem>
          <DetailItem label="新 auth_user_id" wide>{request.new_auth_user_id}</DetailItem>
          <DetailItem label="申请原因" wide>{request.reason || "-"}</DetailItem>
          <DetailItem label="审核备注" wide>{request.review_comment || "-"}</DetailItem>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RebindStatusBadge({
  status,
}: {
  status: PlatformPartnerMemberRebindRecord["status"];
}) {
  const variant = status === "approved"
    ? "success"
    : status === "pending"
      ? "warning"
      : status === "rejected"
        ? "danger"
        : "outline";
  return (
    <Badge variant={variant}>
      {optionLabel(partnerMemberRebindStatusOptions, status)}
    </Badge>
  );
}

function DetailItem({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "md:col-span-2" : undefined}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words">{children}</div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}
