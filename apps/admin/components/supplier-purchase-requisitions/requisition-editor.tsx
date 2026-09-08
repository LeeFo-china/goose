"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { procurementSummary } from "@/components/supplier-procurement-editor/procurement-editor-rules";
import type { PurchaseOrderCatalogItem } from "@/components/supplier-purchase-orders/purchase-order-types";
import { loadRequisition, loadRequisitionItems } from "./requisition-api";
import { catalogFactFromRequisitionItem } from "./requisition-editor-lines";
import { RequisitionEditorConfirmations } from "./requisition-editor-parts";
import {
  canUseRequisitionHydration,
  createRequisitionRequestAuthority,
  isAbortError,
} from "./requisition-request-authority";
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
import { useRequisitionCatalog } from "./use-requisition-catalog";
import { useRequisitionDraftSave } from "./use-requisition-draft-save";
const RECENTLY_ADDED_FEEDBACK_MS = 1_600;
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
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draftLoadFailed, setDraftLoadFailed] = useState(false);
  const [validation, setValidation] = useState<RequisitionDraftErrors>({});
  const [dirty, setDirty] = useState(false);
  const [pendingContext, setPendingContext] =
    useState<RequisitionContextChange | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [recentlyAddedSkuId, setRecentlyAddedSkuId] = useState<string | null>(
    null,
  );
  const draftRequestVersion = useRef(0);
  const draftRequests = useRef(createRequisitionRequestAuthority()).current;
  const activeDraftId = useRef<string | null>(null);
  const localDraftId = useRef<string | null>(null);
  const recordId = record?.id ?? null;
  const mergeCatalogFacts = useCallback((items: PurchaseOrderCatalogItem[]) => {
    setFacts((current) => ({
      ...current,
      ...Object.fromEntries(items.map((item) => [item.supplier_sku_id, item])),
    }));
  }, []);
  const {
    catalog,
    page: catalogPage,
    keyword: catalogKeyword,
    loading: loadingCatalog,
    error: catalogError,
    setKeyword: setCatalogKeyword,
    setPage: setCatalogPage,
    search: searchCatalog,
    retry: retryCatalog,
    reset: resetCatalog,
    abort: abortCatalog,
  } = useRequisitionCatalog({
    open,
    tenantSupplierId,
    onLoaded: mergeCatalogFacts,
  });
  const clearHydratedDraft = useCallback(() => {
    activeDraftId.current = null;
    localDraftId.current = null;
    setEditingId(null);
    setProjectId("");
    setTenantSupplierId("");
    setReason("");
    setExpectedDeliveryDate("");
    setRemark("");
    setExpectedVersion(0);
    setLines([]);
    setFacts({});
    setSavedRecord(null);
    setDirty(false);
    setRecentlyAddedSkuId(null);
    resetCatalog();
  }, [resetCatalog]);
  const draftReady = canUseRequisitionHydration(
    recordId ?? localDraftId.current,
    activeDraftId.current,
    draftLoadFailed,
  );
  const applyLoadedDraft = useCallback(
    (detail: RequisitionDetail, itemPage: RequisitionItemPage) => {
      const requisition = detail.requisition;
      activeDraftId.current = requisition.id;
      setEditingId(requisition.id);
      setProjectId(requisition.project_id);
      setTenantSupplierId(requisition.tenant_supplier_id);
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
      setDraftLoadFailed(false);
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
    draftReady,
    onValidation: setValidation,
    onCommandAccepted: (requisition) => {
      activeDraftId.current = requisition.id;
      if (!editingId) localDraftId.current = requisition.id;
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
      draftRequests.invalidate();
      const version = ++draftRequestVersion.current;
      setConflict(null);
      setValidation({});
      setError(null);
      setDraftLoadFailed(false);
      if (!targetId) {
        setLoadingDraft(false);
        clearHydratedDraft();
        setRefreshRequired(false);
        return "empty" as const;
      }
      if (targetId !== activeDraftId.current) {
        setRefreshRequired(false);
        clearHydratedDraft();
      }
      const request = draftRequests.begin();
      setLoadingDraft(true);
      try {
        const [detail, itemPage] = await Promise.all([
          loadRequisition(targetId, request.controller.signal),
          loadRequisitionItems(targetId, 1, 100, request.controller.signal),
        ]);
        if (
          !draftRequests.isCurrent(request) ||
          draftRequestVersion.current !== version
        ) return null;
        applyLoadedDraft(detail, itemPage);
        setRefreshRequired(false);
        return detail.requisition;
      } catch (caught) {
        if (isAbortError(caught) || !draftRequests.isCurrent(request)) {
          return null;
        }
        if (draftRequestVersion.current === version) {
          setDraftLoadFailed(true);
          setError(errorMessage(caught, "采购申请草稿加载失败"));
          if (errorStatus(caught) === 404) return "not_found" as const;
        }
        return null;
      } finally {
        if (
          draftRequests.isCurrent(request) &&
          draftRequestVersion.current === version
        ) setLoadingDraft(false);
      }
    },
    [
      applyLoadedDraft,
      clearHydratedDraft,
      draftRequests,
      recordId,
      setConflict,
      setError,
      setRefreshRequired,
      resetCatalog,
    ],
  );
  useEffect(() => {
    if (!open) {
      draftRequests.invalidate();
      abortCatalog();
      draftRequestVersion.current += 1;
      setLoadingDraft(false);
      activeDraftId.current = null;
      invalidateRefresh();
      return;
    }
    if (attempt) return;
    if (recordId && recordId === activeDraftId.current) return;
    void hydrateDraft();
  }, [
    attempt,
    abortCatalog,
    draftRequests,
    hydrateDraft,
    invalidateRefresh,
    open,
    recordId,
  ]);
  useEffect(() => () => {
    draftRequests.invalidate();
    abortCatalog();
  }, [abortCatalog, draftRequests]);
  useEffect(() => {
    if (!recentlyAddedSkuId) return;
    const timeout = window.setTimeout(
      () => setRecentlyAddedSkuId(null),
      RECENTLY_ADDED_FEEDBACK_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [recentlyAddedSkuId]);
  const fieldsLocked =
    loadingDraft || refreshing || saving || attempt !== null ||
    refreshRequired || !draftReady;
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
      draftRequests.invalidate();
      draftRequestVersion.current += 1;
      if (change.kind === "project") setProjectId(change.value);
      else {
        setTenantSupplierId(change.value);
      }
      resetCatalog();
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
    if (saving || attempt) return;
    draftRequests.invalidate();
    abortCatalog();
    invalidateRefresh();
    onOpenChange(false);
  }
  function requestClose() {
    if (saving || attempt) return;
    if (!dirty) {
      closeEditor();
      return;
    }
    setConfirmClose(true);
  }
  return (
    <>
      <RequisitionEditorWorkbench
        open={open}
        editingId={
          attempt ? (attempt.resourceId ?? editingId) : (recordId ?? editingId)
        }
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
        catalogError={catalogError}
        loadingCatalog={loadingCatalog}
        loadingDraft={loadingDraft}
        draftLoadFailed={draftLoadFailed}
        draftReady={draftReady}
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
        onRetryLoad={() => void hydrateDraft(recordId)}
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
        onCatalogSearch={searchCatalog}
        onCatalogPageChange={setCatalogPage}
        onRetryCatalog={() => void retryCatalog()}
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
      <RequisitionEditorConfirmations
        contextOpen={Boolean(pendingContext)}
        lineCount={lines.length}
        closeOpen={confirmClose}
        onCancelContext={() => setPendingContext(null)}
        onConfirmContext={() => {
          if (pendingContext) applyContextChange(pendingContext);
          setPendingContext(null);
        }}
        onCancelClose={() => setConfirmClose(false)}
        onConfirmClose={() => {
          setConfirmClose(false);
          if (saving || attempt) return;
          closeEditor();
        }}
      />
    </>
  );
}
