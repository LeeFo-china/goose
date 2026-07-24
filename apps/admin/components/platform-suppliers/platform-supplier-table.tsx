"use client";

import { useEffect, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { PlatformSupplierDetail } from "./platform-supplier-detail";
import {
  formatSupplierDate,
  onboardingMeta,
  operationalMeta,
  qualificationHealthMeta,
  supplierTypeLabel,
  type PlatformSupplierListItem,
} from "./platform-supplier-types";

export function PlatformSupplierTable({
  suppliers,
  canManage,
  canReview,
  canBlacklist,
}: {
  suppliers: PlatformSupplierListItem[];
  canManage: boolean;
  canReview: boolean;
  canBlacklist: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = suppliers.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selected, selectedId]);

  const columns: ColumnDef<PlatformSupplierListItem>[] = [
    {
      accessorKey: "name",
      header: "供应商",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{row.original.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.code} / {row.original.legal_name}
          </div>
        </div>
      ),
      meta: { cellClassName: "min-w-[240px]" },
    },
    {
      accessorKey: "supplier_type",
      header: "类型",
      cell: ({ row }) => supplierTypeLabel[row.original.supplier_type],
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "onboarding_status",
      header: "准入状态",
      cell: ({ row }) => {
        const meta = onboardingMeta[row.original.onboarding_status];
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "operational_status",
      header: "运营状态",
      cell: ({ row }) => {
        const meta = operationalMeta[row.original.operational_status];
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "qualification_health",
      header: "资质健康",
      cell: ({ row }) => {
        const meta = qualificationHealthMeta[row.original.qualification_health];
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "updated_at",
      header: "更新时间",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {formatSupplierDate(row.original.updated_at)}
        </span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSelectedId(row.original.id)}
          >
            <Eye data-icon="inline-start" />
            查看详情
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
    <>
      <DataTable
        columns={columns}
        data={suppliers}
        emptyText="当前筛选条件下没有供应商"
        minWidth="min-w-[1120px]"
        tableClassName="border-t-0"
        rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
      />
      {selected ? (
        <PlatformSupplierDetail
          supplier={selected}
          open
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
          canManage={canManage}
          canReview={canReview}
          canBlacklist={canBlacklist}
        />
      ) : null}
    </>
  );
}
