"use client";

import type { FinanceCostCategoryRecord } from "@/components/finance/finance-cost-budget-requests";
import type { ProcurementSummary } from "@/components/supplier-procurement-editor/procurement-editor-rules";
import { ProcurementWorkbenchLayout } from "@/components/supplier-procurement-editor/procurement-workbench-layout";
import type {
  ProjectOption,
  PurchaseOrderCatalogItem,
  PurchaseOrderCatalogPage,
  PurchaseOrderSupplierOption,
} from "@/components/supplier-purchase-orders/purchase-order-types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";

import {
  RequisitionCatalogBrowser,
  RequisitionHeaderFields,
  LoadMoreButton,
} from "./requisition-editor-fields";
import {
  RequisitionSavedFacts,
  SelectedRequisitionLines,
} from "./requisition-editor-lines";
import {
  RequisitionEditorAlerts,
  RequisitionEditorFooter,
} from "./requisition-editor-parts";
import type {
  RequisitionDraftErrors,
  RequisitionDraftLine,
} from "./requisition-page-utils";
import type { RequisitionRecord } from "./requisition-types";

export type RequisitionEditorProps = {
  open: boolean;
  record: RequisitionRecord | null;
  projects: ProjectOption[];
  relationships: PurchaseOrderSupplierOption[];
  costCategories: FinanceCostCategoryRecord[];
  canLoadMoreProjects: boolean;
  canLoadMoreSuppliers: boolean;
  canLoadMoreCostCategories: boolean;
  loadingMoreOptions: boolean;
  onLoadMoreProjects: () => void;
  onLoadMoreSuppliers: () => void;
  onLoadMoreCostCategories: () => void;
  onOpenChange: (open: boolean) => void;
  onSaved: (record: RequisitionRecord) => void;
};

