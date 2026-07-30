"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
import {
  resolveSupplierCommandAttempt,
  type SupplierCommandAttempt,
} from "@/components/supplier-products/supplier-command-attempt";
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
  createRequisitionDraft,
  loadRequisition,
  loadRequisitionCatalog,
  loadRequisitionItems,
  updateRequisitionDraft,
} from "./requisition-api";
import {
  commandConflictMessage,
  errorCode,
  errorMessage,
  errorStatus,
  toRequisitionDraftPayload,
  validateRequisitionDraft,
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
  RequisitionCreateDraftInput,
  RequisitionRecord,
  RequisitionUpdateDraftInput,
} from "./requisition-types";

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
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState<SupplierCommandAttempt | null>(null);
  const [validation, setValidation] = useState<RequisitionDraftErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const draftRequestVersion = useRef(0);
  const catalogRequestVersion = useRef(0);
  const activeSupplierId = useRef("");

  const hydrateDraft = useCallback(async (
    targetId = record?.id ?? null,
  ) => {
    const version = ++draftRequestVersion.current;
    setConflict(null);
    setValidation({});
    setError(null);
    if (!targetId) {
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
      return "empty" as const;
    }
    setLoadingDraft(true);
    try {
      const [detail, itemPage] = await Promise.all([
        loadRequisition(targetId),
        loadRequisitionItems(targetId),
      ]);
      if (draftRequestVersion.current !== version) return null;
      const requisition = detail.requisition;
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
        quantity: Number(item.quantity),
      })));
      setFacts(Object.fromEntries(itemPage.list.map((item) => [
        item.supplier_sku_id,
        catalogFactFromRequisitionItem(item),
      ])));
      setSavedRecord(requisition);
      return requisition;
    } catch (caught) {
      if (draftRequestVersion.current === version) {
        setError(errorMessage(caught, "采购申请草稿加载失败"));
        if (errorStatus(caught) === 404) return "not_found" as const;
      }
      return null;
    } finally {
      if (draftRequestVersion.current === version) setLoadingDraft(false);
    }
  }, [record]);

  useEffect(() => {
    if (!open) {
      draftRequestVersion.current += 1;
      catalogRequestVersion.current += 1;
      return;
    }
    setCatalogPage(1);
    setAppliedCatalogKeyword("");
    void hydrateDraft();
  }, [hydrateDraft, open]);

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

  const fieldsLocked = loadingDraft || saving || attempt !== null;

  async function abandonAttempt() {
    const targetId = editingId ?? attempt?.resourceId ?? record?.id ?? null;
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
    onOpenChange(nextOpen);
  }

  async function handleSave() {
    const draft = {
      projectId,
      tenantSupplierId,
      reason,
      expectedDeliveryDate,
      remark,
      expectedVersion,
      items: lines,
    };
    const errors = validateRequisitionDraft(draft);
    setValidation(errors);
    if (Object.keys(errors).length > 0 || saving || loadingDraft) return;
    const payload = toRequisitionDraftPayload(draft);
    const scope = editingId
      ? "purchase-requisition:update"
      : "purchase-requisition:create";
    const nextAttempt = resolveSupplierCommandAttempt(attempt, {
      scope,
      resourcePath: editingId ?? "new",
      payload,
      ...(!editingId ? { allocateResourceId: true as const } : {}),
    });
    setAttempt(nextAttempt);
    setSaving(true);
    setError(null);
    setConflict(null);
    try {
      const id = editingId ?? nextAttempt.resourceId;
      if (!id) throw new Error("采购申请资源编号生成失败");
      if (editingId) {
        await updateRequisitionDraft(
          id,
          payload as RequisitionUpdateDraftInput,
          nextAttempt,
        );
      } else {
        if (!nextAttempt.resourceId) throw new Error("采购申请编号生成失败");
        await createRequisitionDraft(
          payload as RequisitionCreateDraftInput,
          { ...nextAttempt, resourceId: nextAttempt.resourceId },
        );
      }
      const [detail, itemPage] = await Promise.all([
        loadRequisition(id),
        loadRequisitionItems(id),
      ]);
      setExpectedVersion(detail.requisition.version);
      setEditingId(detail.requisition.id);
      setLines(itemPage.list.map((item) => ({
        supplierSkuId: item.supplier_sku_id,
        costCategoryId: item.cost_category_id,
        quantity: Number(item.quantity),
      })));
      setFacts(Object.fromEntries(itemPage.list.map((item) => [
        item.supplier_sku_id,
        catalogFactFromRequisitionItem(item),
      ])));
      setSavedRecord(detail.requisition);
      setAttempt(null);
      onSaved(detail.requisition);
      toast.success("采购申请草稿已保存");
    } catch (caught) {
      const nextConflict = commandConflictMessage(errorCode(caught));
      setConflict(nextConflict);
      setError(nextConflict ?? errorMessage(caught, "采购申请草稿保存失败"));
    } finally {
      setSaving(false);
    }
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
                  { supplierSkuId, costCategoryId: "", quantity: 1 },
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
          <Button type="button" disabled={saving || loadingDraft}
            onClick={() => void handleSave()}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {attempt && !saving ? "重试保存" : "保存草稿"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
