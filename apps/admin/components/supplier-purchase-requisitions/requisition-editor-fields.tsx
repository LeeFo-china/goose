"use client";

import { Search } from "lucide-react";

import { FormSelect } from "@/components/admin/form-select";
import { ProcurementPurposeField } from "@/components/supplier-procurement-editor/procurement-purpose-field";
import { ProcurementRemarkField } from "@/components/supplier-procurement-editor/procurement-remark-field";
import type {
  ProjectOption,
  PurchaseOrderCatalogItem,
  PurchaseOrderCatalogPage,
  PurchaseOrderSupplierOption,
} from "@/components/supplier-purchase-orders/purchase-order-types";
import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  formatRequisitionMoney,
  type RequisitionDraftErrors,
  type RequisitionDraftLine,
} from "./requisition-page-utils";

export function RequisitionHeaderFields({
  projectId,
  tenantSupplierId,
  reason,
  expectedDeliveryDate,
  remark,
  projects,
  relationships,
  validation,
  fieldsLocked,
  isExisting,
  canLoadMoreProjects,
  canLoadMoreSuppliers,
  loadingMoreOptions,
  onProjectChange,
  onSupplierChange,
  onReasonChange,
  onDeliveryDateChange,
  onRemarkChange,
  onLoadMoreProjects,
  onLoadMoreSuppliers,
}: {
  projectId: string;
  tenantSupplierId: string;
  reason: string;
  expectedDeliveryDate: string;
  remark: string;
  projects: ProjectOption[];
  relationships: PurchaseOrderSupplierOption[];
  validation: RequisitionDraftErrors;
  fieldsLocked: boolean;
  isExisting: boolean;
  canLoadMoreProjects: boolean;
  canLoadMoreSuppliers: boolean;
  loadingMoreOptions: boolean;
  onProjectChange: (value: string) => void;
  onSupplierChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onDeliveryDateChange: (value: string) => void;
  onRemarkChange: (value: string) => void;
  onLoadMoreProjects: () => void;
  onLoadMoreSuppliers: () => void;
}) {
  const projectOptions = projects.map((project) => ({
    value: project.id,
    label: project.name,
  }));
  const supplierOptions = relationships
    .filter(({ relationship_status }) => relationship_status === "active")
    .map((relationship) => ({
      value: relationship.tenant_supplier_id,
      label: `${relationship.supplier.name} · ${relationship.supplier.code}`,
    }));

  return (
    <div className="max-h-[min(14rem,40dvh)] overflow-y-auto overscroll-contain pr-1 lg:max-h-none lg:overflow-visible lg:pr-0">
      <div className="grid min-w-0 gap-3 md:grid-cols-2 lg:grid-cols-[minmax(18rem,1fr)_minmax(17rem,1fr)_minmax(15rem,0.8fr)] [&_button]:min-h-11 md:[&_button]:min-h-9">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 md:col-span-2 lg:col-span-1 lg:grid-cols-1">
          <Field data-invalid={Boolean(validation.projectId)}>
            <FieldLabel htmlFor="requisition-project">项目</FieldLabel>
            <FormSelect
              id="requisition-project"
              value={projectId}
              options={projectOptions}
              disabled={fieldsLocked || isExisting}
              invalid={Boolean(validation.projectId)}
              onChange={onProjectChange}
            />
            {canLoadMoreProjects ? (
              <LoadMoreButton
                label="加载更多项目"
                busy={loadingMoreOptions}
                onClick={onLoadMoreProjects}
              />
            ) : null}
            <FieldError>{validation.projectId}</FieldError>
          </Field>
          <Field data-invalid={Boolean(validation.tenantSupplierId)}>
            <FieldLabel htmlFor="requisition-supplier">合作供应商</FieldLabel>
            <FormSelect
              id="requisition-supplier"
              value={tenantSupplierId}
              options={supplierOptions}
              disabled={fieldsLocked || isExisting}
              invalid={Boolean(validation.tenantSupplierId)}
              onChange={onSupplierChange}
            />
            {canLoadMoreSuppliers ? (
              <LoadMoreButton
                label="加载更多合作供应商"
                busy={loadingMoreOptions}
                onClick={onLoadMoreSuppliers}
              />
            ) : null}
            <FieldError>{validation.tenantSupplierId}</FieldError>
          </Field>
        </div>
        <ProcurementPurposeField
          destinationType="project"
          value={reason}
          disabled={fieldsLocked}
          error={validation.reason}
          onChange={onReasonChange}
        />
        <div className="min-w-0 space-y-3 md:col-span-2 lg:col-span-1">
          <Field>
            <FieldLabel htmlFor="requisition-delivery">期望到货日期</FieldLabel>
            <Input
              id="requisition-delivery"
              type="date"
              value={expectedDeliveryDate}
              disabled={fieldsLocked}
              onChange={(event) => onDeliveryDateChange(event.target.value)}
            />
          </Field>
          <ProcurementRemarkField
            value={remark}
            disabled={fieldsLocked}
            onChange={onRemarkChange}
          />
        </div>
      </div>
    </div>
  );
}

