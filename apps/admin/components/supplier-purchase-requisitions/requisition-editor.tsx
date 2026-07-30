"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { StatusAlert } from "@/components/admin/status-alert";
import type {
  FinanceCostCategoryRecord,
} from "@/components/finance/finance-cost-budget-requests";
import type {
  ProjectOption,
  PurchaseOrderCatalogItem,
  PurchaseOrderCatalogPage,
  PurchaseOrderSupplierOption,
} from "@/components/supplier-purchase-orders/purchase-order-types";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";

import {
  loadRequisition,
  loadRequisitionCatalog,
  loadRequisitionItems,
} from "./requisition-api";
import {
  errorMessage,
  errorStatus,
  type RequisitionDraftErrors,
  type RequisitionDraftLine,
} from "./requisition-page-utils";
import {
  catalogFactFromRequisitionItem,
  RequisitionSavedFacts,
  SelectedRequisitionLines,
} from "./requisition-editor-lines";
import {
  LoadMoreButton,
  RequisitionCatalogBrowser,
  RequisitionHeaderFields,
} from "./requisition-editor-fields";
import type {
  RequisitionDetail,
  RequisitionItemPage,
  RequisitionRecord,
} from "./requisition-types";
import { useRequisitionDraftSave } from "./use-requisition-draft-save";

const emptyCatalog: PurchaseOrderCatalogPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

