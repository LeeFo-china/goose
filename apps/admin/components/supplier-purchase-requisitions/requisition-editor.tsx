"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProcurementConfirmDialog } from "@/components/supplier-procurement-editor/procurement-confirm-dialog";
import { procurementSummary } from "@/components/supplier-procurement-editor/procurement-editor-rules";
import type { PurchaseOrderCatalogItem, PurchaseOrderCatalogPage } from "@/components/supplier-purchase-orders/purchase-order-types";
import { loadRequisition, loadRequisitionCatalog, loadRequisitionItems } from "./requisition-api";
import { catalogFactFromRequisitionItem } from "./requisition-editor-lines";
import {
  RequisitionEditorWorkbench,
  type RequisitionEditorProps,
} from "./requisition-editor-workbench";
import {
  errorMessage,
  errorStatus,
  type RequisitionDraftErrors,
  type RequisitionDraftLine,
} from "./requisition-page-utils";
import type {
  RequisitionDetail,
  RequisitionItemPage,
  RequisitionRecord,
} from "./requisition-types";
import { useRequisitionDraftSave } from "./use-requisition-draft-save";
const RECENTLY_ADDED_FEEDBACK_MS = 1_600;
const emptyCatalog: PurchaseOrderCatalogPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};
type RequisitionContextChange =
  { kind: "project"; value: string } | { kind: "supplier"; value: string };
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
}: RequisitionEditorProps) {
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
  const [catalogContextVersion, setCatalogContextVersion] = useState(0);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [validation, setValidation] = useState<RequisitionDraftErrors>({});
  const [dirty, setDirty] = useState(false);
  const [pendingContext, setPendingContext] =
    useState<RequisitionContextChange | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [recentlyAddedSkuId, setRecentlyAddedSkuId] = useState<string | null>(
    null,
  );
  const draftRequestVersion = useRef(0);
  const catalogRequestVersion = useRef(0);
  const activeSupplierId = useRef("");
  const activeDraftId = useRef<string | null>(null);
  const recordId = record?.id ?? null;
  const applyLoadedDraft = useCallback(
    (detail: RequisitionDetail, itemPage: RequisitionItemPage) => {
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
      setLines(
        itemPage.list.map((item) => ({
          supplierSkuId: item.supplier_sku_id,
          costCategoryId: item.cost_category_id,
          quantity: item.quantity,
        })),
      );
      setFacts(
        Object.fromEntries(
          itemPage.list.map((item) => [
            item.supplier_sku_id,
            catalogFactFromRequisitionItem(item),
          ]),
        ),
      );
      setSavedRecord(requisition);
      setDirty(false);
      setRecentlyAddedSkuId(null);
    },
    [],
  );
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
      setDirty(false);
      onSaved(requisition);
    },
    onRefreshAccepted: (detail, itemPage) => {
      applyLoadedDraft(detail, itemPage);
      onSaved(detail.requisition);
    },
    onRefreshFailed: () => setFacts({}),
  });
  const hydrateDraft = useCallback(
    async (targetId = recordId) => {
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
        setDirty(false);
        setRecentlyAddedSkuId(null);
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
    },
    [applyLoadedDraft, recordId, setConflict, setError, setRefreshRequired],
  );
  useEffect(() => {
    if (!open) {
      draftRequestVersion.current += 1;
      catalogRequestVersion.current += 1;
      activeDraftId.current = null;
      invalidateRefresh();
      return;
    }
    if (attempt) return;
    if (recordId && recordId === activeDraftId.current) return;
    setCatalogPage(1);
    setAppliedCatalogKeyword("");
    void hydrateDraft();
  }, [attempt, hydrateDraft, invalidateRefresh, open, recordId]);
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
      )
        return;
      setCatalog(page);
      setFacts((current) => ({
        ...current,
        ...Object.fromEntries(
          page.list.map((item) => [item.supplier_sku_id, item]),
        ),
      }));
    } catch (caught) {
      if (catalogRequestVersion.current === version) {
        setError(errorMessage(caught, "可采购目录加载失败"));
      }
    } finally {
      if (catalogRequestVersion.current === version) setLoadingCatalog(false);
    }
  }, [
    appliedCatalogKeyword,
    catalogContextVersion,
    catalogPage,
    open,
    setError,
    tenantSupplierId,
  ]);
  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);
  useEffect(() => {
    if (!recentlyAddedSkuId) return;
    const timeout = window.setTimeout(
      () => setRecentlyAddedSkuId(null),
      RECENTLY_ADDED_FEEDBACK_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [recentlyAddedSkuId]);
  const fieldsLocked =
    loadingDraft || refreshing || saving || attempt !== null || refreshRequired;
  const summary = procurementSummary(
    lines.map((line) => ({
      supplierId: tenantSupplierId,
      quantity: line.quantity,
      unitPrice: facts[line.supplierSkuId]?.unit_price,
      costCategoryId: line.costCategoryId,
    })),
  );
  function updateUserState(change: () => void) {
    change();
    setDirty(true);
    setValidation({});
  }
  function applyContextChange(change: RequisitionContextChange) {
    updateUserState(() => {
      if (change.kind === "project") setProjectId(change.value);
      else {
        activeSupplierId.current = change.value;
        setTenantSupplierId(change.value);
      }
      catalogRequestVersion.current += 1;
      setCatalog(emptyCatalog);
      setCatalogKeyword("");
      setAppliedCatalogKeyword("");
      setCatalogPage(1);
      setCatalogContextVersion((value) => value + 1);
      setLines([]);
      setFacts({});
      setRecentlyAddedSkuId(null);
      setError(null);
    });
  }
  function requestContextChange(change: RequisitionContextChange) {
    const currentValue =
      change.kind === "project" ? projectId : tenantSupplierId;
    if (change.value === currentValue) return;
    if (lines.length > 0) {
      setPendingContext(change);
      return;
    }
    applyContextChange(change);
  }
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
  function closeEditor() {
    invalidateRefresh();
    onOpenChange(false);
  }
  function requestClose() {
    if (saving) return;
    if (attempt || !dirty) {
      closeEditor();
      return;
    }
    setConfirmClose(true);
  }
  return (
    <>
      <RequisitionEditorWorkbench
        open={open}
        editingId={editingId}
        projectId={projectId}
        tenantSupplierId={tenantSupplierId}
        reason={reason}
        expectedDeliveryDate={expectedDeliveryDate}
        remark={remark}
        lines={lines}
        facts={facts}
        savedRecord={savedRecord}
        catalog={catalog}
        catalogPage={catalogPage}
        catalogKeyword={catalogKeyword}
        loadingCatalog={loadingCatalog}
        loadingDraft={loadingDraft}
        validation={validation}
        fieldsLocked={fieldsLocked}
        projects={projects}
        relationships={relationships}
        costCategories={costCategories}
        canLoadMoreProjects={canLoadMoreProjects}
        canLoadMoreSuppliers={canLoadMoreSuppliers}
        canLoadMoreCostCategories={canLoadMoreCostCategories}
        loadingMoreOptions={loadingMoreOptions}
        recentlyAddedSkuId={recentlyAddedSkuId}
        error={error}
        conflict={conflict}
        hasAttempt={Boolean(attempt)}
        saving={saving}
        refreshing={refreshing}
        refreshRequired={refreshRequired}
        summary={summary}
        onRequestClose={requestClose}
        onAbandonAttempt={() => void abandonAttempt()}
        onRefresh={() => {
          if (editingId) void refreshSavedDraft(editingId);
        }}
        onProjectChange={(value) =>
          requestContextChange({ kind: "project", value })}
        onSupplierChange={(value) =>
          requestContextChange({ kind: "supplier", value })}
        onReasonChange={(value) => updateUserState(() => setReason(value))}
        onDeliveryDateChange={(value) =>
          updateUserState(() => setExpectedDeliveryDate(value))}
        onRemarkChange={(value) => updateUserState(() => setRemark(value))}
        onLoadMoreProjects={onLoadMoreProjects}
        onLoadMoreSuppliers={onLoadMoreSuppliers}
        onLoadMoreCostCategories={onLoadMoreCostCategories}
        onCatalogKeywordChange={setCatalogKeyword}
        onCatalogSearch={() => {
          setCatalogPage(1);
          setAppliedCatalogKeyword(catalogKeyword.trim());
        }}
        onCatalogPageChange={setCatalogPage}
        onAdd={(item) => updateUserState(() => {
          setFacts((current) => ({
            ...current,
            [item.supplier_sku_id]: item,
          }));
          setLines((current) => [...current, {
            supplierSkuId: item.supplier_sku_id,
            costCategoryId: "",
            quantity: "1",
          }]);
          setRecentlyAddedSkuId(item.supplier_sku_id);
        })}
        onLineChange={(skuId, patch) => updateUserState(() =>
          setLines((current) => current.map((line) =>
            line.supplierSkuId === skuId ? { ...line, ...patch } : line
          )))}
        onRemove={(skuId) => updateUserState(() => {
          setLines((current) => current.filter((line) =>
            line.supplierSkuId !== skuId
          ));
          if (recentlyAddedSkuId === skuId) setRecentlyAddedSkuId(null);
        })}
        onSave={() => void saveDraft({
          projectId,
          tenantSupplierId,
          reason,
          expectedDeliveryDate,
          remark,
          expectedVersion,
          items: lines,
        })}
      />
      <ProcurementConfirmDialog
        open={Boolean(pendingContext)}
        title="更换采购范围？"
        description={`更换项目或合作供应商会清空 ${lines.length} 个已选商品。`}
        confirmLabel="清空并更换"
        onCancel={() => setPendingContext(null)}
        onConfirm={() => {
          if (pendingContext) applyContextChange(pendingContext);
          setPendingContext(null);
        }}
      />
      <ProcurementConfirmDialog
        open={confirmClose}
        title="放弃未保存的更改？"
        description="当前采购申请有尚未保存的修改，关闭后这些修改不会保留。"
        confirmLabel="放弃更改"
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          closeEditor();
        }}
      />
    </>
  );
}