export function RequisitionCatalogBrowser({
  catalog,
  catalogPage,
  catalogKeyword,
  catalogError,
  loadingCatalog,
  tenantSupplierId,
  fieldsLocked,
  lines,
  onKeywordChange,
  onSearch,
  onPageChange,
  onRetry,
  onDismissError,
  onAdd,
}: {
  catalog: PurchaseOrderCatalogPage;
  catalogPage: number;
  catalogKeyword: string;
  catalogError: string | null;
  loadingCatalog: boolean;
  tenantSupplierId: string;
  fieldsLocked: boolean;
  lines: RequisitionDraftLine[];
  onKeywordChange: (value: string) => void;
  onSearch: () => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onDismissError: () => void;
  onAdd: (item: PurchaseOrderCatalogItem) => void;
}) {
  const totalPages = Math.max(1, catalog.pagination.totalPages || 1);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="search"
        aria-label="采购申请商品目录工具栏"
        className="sticky top-0 z-10 flex flex-nowrap items-center gap-2 border-b bg-background px-4 py-3"
      >
        <InputGroup className="min-h-11 min-w-0 flex-1 md:min-h-9">
          <InputGroupAddon>
            <Search className="size-4" aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            id="requisition-catalog-search"
            aria-label="搜索采购商品"
            value={catalogKeyword}
            maxLength={80}
            placeholder="搜索商品编码、名称或 SKU 编码、名称"
            disabled={!tenantSupplierId || fieldsLocked}
            onChange={(event) => onKeywordChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSearch();
              }
            }}
          />
        </InputGroup>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 md:min-h-9"
          disabled={!tenantSupplierId || fieldsLocked}
          onClick={onSearch}
        >
          搜索
        </Button>
      </div>
      <div className="min-h-0 overflow-x-auto lg:flex-1 lg:overflow-auto">
        {!tenantSupplierId ? (
          <CatalogEmpty
            title="先选择合作供应商"
            description="选择供应商后可浏览其有效采购目录。"
          />
        ) : loadingCatalog ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : catalogError ? (
          <div className="space-y-3 p-4">
            <StatusAlert title="商品目录加载失败">
              {catalogError}
            </StatusAlert>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 md:min-h-9"
                onClick={onRetry}
              >
                重新加载目录
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 md:min-h-9"
                onClick={onDismissError}
              >
                关闭提示
              </Button>
            </div>
          </div>
        ) : catalog.list.length === 0 ? (
          <CatalogEmpty
            title="没有可采购商品"
            description="调整搜索词，或确认供应商已有当前有效的已发布价格。"
          />
        ) : (
          <RequisitionCatalogTable
            items={catalog.list}
            selectedSkuIds={new Set(lines.map((line) => line.supplierSkuId))}
            disabled={fieldsLocked || lines.length >= 100}
            onAdd={onAdd}
          />
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 md:min-h-8"
          disabled={catalogPage <= 1 || loadingCatalog || fieldsLocked}
          onClick={() => onPageChange(catalogPage - 1)}
        >
          上一页
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          第 {catalogPage} / {totalPages} 页
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 md:min-h-8"
          disabled={catalogPage >= totalPages || loadingCatalog || fieldsLocked}
          onClick={() => onPageChange(catalogPage + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

function RequisitionCatalogTable({
  items,
  selectedSkuIds,
  disabled,
  onAdd,
}: {
  items: PurchaseOrderCatalogItem[];
  selectedSkuIds: Set<string>;
  disabled: boolean;
  onAdd: (item: PurchaseOrderCatalogItem) => void;
}) {
  return (
    <Table className="min-w-[640px]">
      <TableHeader>
        <TableRow>
          <TableHead>商品 / SKU</TableHead>
          <TableHead>单位</TableHead>
          <TableHead className="text-right">目录参考价</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const selected = selectedSkuIds.has(item.supplier_sku_id);
          return (
            <TableRow key={item.supplier_sku_id}>
              <TableCell>
                <div className="font-medium">{item.product_name}</div>
                <div className="text-xs text-muted-foreground">
                  {item.sku_name} · {item.sku_code}
                </div>
              </TableCell>
              <TableCell>{item.purchase_unit_symbol}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatRequisitionMoney(item.unit_price)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  size="sm"
                  variant={selected ? "secondary" : "outline"}
                  className="min-h-11 md:min-h-8"
                  disabled={disabled || selected}
                  aria-label={
                    selected
                      ? `${item.product_name}已加入`
                      : `加入${item.product_name}`
                  }
                  onClick={() => onAdd(item)}
                >
                  {selected ? "已选" : "加入"}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function CatalogEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty className="min-h-48">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Search />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function LoadMoreButton({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={busy}
      className="justify-start px-0"
      onClick={onClick}
    >
      {busy ? <Spinner data-icon="inline-start" /> : null}
      {label}
    </Button>
  );
}
