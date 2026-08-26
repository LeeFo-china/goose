"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { catalogStatusMeta } from "@/components/supplier-catalog/supplier-catalog-types";
import { Badge } from "@/components/ui/badge";

import { CatalogUnitDimension } from "./tenant-catalog-display";
import type { TenantCatalogUnit } from "./tenant-catalog-types";

export function TenantUnitTable({ records }: { records: TenantCatalogUnit[] }) {
  const columns: ColumnDef<TenantCatalogUnit>[] = [
    { accessorKey: "name", header: "名称 / 符号", cell: ({ row }) => <div><div className="font-semibold">{row.original.name}</div><div className="text-xs text-muted-foreground">{row.original.symbol}</div></div> },
    { accessorKey: "unit_dimension", header: "计量维度", cell: ({ row }) => <CatalogUnitDimension value={row.original.unit_dimension} /> },
    { accessorKey: "base_unit_id", header: "基准单位", cell: ({ row }) => row.original.base_unit ? `${row.original.base_unit.name}（${row.original.base_unit.symbol}）` : "本身" },
    { accessorKey: "conversion_factor", header: "换算系数", cell: ({ row }) => <span className="tabular-nums">{row.original.conversion_factor}</span> },
    { accessorKey: "status", header: "状态", cell: ({ row }) => { const meta = catalogStatusMeta[row.original.status]; return <Badge variant={meta.variant}>{meta.label}</Badge>; } },
    { id: "actions", header: "操作", cell: () => <span className="text-sm text-muted-foreground">平台统一维护</span>, meta: { headerClassName: "text-right", cellClassName: "text-right" } },
  ];
  return <DataTable columns={columns} data={records} emptyText="当前筛选条件下没有标准单位" minWidth="min-w-[920px]" tableClassName="border-t-0" rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME} />;
}
