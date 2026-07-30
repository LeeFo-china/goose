"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { StatusAlert } from "@/components/admin/status-alert";
import type {
  FinanceCostCategoryRecord,
} from "@/components/finance/finance-cost-budget-requests";
import type {
  ProjectOption,
  PurchaseOrderSupplierOption,
} from "@/components/supplier-purchase-orders/purchase-order-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import {
  loadRequisitionCostCategories,
  loadRequisitionProjects,
  loadRequisitionRelationships,
} from "./requisition-api";
import { RequisitionDetail } from "./requisition-detail";
import { RequisitionEditor } from "./requisition-editor";
import { RequisitionFilters } from "./requisition-filters";
import { RequisitionList } from "./requisition-list";
import {
  buildRequisitionWorkspaceHref,
  errorMessage,
  readRequisitionWorkspaceState,
} from "./requisition-page-utils";
import type {
  RequisitionAction,
  RequisitionRecord,
} from "./requisition-types";
import { useRequisitionList } from "./use-requisition-list";

const emptyCostCategoryPage = {
  list: [],
  pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
};

export function RequisitionWorkspace({
  canView,
  canManage,
  canApprove,
  canManageBudget,
  canViewPurchaseOrders,
  currentEmployeeId,
}: {
  canView: boolean;
  canManage: boolean;
  canApprove: boolean;
  canManageBudget: boolean;
  canViewPurchaseOrders: boolean;
  currentEmployeeId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlState = useMemo(
    () => readRequisitionWorkspaceState(searchParams),
    [searchParams],
  );
  const [keyword, setKeyword] = useState(urlState.keyword);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [relationships, setRelationships] = useState<
    PurchaseOrderSupplierOption[]
  >([]);
  const [costCategories, setCostCategories] = useState<
    FinanceCostCategoryRecord[]
  >([]);
  const [projectPage, setProjectPage] = useState(1);
  const [projectTotalPages, setProjectTotalPages] = useState(1);
  const [supplierPage, setSupplierPage] = useState(1);
  const [supplierTotalPages, setSupplierTotalPages] = useState(1);
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryTotalPages, setCategoryTotalPages] = useState(1);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingMoreOptions, setLoadingMoreOptions] = useState(false);
  const [optionError, setOptionError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorRecord, setEditorRecord] =
    useState<RequisitionRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] =
    useState<RequisitionRecord | null>(null);
  const [initialAction, setInitialAction] =
    useState<Exclude<RequisitionAction, "edit"> | null>(null);
  const {
    records,
    loading: loadingRecords,
    error: listError,
    reload: loadRecords,
  } = useRequisitionList(canView, urlState);

  useEffect(() => {
    setKeyword(urlState.keyword);
  }, [urlState.keyword]);

  useEffect(() => {
    if (!canView) {
      setLoadingOptions(false);
      return;
    }
    let active = true;
    setLoadingOptions(true);
    setOptionError(null);
    void Promise.all([
      loadRequisitionProjects(1),
      loadRequisitionRelationships(1),
      canManage ? loadRequisitionCostCategories(1) : emptyCostCategoryPage,
    ]).then(([projectResult, supplierResult, categoryResult]) => {
      if (!active) return;
      setProjects(projectResult.list);
      setProjectPage(projectResult.pagination.page);
      setProjectTotalPages(pageCount(projectResult.pagination.totalPages));
      setRelationships(supplierResult.list);
      setSupplierPage(supplierResult.pagination.page);
      setSupplierTotalPages(pageCount(supplierResult.pagination.totalPages));
      setCostCategories(categoryResult.list);
      setCategoryPage(categoryResult.pagination.page);
      setCategoryTotalPages(pageCount(categoryResult.pagination.totalPages));
    }).catch((caught) => {
      if (active) {
        setOptionError(errorMessage(caught, "采购申请选项加载失败"));
      }
    }).finally(() => {
      if (active) setLoadingOptions(false);
    });
    return () => {
      active = false;
    };
  }, [canManage, canView]);

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      if (canManage) {
        setEditorRecord(null);
        setEditorOpen(true);
      } else {
        setOptionError("当前账号没有采购申请管理权限，无法发起采购申请。");
      }
      router.replace(buildRequisitionWorkspaceHref(urlState));
    }
  }, [canManage, router, searchParams, urlState]);

  function navigate(
    patch: Partial<typeof urlState>,
    resetPage = true,
  ) {
    router.push(buildRequisitionWorkspaceHref({
      ...urlState,
      ...patch,
      page: resetPage ? 1 : patch.page ?? urlState.page,
    }));
  }

  async function loadMoreProjects() {
    if (loadingMoreOptions || projectPage >= projectTotalPages) return;
    setLoadingMoreOptions(true);
    try {
      const result = await loadRequisitionProjects(projectPage + 1);
      setProjects((current) => mergeBy(current, result.list, "id"));
      setProjectPage(result.pagination.page);
      setProjectTotalPages(pageCount(result.pagination.totalPages));
    } catch (caught) {
      setOptionError(errorMessage(caught, "更多项目加载失败"));
    } finally {
      setLoadingMoreOptions(false);
    }
  }

  async function loadMoreSuppliers() {
    if (loadingMoreOptions || supplierPage >= supplierTotalPages) return;
    setLoadingMoreOptions(true);
    try {
      const result = await loadRequisitionRelationships(supplierPage + 1);
      setRelationships((current) =>
        mergeBy(current, result.list, "tenant_supplier_id")
      );
      setSupplierPage(result.pagination.page);
      setSupplierTotalPages(pageCount(result.pagination.totalPages));
    } catch (caught) {
      setOptionError(errorMessage(caught, "更多合作供应商加载失败"));
    } finally {
      setLoadingMoreOptions(false);
    }
  }

  async function loadMoreCostCategories() {
    if (loadingMoreOptions || categoryPage >= categoryTotalPages) return;
    setLoadingMoreOptions(true);
    try {
      const result = await loadRequisitionCostCategories(categoryPage + 1);
      setCostCategories((current) => mergeBy(current, result.list, "id"));
      setCategoryPage(result.pagination.page);
      setCategoryTotalPages(pageCount(result.pagination.totalPages));
    } catch (caught) {
      setOptionError(errorMessage(caught, "更多成本分类加载失败"));
    } finally {
      setLoadingMoreOptions(false);
    }
  }

  const projectNames = useMemo(
    () => Object.fromEntries(projects.map((item) => [item.id, item.name])),
    [projects],
  );
  const supplierNames = useMemo(
    () => Object.fromEntries(relationships.map((item) => [
      item.tenant_supplier_id,
      item.supplier.name,
    ])),
    [relationships],
  );
  const projectOptions = useMemo(() => [
    { value: "all", label: "全部项目" },
    ...projects.map((item) => ({ value: item.id, label: item.name })),
  ], [projects]);
  const supplierOptions = useMemo(() => [
    { value: "all", label: "全部供应商" },
    ...relationships.map((item) => ({
      value: item.tenant_supplier_id,
      label: item.supplier.name,
    })),
  ], [relationships]);

  if (!canView) {
    return (
      <StatusAlert>
        当前账号没有 supplier.purchase-requisition.view 权限，无法查看采购申请。
      </StatusAlert>
    );
  }
  if (loadingOptions) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="min-h-80 flex-1 rounded-lg" />
      </div>
    );
  }

  const totalPages = pageCount(records.pagination.totalPages);
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-xl font-semibold tracking-normal">采购申请</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            项目临时采购、预算预占与审批。当前筛选共{" "}
            {records.pagination.total} 条申请。
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            onClick={() => {
              setEditorRecord(null);
              setEditorOpen(true);
            }}
          >
            <ClipboardPlus data-icon="inline-start" />
            发起采购申请
          </Button>
        ) : null}
      </div>
      {!canManage && !canApprove ? (
        <p className="shrink-0 text-sm text-muted-foreground">
          当前账号仅可查看采购申请，修改与审批操作已隐藏。
        </p>
      ) : null}
      {optionError || listError ? (
        <StatusAlert>{optionError ?? listError}</StatusAlert>
      ) : null}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b bg-muted/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">申请列表</CardTitle>
              <CardDescription>
                所有筛选均由服务端分页执行，每页 20 条。
              </CardDescription>
            </div>
            <Badge variant="outline">共 {records.pagination.total} 条</Badge>
          </div>
          <RequisitionFilters
            keyword={keyword}
            status={urlState.status}
            budgetStatus={urlState.budgetStatus}
            projectId={urlState.projectId}
            tenantSupplierId={urlState.tenantSupplierId}
            projectOptions={projectOptions}
            supplierOptions={supplierOptions}
            loading={loadingRecords}
            loadingMore={loadingMoreOptions}
            canLoadMoreProjects={projectPage < projectTotalPages}
            canLoadMoreSuppliers={supplierPage < supplierTotalPages}
            onKeywordChange={setKeyword}
            onSearch={() => navigate({ keyword: keyword.trim() })}
            onStatusChange={(status) => navigate({ status })}
            onBudgetStatusChange={(budgetStatus) =>
              navigate({ budgetStatus })}
            onProjectChange={(projectId) => navigate({ projectId })}
            onSupplierChange={(tenantSupplierId) =>
              navigate({ tenantSupplierId })}
            onPendingApproval={() =>
              navigate({ status: "pending_approval" })}
            onLoadMoreProjects={() => void loadMoreProjects()}
            onLoadMoreSuppliers={() => void loadMoreSuppliers()}
          />
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <RequisitionList
              records={records.list}
              loading={loadingRecords}
              projectNames={projectNames}
              supplierNames={supplierNames}
              currentEmployeeId={currentEmployeeId}
              canManage={canManage}
              canApprove={canApprove}
              canManageBudget={canManageBudget}
              onOpen={(record) => {
                setInitialAction(null);
                setDetailRecord(record);
                setDetailOpen(true);
              }}
              onAction={(record, action) => {
                if (action === "edit") {
                  setEditorRecord(record);
                  setEditorOpen(true);
                  return;
                }
                setInitialAction(action);
                setDetailRecord(record);
                setDetailOpen(true);
              }}
            />
          </div>
          <Separator />
          <div className="shrink-0 flex flex-col gap-3 bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <span className="text-sm tabular-nums text-muted-foreground">
              第 {records.pagination.page} / {totalPages} 页，当前显示{" "}
              {records.list.length} 条
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={urlState.page <= 1 || loadingRecords}
                onClick={() =>
                  navigate({ page: Math.max(1, urlState.page - 1) }, false)}
              >
                上一页
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={urlState.page >= totalPages || loadingRecords}
                onClick={() =>
                  navigate({ page: urlState.page + 1 }, false)}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      {canManage ? (
        <RequisitionEditor
          open={editorOpen}
          record={editorRecord}
          projects={projects}
          relationships={relationships}
          costCategories={costCategories}
          canLoadMoreProjects={projectPage < projectTotalPages}
          canLoadMoreSuppliers={supplierPage < supplierTotalPages}
          canLoadMoreCostCategories={categoryPage < categoryTotalPages}
          loadingMoreOptions={loadingMoreOptions}
          onLoadMoreProjects={() => void loadMoreProjects()}
          onLoadMoreSuppliers={() => void loadMoreSuppliers()}
          onLoadMoreCostCategories={() => void loadMoreCostCategories()}
          onOpenChange={setEditorOpen}
          onSaved={(saved) => {
            setEditorRecord(saved);
            void loadRecords();
          }}
        />
      ) : null}
      <RequisitionDetail
        open={detailOpen}
        record={detailRecord}
        projectName={detailRecord
          ? projectNames[detailRecord.project_id]
          : undefined}
        supplierName={detailRecord
          ? supplierNames[detailRecord.tenant_supplier_id]
          : undefined}
        costCategories={costCategories}
        currentEmployeeId={currentEmployeeId}
        canManage={canManage}
        canApprove={canApprove}
        canManageBudget={canManageBudget}
        canViewPurchaseOrders={canViewPurchaseOrders}
        initialAction={initialAction}
        onInitialActionConsumed={() => setInitialAction(null)}
        onOpenChange={(nextOpen) => {
          setDetailOpen(nextOpen);
          if (!nextOpen) setInitialAction(null);
        }}
        onEdit={(editable) => {
          setDetailOpen(false);
          setEditorRecord(editable);
          setEditorOpen(true);
        }}
        onChanged={(changed) => {
          setDetailRecord(changed);
          void loadRecords();
        }}
      />
    </div>
  );
}

function pageCount(value: number) {
  return Math.max(1, value || 1);
}

function mergeBy<T, Key extends keyof T>(
  current: T[],
  incoming: T[],
  key: Key,
) {
  const merged = new Map(current.map((item) => [item[key], item]));
  incoming.forEach((item) => merged.set(item[key], item));
  return [...merged.values()];
}
