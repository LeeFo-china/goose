"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  resolveSupplierCommandAttempt,
  type SupplierCommandAttempt,
} from "@/components/supplier-products/supplier-command-attempt";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  loadPurchaseOrder,
  loadPurchaseOrderCatalog,
  loadPurchaseOrderItems,
  savePurchaseOrderDraft,
} from "./purchase-order-api";
import {
  addDraftLine,
  commandErrorMessage,
  removeDraftLine,
  replaceSavedFacts,
  setDraftLineQuantity,
  toDraftPayload,
  validatePurchaseOrderDraft,
} from "./purchase-order-rules";
import {
  catalogFactFromSnapshot,
  PurchaseOrderCatalogTable,
  PurchaseOrderSavedFacts,
  SelectedPurchaseOrderLines,
} from "./purchase-order-editor-tables";
import type {
  EditablePurchaseOrder,
  ProjectOption,
  PurchaseOrder,
  PurchaseOrderCatalogItem,
  PurchaseOrderCatalogPage,
  PurchaseOrderDraftLine,
  PurchaseOrderSupplierOption,
} from "./purchase-order-types";

const emptyCatalog: PurchaseOrderCatalogPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

export function PurchaseOrderEditor({
  open,
  order,
  projects,
  relationships,
  canLoadMoreProjects,
  canLoadMoreSuppliers,
  loadingMoreOptions,
  onLoadMoreProjects,
  onLoadMoreSuppliers,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  order: EditablePurchaseOrder;
  projects: ProjectOption[];
  relationships: PurchaseOrderSupplierOption[];
  canLoadMoreProjects: boolean;
  canLoadMoreSuppliers: boolean;
  loadingMoreOptions: boolean;
  onLoadMoreProjects: () => void;
  onLoadMoreSuppliers: () => void;
  onOpenChange: (open: boolean) => void;
  onSaved: (order: PurchaseOrder) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [tenantSupplierId, setTenantSupplierId] = useState("");
  const [expectedVersion, setExpectedVersion] = useState(0);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [remark, setRemark] = useState("");
  const [lines, setLines] = useState<PurchaseOrderDraftLine[]>([]);
  const [facts, setFacts] = useState<Record<string, PurchaseOrderCatalogItem>>(
    {},
  );
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogKeyword, setCatalogKeyword] = useState("");
  const [appliedCatalogKeyword, setAppliedCatalogKeyword] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<
    ReturnType<typeof validatePurchaseOrderDraft>
  >({});
  const [attempt, setAttempt] = useState<SupplierCommandAttempt | null>(null);
  const [savedFacts, setSavedFacts] = useState<Partial<PurchaseOrder> | null>(
    null,
  );
  const existingOrderId = order.id;

  const hydrateDraft = useCallback(async () => {
    setError(null);
    setSavedFacts(null);
    setLoadingDraft(true);
    try {
      const [latest, itemPage] = await Promise.all([
        loadPurchaseOrder(existingOrderId),
        loadPurchaseOrderItems(existingOrderId),
      ]);
      setProjectId(latest.project_id);
      setTenantSupplierId(latest.tenant_supplier_id);
      setExpectedVersion(latest.version);
      setExpectedDeliveryDate(latest.expected_delivery_date ?? "");
      setRemark(latest.remark ?? "");
      setLines(itemPage.list.map((item) => ({
        supplierSkuId: item.supplier_sku_id,
        quantity: Number(item.quantity),
      })));
      setFacts(Object.fromEntries(
        itemPage.list.map((item) => [
          item.supplier_sku_id,
          catalogFactFromSnapshot(item),
        ]),
      ));
      setSavedFacts(latest);
    } catch (caught) {
      setError(errorMessage(caught, "采购单草稿加载失败"));
    } finally {
      setLoadingDraft(false);
    }
  }, [existingOrderId]);

  useEffect(() => {
    if (!open) return;
    setAttempt(null);
    setValidation({});
    setCatalogPage(1);
    setAppliedCatalogKeyword("");
    void hydrateDraft();
  }, [hydrateDraft, open]);

  const loadCatalog = useCallback(async () => {
    if (!open || !tenantSupplierId) {
      setCatalog(emptyCatalog);
      return;
    }
    setLoadingCatalog(true);
    setError(null);
    try {
      const next = await loadPurchaseOrderCatalog(
        tenantSupplierId,
        catalogPage,
        appliedCatalogKeyword,
      );
      setCatalog(next);
      setFacts((current) => ({
        ...current,
        ...Object.fromEntries(next.list.map((item) => [
          item.supplier_sku_id,
          item,
        ])),
      }));
    } catch (caught) {
      setError(errorMessage(caught, "可采购目录加载失败"));
    } finally {
      setLoadingCatalog(false);
    }
  }, [
    appliedCatalogKeyword,
    catalogPage,
    open,
    tenantSupplierId,
  ]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const projectOptions = useMemo(
    () => projects.map((project) => ({
      value: project.id,
      label: project.name,
    })),
    [projects],
  );
  const relationshipOptions = useMemo(
    () => relationships
      .filter(({ relationship_status }) => relationship_status === "active")
      .map((relationship) => ({
        value: relationship.tenant_supplier_id,
        label: `${relationship.supplier.name} · ${relationship.supplier.code}`,
      })),
    [relationships],
  );

  async function handleSave() {
    if (savedFacts?.id !== existingOrderId) {
      setError("采购单草稿尚未加载完成");
      return;
    }
    const draft = {
      projectId,
      tenantSupplierId,
      expectedVersion,
      expectedDeliveryDate: expectedDeliveryDate || null,
      remark: remark || null,
      lines,
    };
    const errors = validatePurchaseOrderDraft(draft);
    setValidation(errors);
    if (Object.keys(errors).length > 0) return;

    const payload = toDraftPayload(draft);
    const nextAttempt = resolveSupplierCommandAttempt(attempt, {
      scope: "purchase-order:save",
      resourcePath: existingOrderId,
      payload,
    });
    setAttempt(nextAttempt);
    setSaving(true);
    setError(null);
    try {
      await savePurchaseOrderDraft(
        existingOrderId,
        payload,
        nextAttempt.idempotencyKey,
      );
      const [latest, itemPage] = await Promise.all([
        loadPurchaseOrder(existingOrderId),
        loadPurchaseOrderItems(existingOrderId),
      ]);
      setExpectedVersion(latest.version);
      setLines(itemPage.list.map((item) => ({
        supplierSkuId: item.supplier_sku_id,
        quantity: Number(item.quantity),
      })));
      setFacts(Object.fromEntries(
        itemPage.list.map((item) => [
          item.supplier_sku_id,
          catalogFactFromSnapshot(item),
        ]),
      ));
      setSavedFacts(replaceSavedFacts(null, latest));
      setAttempt(null);
      onSaved(latest);
      toast.success("采购单草稿已保存");
    } catch (caught) {
      const code = errorCode(caught);
      setError(commandErrorMessage(
        code,
        errorMessage(caught, "采购单草稿保存失败"),
      ));
      if (code === "SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT") {
        await hydrateDraft();
      }
    } finally {
      setSaving(false);
    }
  }

  const totalCatalogPages = Math.max(
    1,
    catalog.pagination.totalPages || 1,
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑采购单草稿</DialogTitle>
          <DialogDescription>
            复核申请生成的项目与供应商，并按当前有效价格调整商品和交期。
          </DialogDescription>
        </DialogHeader>
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field data-invalid={Boolean(validation.projectId)}>
            <FieldLabel htmlFor="purchase-order-project">项目</FieldLabel>
            <FormSelect
              id="purchase-order-project"
              value={projectId}
              options={projectOptions}
              disabled={loadingDraft || expectedVersion > 0}
              invalid={Boolean(validation.projectId)}
              onChange={setProjectId}
            />
            {canLoadMoreProjects ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loadingMoreOptions}
                onClick={onLoadMoreProjects}
              >
                加载更多项目
              </Button>
            ) : null}
            <FieldError>{validation.projectId}</FieldError>
          </Field>
          <Field data-invalid={Boolean(validation.tenantSupplierId)}>
            <FieldLabel htmlFor="purchase-order-supplier">
              合作供应商
            </FieldLabel>
            <FormSelect
              id="purchase-order-supplier"
              value={tenantSupplierId}
              options={relationshipOptions}
              disabled={loadingDraft || expectedVersion > 0}
              invalid={Boolean(validation.tenantSupplierId)}
              onChange={(value) => {
                setTenantSupplierId(value);
                setLines([]);
                setFacts({});
                setCatalogPage(1);
              }}
            />
            {canLoadMoreSuppliers ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loadingMoreOptions}
                onClick={onLoadMoreSuppliers}
              >
                加载更多合作供应商
              </Button>
            ) : null}
            <FieldError>{validation.tenantSupplierId}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="purchase-order-delivery">
              预计交付日期
            </FieldLabel>
            <Input
              id="purchase-order-delivery"
              type="date"
              value={expectedDeliveryDate}
              onChange={(event) => setExpectedDeliveryDate(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="purchase-order-remark">备注</FieldLabel>
            <Textarea
              id="purchase-order-remark"
              value={remark}
              maxLength={1000}
              onChange={(event) => setRemark(event.target.value)}
            />
          </Field>
        </FieldGroup>
        {savedFacts ? <PurchaseOrderSavedFacts facts={savedFacts} /> : null}
        <SelectedPurchaseOrderLines
          lines={lines}
          facts={facts}
          error={validation.lines}
          disabled={saving || loadingDraft}
          onQuantityChange={(skuId, quantity) =>
            setLines((current) =>
              setDraftLineQuantity(current, skuId, quantity)
            )}
          onRemove={(skuId) =>
            setLines((current) => removeDraftLine(current, skuId))}
        />
        <div className="flex flex-col gap-3 rounded-md border p-3">
          <div className="flex flex-col justify-between gap-2 md:flex-row">
            <Input
              aria-label="搜索可采购目录"
              value={catalogKeyword}
              placeholder="搜索商品或 SKU 编码"
              onChange={(event) => setCatalogKeyword(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={loadingCatalog || !tenantSupplierId}
              onClick={() => {
                setCatalogPage(1);
                setAppliedCatalogKeyword(catalogKeyword.trim());
              }}
            >
              搜索目录
            </Button>
          </div>
          <PurchaseOrderCatalogTable
            items={catalog.list}
            selectedSkuIds={new Set(lines.map((line) => line.supplierSkuId))}
            loading={loadingCatalog}
            onAdd={(item) => {
              setFacts((current) => ({
                ...current,
                [item.supplier_sku_id]: item,
              }));
              try {
                setLines((current) =>
                  addDraftLine(current, item.supplier_sku_id)
                );
              } catch (caught) {
                setError(errorMessage(caught, "目录商品添加失败"));
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              第 {catalog.pagination.page} / {totalCatalogPages} 页，共{" "}
              {catalog.pagination.total} 个 SKU
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={catalogPage <= 1 || loadingCatalog}
                onClick={() => setCatalogPage((page) => Math.max(1, page - 1))}
              >
                上一页
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={catalogPage >= totalCatalogPages || loadingCatalog}
                onClick={() => setCatalogPage((page) => page + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
          <Button
            type="button"
            disabled={
              saving ||
              loadingDraft ||
              savedFacts?.id !== existingOrderId
            }
            onClick={handleSave}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            保存草稿
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error &&
      typeof error.code === "string"
    ? error.code
    : undefined;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
