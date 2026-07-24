"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";

import {
  supplierTypeLabel,
  type Pagination,
  type SupplierQualificationType,
} from "./platform-supplier-types";
import { SupplierQualificationTypeFormButton } from "./supplier-qualification-type-form";

export function SupplierQualificationTypeTable({
  records,
  pagination,
}: {
  records: SupplierQualificationType[];
  pagination: Pagination;
}) {
  const columns: ColumnDef<SupplierQualificationType>[] = [
    {
      accessorKey: "code",
      header: "编码",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-medium">
          {row.original.code}
        </span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "name",
      header: "名称",
      cell: ({ row }) => (
        <div className="min-w-[180px]">
          <div className="font-semibold">{row.original.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            版本 {row.original.version}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "applicable_supplier_types",
      header: "适用类型",
      cell: ({ row }) => {
        const types = row.original.applicable_supplier_types;
        return (
          <div className="flex min-w-[180px] flex-wrap gap-1">
            {types.length ? (
              types.map((type) => (
                <Badge key={type} variant="outline">
                  {supplierTypeLabel[type]}
                </Badge>
              ))
            ) : (
              <Badge variant="secondary">全部类型</Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "warning_days",
      header: "预警天数",
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.warning_days} 天</span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "is_required",
      header: "必填",
      cell: ({ row }) => (
        <Badge variant={row.original.is_required ? "warning" : "outline"}>
          {row.original.is_required ? "是" : "否"}
        </Badge>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "blocks_new_orders",
      header: "阻止下单",
      cell: ({ row }) => (
        <Badge variant={row.original.blocks_new_orders ? "danger" : "outline"}>
          {row.original.blocks_new_orders ? "是" : "否"}
        </Badge>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "active" ? "success" : "secondary"}>
          {row.original.status === "active" ? "启用" : "停用"}
        </Badge>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "sort_order",
      header: "排序",
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.sort_order}</span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <SupplierQualificationTypeFormButton
            record={row.original}
            expected_version={row.original.version}
          />
        </div>
      ),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right",
      },
    },
  ];

  return (
    <div aria-label={`资质类型列表，共 ${pagination.total} 条`}>
      <p className="sr-only">
        停用后保留历史资质记录，编辑时使用当前版本防止覆盖并发修改。
      </p>
      <DataTable
        columns={columns}
        data={records}
        emptyText="当前筛选条件下没有资质类型"
        minWidth="min-w-[1080px]"
        tableClassName="border-t-0"
        rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
      />
    </div>
  );
}
