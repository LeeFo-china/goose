"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { Eye } from "lucide-react";

import { DataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  blockingReasonLabel,
  contractHealthMeta,
  relationshipStatusMeta,
  type Pagination,
  type TenantSupplierRelationship,
} from "./supplier-types";

export function TenantSupplierTable({
  relationships,
  pagination,
  onOpen,
}: {
  relationships: TenantSupplierRelationship[];
  pagination: Pagination;
  onOpen: (relationship: TenantSupplierRelationship) => void;
}) {
  const columns = useMemo<ColumnDef<TenantSupplierRelationship>[]>(() => [
    {
      id: "supplier",
      header: "供应商",
      cell: ({ row }) => (
        <div className="min-w-44">
          <div className="font-medium">{row.original.supplier.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.supplier.code}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "internal_supplier_code",
      header: "内部编码",
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.internal_supplier_code}
        </span>
      ),
    },
    {
      id: "ownership_scope",
      header: "资料来源",
      cell: ({ row }) => (
        <Badge variant={
          row.original.supplier.ownership_scope === "tenant"
            ? "secondary"
            : "outline"
        }>
          {row.original.supplier.ownership_scope === "tenant"
            ? "租户私有"
            : "平台共享"}
        </Badge>
      ),
    },
    {
      accessorKey: "relationship_status",
      header: "合作状态",
      cell: ({ row }) => {
        const meta = relationshipStatusMeta[row.original.relationship_status];
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
    },
    {
      id: "eligibility",
      header: "新订单资格",
      cell: ({ row }) => {
        const eligibility = row.original.eligibility;
        if (!eligibility) return <Badge variant="outline">待评估</Badge>;
        return (
          <div className="flex min-w-40 flex-col gap-1">
            <Badge variant={eligibility.eligible ? "success" : "danger"}>
              {eligibility.eligible ? "可创建新订单" : "暂不可下单"}
            </Badge>
            {!eligibility.eligible && eligibility.blocking_reasons[0] ? (
              <span className="text-xs text-muted-foreground">
                {blockingReasonLabel[eligibility.blocking_reasons[0]]}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "terms",
      header: "结算条款",
      cell: ({ row }) => (
        <div className="whitespace-nowrap text-sm">
          <div>{row.original.settlement_term_days} 天账期</div>
          <div className="text-xs text-muted-foreground">
            {row.original.invoice_required_before_payment
              ? "付款前需发票"
              : "付款前不强制发票"}
          </div>
        </div>
      ),
    },
    {
      id: "contract_health",
      header: "合同健康",
      cell: ({ row }) => {
        const meta = contractHealthMeta[row.original.contract_health];
        return (
          <Badge variant={meta.variant}>{meta.label}</Badge>
        );
      },
    },
    {
      accessorKey: "tenant_owner_employee_id",
      header: "租户负责人",
      cell: ({ row }) => (
        <span className="block max-w-40 truncate text-sm">
          {row.original.tenant_owner_employee_id ?? "未指定"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "操作",
      meta: { headerClassName: "sticky right-0 bg-muted/95" },
      cell: ({ row }) => (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(row.original);
          }}
        >
          <Eye data-icon="inline-start" />
          查看详情
        </Button>
      ),
    },
  ], [onOpen]);

  return (
    <div aria-label={`合作供应商列表，共 ${pagination.total} 条`}>
      <DataTable
        columns={columns}
        data={relationships}
        minWidth="min-w-[1240px]"
        emptyText="没有符合当前筛选条件的合作供应商"
        onRowClick={onOpen}
      />
    </div>
  );
}