export function RequisitionEditor({
  open,
  record,
  projects,
  relationships,
  costCategories,
  canLoadMoreProjects,
  canLoadMoreSuppliers,
  canLoadMoreCostCategories,
  loadingMoreOptions,
  onLoadMoreProjects,
  onLoadMoreSuppliers,
  onLoadMoreCostCategories,
  onOpenChange,
  onSaved,
}: {
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
}) {
  const [projectId, setProjectId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tenantSupplierId, setTenantSupplierId] = useState("");
  const [reason, setReason] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [remark, setRemark] = useState("");
  const [expectedVersion, setExpectedVersion] = useState(0);
  const [lines, setLines] = useState<RequisitionDraftLine[]>([]);
  const [facts, setFacts] = useState<Record<string, PurchaseOrderCatalogItem>>(
    {},
  );
  const [savedRecord, setSavedRecord] = useState<RequisitionRecord | null>(
    null,
  );
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogKeyword, setCatalogKeyword] = useState("");
  const [appliedCatalogKeyword, setAppliedCatalogKeyword] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [validation, setValidation] = useState<RequisitionDraftErrors>({});
  const draftRequestVersion = useRef(0);
  const catalogRequestVersion = useRef(0);
  const activeSupplierId = useRef("");
  const activeDraftId = useRef<string | null>(null);
  const recordId = record?.id ?? null;

  const applyLoadedDraft = useCallback((
    detail: RequisitionDetail,
    itemPage: RequisitionItemPage,
  ) => {
    const requisition = detail.requisition;
    activeDraftId.current = requisition.id;
    const supplierChanged =
      activeSupplierId.current !== requisition.tenant_supplier_id;
    setEditingId(requisition.id);
    setProjectId(requisition.project_id);
    activeSupplierId.current = requisition.tenant_supplier_id;
    setTenantSupplierId(requisition.tenant_supplier_id);
    if (supplierChanged) setCatalog(emptyCatalog);
    setReason(requisition.reason);
    setExpectedDeliveryDate(requisition.expected_delivery_date ?? "");
    setRemark(requisition.remark ?? "");
    setExpectedVersion(requisition.version);
    setLines(itemPage.list.map((item) => ({
      supplierSkuId: item.supplier_sku_id,
      costCategoryId: item.cost_category_id,
      quantity: item.quantity,
    })));
    setFacts(Object.fromEntries(itemPage.list.map((item) => [
      item.supplier_sku_id,
      catalogFactFromRequisitionItem(item),
    ])));
    setSavedRecord(requisition);
  }, []);

  const {
    attempt,
    conflict,
    error,
    refreshRequired,
    refreshing,
    saving,
    invalidateRefresh,
    refreshSavedDraft,
    saveDraft,
    setAttempt,
    setConflict,
    setError,
    setRefreshRequired,
  } = useRequisitionDraftSave({
    editingId,
    loadingDraft,
    onValidation: setValidation,
    onCommandAccepted: (requisition) => {
      activeDraftId.current = requisition.id;
      setEditingId(requisition.id);
      setExpectedVersion(requisition.version);
      setSavedRecord(requisition);
      onSaved(requisition);
    },
    onRefreshAccepted: (detail, itemPage) => {
      applyLoadedDraft(detail, itemPage);
      onSaved(detail.requisition);
    },
    onRefreshFailed: () => setFacts({}),
  });

  const hydrateDraft = useCallback(async (
    targetId = recordId,
  ) => {
    const version = ++draftRequestVersion.current;
    setConflict(null);
    setValidation({});
    setError(null);
    if (!targetId) {
      activeDraftId.current = null;
      setEditingId(null);
      setProjectId("");
      activeSupplierId.current = "";
      setTenantSupplierId("");
      setCatalog(emptyCatalog);
      setReason("");
      setExpectedDeliveryDate("");
      setRemark("");
      setExpectedVersion(0);
      setLines([]);
      setFacts({});
      setSavedRecord(null);
      setRefreshRequired(false);
      return "empty" as const;
    }
    setLoadingDraft(true);
    try {
      const [detail, itemPage] = await Promise.all([
        loadRequisition(targetId),
        loadRequisitionItems(targetId),
      ]);
      if (draftRequestVersion.current !== version) return null;
      applyLoadedDraft(detail, itemPage);
      setRefreshRequired(false);
      return detail.requisition;
    } catch (caught) {
      if (draftRequestVersion.current === version) {
        setError(errorMessage(caught, "采购申请草稿加载失败"));
        if (errorStatus(caught) === 404) return "not_found" as const;
      }
      return null;
    } finally {
      if (draftRequestVersion.current === version) setLoadingDraft(false);
    }
  }, [applyLoadedDraft, recordId]);

  useEffect(() => {
    if (!open) {
      draftRequestVersion.current += 1;
      catalogRequestVersion.current += 1;
      activeDraftId.current = null;
      invalidateRefresh();
      return;
    }
    if (recordId && recordId === activeDraftId.current) return;
    setCatalogPage(1);
    setAppliedCatalogKeyword("");
    void hydrateDraft();
  }, [hydrateDraft, invalidateRefresh, open]);

  const loadCatalog = useCallback(async () => {
    const version = ++catalogRequestVersion.current;
    const requestedSupplierId = tenantSupplierId;
    if (!open || !tenantSupplierId) {
      setCatalog(emptyCatalog);
      return;
    }
    setLoadingCatalog(true);
    try {
      const page = await loadRequisitionCatalog(
        tenantSupplierId,
        catalogPage,
        appliedCatalogKeyword,
      );
      if (
        catalogRequestVersion.current !== version ||
        activeSupplierId.current !== requestedSupplierId
      ) return;
      setCatalog(page);
      setFacts((current) => ({
        ...current,
        ...Object.fromEntries(page.list.map((item) => [
          item.supplier_sku_id,
          item,
        ])),
      }));
    } catch (caught) {
      if (catalogRequestVersion.current === version) {
        setError(errorMessage(caught, "可采购目录加载失败"));
      }
    } finally {
      if (catalogRequestVersion.current === version) {
        setLoadingCatalog(false);
      }
    }
  }, [appliedCatalogKeyword, catalogPage, open, tenantSupplierId]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const fieldsLocked = loadingDraft || refreshing || saving ||
    attempt !== null || refreshRequired;

  async function abandonAttempt() {
    const targetId = editingId ?? attempt?.resourceId ?? recordId;
    const result = await hydrateDraft(targetId);
    if (result === "not_found") {
      setAttempt(null);
      if (!editingId) {
        await hydrateDraft(null);
        setError(null);
      }
    } else if (result && result !== "empty") {
      setAttempt(null);
      onSaved(result);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && (saving || attempt)) return;
    if (!nextOpen) invalidateRefresh();
    onOpenChange(nextOpen);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-[min(96vw,72rem)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <SheetHeader className="shrink-0 border-b p-4 pr-12">
          <SheetTitle>
            {editingId ? "编辑采购申请草稿" : "发起采购申请"}
          </SheetTitle>
          <SheetDescription>
            选择项目、合作供应商与成本分类。保存时由服务端按有效目录重新计价。
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            {error ? <StatusAlert>{error}</StatusAlert> : null}
            {conflict ? (
              <Button
                type="button"
                variant="outline"
                disabled={loadingDraft}
                onClick={() => void abandonAttempt()}
              >
                放弃本次重试并刷新
              </Button>
            ) : null}
            {attempt && !conflict && !saving ? (
              <Button
                type="button"
                variant="outline"
                disabled={loadingDraft}
                onClick={() => void abandonAttempt()}
              >
                放弃本次重试并刷新
              </Button>
            ) : null}
            {refreshRequired && editingId ? (
              <Button
                type="button"
                variant="outline"
                disabled={loadingDraft || refreshing || saving}
                onClick={() => void refreshSavedDraft(editingId)}
              >
                刷新最新数据
              </Button>
            ) : null}
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
              onProjectChange={setProjectId}
              onSupplierChange={(value) => {
                catalogRequestVersion.current += 1;
                activeSupplierId.current = value;
                setTenantSupplierId(value);
                setCatalog(emptyCatalog);
                setCatalogKeyword("");
                setAppliedCatalogKeyword("");
                setError(null);
                setLines([]);
                setFacts({});
                setCatalogPage(1);
              }}
              onReasonChange={setReason}
              onDeliveryDateChange={setExpectedDeliveryDate}
              onRemarkChange={setRemark}
              onLoadMoreProjects={onLoadMoreProjects}
              onLoadMoreSuppliers={onLoadMoreSuppliers}
            />
            {canLoadMoreCostCategories ? (
              <LoadMoreButton
                label="加载更多成本分类"
                busy={loadingMoreOptions}
                onClick={onLoadMoreCostCategories}
              />
            ) : null}
            <SelectedRequisitionLines
              lines={lines}
              facts={facts}
              categories={costCategories}
              error={validation.items}
              disabled={fieldsLocked}
              onChange={(skuId, patch) =>
                setLines((current) =>
                  current.map((line) =>
                    line.supplierSkuId === skuId ? { ...line, ...patch } : line
                  ))}
              onRemove={(skuId) =>
                setLines((current) =>
                  current.filter((line) => line.supplierSkuId !== skuId)
                )}
            />
            <RequisitionCatalogBrowser
              catalog={catalog}
              catalogPage={catalogPage}
              catalogKeyword={catalogKeyword}
              loadingCatalog={loadingCatalog}
              tenantSupplierId={tenantSupplierId}
              fieldsLocked={fieldsLocked}
              lines={lines}
              onKeywordChange={setCatalogKeyword}
              onSearch={() => {
                setCatalogPage(1);
                setAppliedCatalogKeyword(catalogKeyword.trim());
              }}
              onPageChange={setCatalogPage}
              onAdd={(supplierSkuId) =>
                setLines((current) => [
                  ...current,
                  { supplierSkuId, costCategoryId: "", quantity: "1" },
                ])}
            />
            {savedRecord ? (
              <RequisitionSavedFacts requisition={savedRecord} />
            ) : null}
          </div>
        </div>
        <SheetFooter className="shrink-0 border-t p-4">
          <Button
            type="button"
            variant="outline"
            disabled={saving || Boolean(attempt)}
            onClick={() => handleOpenChange(false)}
          >
            关闭
          </Button>
          <Button
            type="button"
            disabled={saving || loadingDraft || refreshing || refreshRequired}
            onClick={() =>
              void saveDraft({
                projectId,
                tenantSupplierId,
                reason,
                expectedDeliveryDate,
                remark,
                expectedVersion,
                items: lines,
              })}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {attempt && !saving ? "重试保存" : "保存草稿"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
