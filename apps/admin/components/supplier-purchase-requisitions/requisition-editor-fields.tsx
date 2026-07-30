"use client";

import { Search } from "lucide-react";

import { FormSelect } from "@/components/admin/form-select";
import type {
  ProjectOption,
  PurchaseOrderCatalogPage,
  PurchaseOrderSupplierOption,
} from "@/components/supplier-purchase-orders/purchase-order-types";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import {
  type RequisitionDraftErrors,
  type RequisitionDraftLine,
} from "./requisition-page-utils";
import { RequisitionCatalogTable } from "./requisition-editor-lines";

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
    <FieldGroup className="grid gap-4 md:grid-cols-2">
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
      <Field data-invalid={Boolean(validation.reason)}>
        <FieldLabel htmlFor="requisition-reason">临时采购原因</FieldLabel>
        <Textarea
          id="requisition-reason"
          value={reason}
          maxLength={500}
          disabled={fieldsLocked}
          aria-invalid={Boolean(validation.reason)}
          onChange={(event) => onReasonChange(event.target.value)}
        />
        <FieldError>{validation.reason}</FieldError>
      </Field>
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
      <Field className="md:col-span-2">
        <FieldLabel htmlFor="requisition-remark">备注</FieldLabel>
        <Textarea
          id="requisition-remark"
          value={remark}
          maxLength={500}
          disabled={fieldsLocked}
          onChange={(event) => onRemarkChange(event.target.value)}
        />
      </Field>
    </FieldGroup>
  );
}

export function RequisitionCatalogBrowser({
  catalog,
  catalogPage,
  catalogKeyword,
  loadingCatalog,
  tenantSupplierId,
  fieldsLocked,
  lines,
  onKeywordChange,
  onSearch,
  onPageChange,
  onAdd,
}: {
  catalog: PurchaseOrderCatalogPage;
  catalogPage: number;
  catalogKeyword: string;
  loadingCatalog: boolean;
  tenantSupplierId: string;
  fieldsLocked: boolean;
  lines: RequisitionDraftLine[];
  onKeywordChange: (value: string) => void;
  onSearch: () => void;
  onPageChange: (page: number) => void;
  onAdd: (skuId: string) => void;
}) {
  const totalPages = Math.max(1, catalog.pagination.totalPages || 1);
  return (
    <Field>
      <FieldLabel htmlFor="requisition-catalog-search">
        分页商品目录
      </FieldLabel>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="requisition-catalog-search"
          value={catalogKeyword}
          placeholder="搜索商品或 SKU"
          disabled={!tenantSupplierId || fieldsLocked}
          onChange={(event) => onKeywordChange(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!tenantSupplierId || fieldsLocked}
          onClick={onSearch}
        >
          <Search data-icon="inline-start" />
          搜索目录
        </Button>
      </div>
      <RequisitionCatalogTable
        items={catalog.list}
        selectedSkuIds={new Set(lines.map((line) => line.supplierSkuId))}
        loading={loadingCatalog}
        disabled={fieldsLocked || lines.length >= 100}
        onAdd={(item) => onAdd(item.supplier_sku_id)}
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={catalogPage <= 1 || loadingCatalog}
          onClick={() => onPageChange(catalogPage - 1)}
        >
          上一页
        </Button>
        <span className="text-xs text-muted-foreground">
          第 {catalogPage} / {totalPages} 页
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={catalogPage >= totalPages || loadingCatalog}
          onClick={() => onPageChange(catalogPage + 1)}
        >
          下一页
        </Button>
      </div>
    </Field>
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
      onClick={onClick}
    >
      {busy ? <Spinner data-icon="inline-start" /> : null}
      {label}
    </Button>
  );
}