export function RequisitionEditorWorkbench({
  open,
  editingId,
  projectId,
  tenantSupplierId,
  reason,
  expectedDeliveryDate,
  remark,
  lines,
  facts,
  savedRecord,
  catalog,
  catalogPage,
  catalogKeyword,
  catalogError,
  loadingCatalog,
  loadingDraft,
  draftLoadFailed,
  draftReady,
  validation,
  fieldsLocked,
  projects,
  relationships,
  costCategories,
  canLoadMoreProjects,
  canLoadMoreSuppliers,
  canLoadMoreCostCategories,
  loadingMoreOptions,
  recentlyAddedSkuId,
  error,
  conflict,
  hasAttempt,
  saving,
  refreshing,
  refreshRequired,
  summary,
  onRequestClose,
  onAbandonAttempt,
  onRetryLoad,
  onRefresh,
  onProjectChange,
  onSupplierChange,
  onReasonChange,
  onDeliveryDateChange,
  onRemarkChange,
  onLoadMoreProjects,
  onLoadMoreSuppliers,
  onLoadMoreCostCategories,
  onCatalogKeywordChange,
  onCatalogSearch,
  onCatalogPageChange,
  onRetryCatalog,
  onAdd,
  onLineChange,
  onRemove,
  onSave,
}: {
  open: boolean;
  editingId: string | null;
  projectId: string;
  tenantSupplierId: string;
  reason: string;
  expectedDeliveryDate: string;
  remark: string;
  lines: RequisitionDraftLine[];
  facts: Record<string, PurchaseOrderCatalogItem>;
  savedRecord: RequisitionRecord | null;
  catalog: PurchaseOrderCatalogPage;
  catalogPage: number;
  catalogKeyword: string;
  catalogError: string | null;
  loadingCatalog: boolean;
  loadingDraft: boolean;
  draftLoadFailed: boolean;
  draftReady: boolean;
  validation: RequisitionDraftErrors;
  fieldsLocked: boolean;
  projects: ProjectOption[];
  relationships: PurchaseOrderSupplierOption[];
  costCategories: FinanceCostCategoryRecord[];
  canLoadMoreProjects: boolean;
  canLoadMoreSuppliers: boolean;
  canLoadMoreCostCategories: boolean;
  loadingMoreOptions: boolean;
  recentlyAddedSkuId: string | null;
  error: string | null;
  conflict: string | null;
  hasAttempt: boolean;
  saving: boolean;
  refreshing: boolean;
  refreshRequired: boolean;
  summary: ProcurementSummary;
  onRequestClose: () => void;
  onAbandonAttempt: () => void;
  onRetryLoad: () => void;
  onRefresh: () => void;
  onProjectChange: (value: string) => void;
  onSupplierChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onDeliveryDateChange: (value: string) => void;
  onRemarkChange: (value: string) => void;
  onLoadMoreProjects: () => void;
  onLoadMoreSuppliers: () => void;
  onLoadMoreCostCategories: () => void;
  onCatalogKeywordChange: (value: string) => void;
  onCatalogSearch: () => void;
  onCatalogPageChange: (page: number) => void;
  onRetryCatalog: () => void;
  onAdd: (item: PurchaseOrderCatalogItem) => void;
  onLineChange: (skuId: string, patch: Partial<RequisitionDraftLine>) => void;
  onRemove: (skuId: string) => void;
  onSave: () => void;
}) {
  const title = editingId ? "编辑采购申请草稿" : "发起采购申请";
  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onRequestClose();
      }}
    >
      <SheetContent
        closeDisabled={saving || hasAttempt}
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-[76rem]"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <SheetDescription className="sr-only">
          选择项目、合作供应商和采购商品，填写成本类目后保存草稿。
        </SheetDescription>
        <ProcurementWorkbenchLayout
          title={title}
          alerts={
            <RequisitionEditorAlerts
              error={error}
              conflict={conflict}
              hasAttempt={hasAttempt}
              saving={saving}
              loadingDraft={loadingDraft}
              draftLoadFailed={draftLoadFailed}
              refreshRequired={refreshRequired}
              editingId={editingId}
              refreshing={refreshing}
              onAbandonAttempt={onAbandonAttempt}
              onRetryLoad={onRetryLoad}
              onRefresh={onRefresh}
            />
          }
          context={
            <div className="space-y-3">
              <RequisitionHeaderFields
                projectId={projectId}
                tenantSupplierId={tenantSupplierId}
                reason={reason}
                expectedDeliveryDate={expectedDeliveryDate}
                remark={remark}
                projects={projects}
                relationships={relationships}
                validation={validation}
                fieldsLocked={fieldsLocked}
                isExisting={Boolean(editingId)}
                canLoadMoreProjects={canLoadMoreProjects}
                canLoadMoreSuppliers={canLoadMoreSuppliers}
                loadingMoreOptions={loadingMoreOptions}
                onProjectChange={onProjectChange}
                onSupplierChange={onSupplierChange}
                onReasonChange={onReasonChange}
                onDeliveryDateChange={onDeliveryDateChange}
                onRemarkChange={onRemarkChange}
                onLoadMoreProjects={onLoadMoreProjects}
                onLoadMoreSuppliers={onLoadMoreSuppliers}
              />
              {savedRecord ? (
                <RequisitionSavedFacts requisition={savedRecord} />
              ) : null}
            </div>
          }
          catalog={
            <RequisitionCatalogBrowser
              catalog={catalog}
              catalogPage={catalogPage}
              catalogKeyword={catalogKeyword}
              catalogError={catalogError}
              loadingCatalog={loadingCatalog}
              tenantSupplierId={tenantSupplierId}
              fieldsLocked={fieldsLocked}
              lines={lines}
              onKeywordChange={onCatalogKeywordChange}
              onSearch={onCatalogSearch}
              onPageChange={onCatalogPageChange}
              onRetry={onRetryCatalog}
              onAdd={onAdd}
            />
          }
          selection={
            <SelectedRequisitionLines
              lines={lines}
              facts={facts}
              categories={costCategories}
              error={validation.items}
              disabled={fieldsLocked}
              recentlyAddedSkuId={recentlyAddedSkuId}
              onChange={onLineChange}
              onRemove={onRemove}
            />
          }
          footer={
            <div className="space-y-2">
              {canLoadMoreCostCategories ? (
                <LoadMoreButton
                  label="加载更多成本分类"
                  busy={loadingMoreOptions}
                  onClick={onLoadMoreCostCategories}
                />
              ) : null}
              <RequisitionEditorFooter
                summary={summary}
                loading={loadingDraft}
                saving={saving}
                refreshing={refreshing}
                refreshRequired={refreshRequired}
                draftReady={draftReady}
                hasAttempt={hasAttempt}
                onClose={onRequestClose}
                onSave={onSave}
              />
            </div>
          }
        />
      </SheetContent>
    </Sheet>
  );
}
