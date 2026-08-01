"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleDollarSign, PackageSearch } from "lucide-react";
import { useRouter } from "next/navigation";

import { StatusAlert } from "@/components/admin/status-alert";
import { loadTenantSupplierSettings } from "@/components/suppliers/supplier-settings-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

import { listSupplierPayableFilterOptions } from "./payable-api";
import { PayableFilters } from "./payable-filters";
import { PayableList } from "./payable-list";
import { canMergePayables, canSelectPayable } from "./payable-rules";
import { PayableSummary } from "./payable-summary";
import type {
  SupplierPayable,
  SupplierPayableFilterOption,
  SupplierPayableFilterOptionType,
} from "./payable-types";
import {
  buildPaymentRequestHref,
  initialPayableFilters,
  nextPayableRetryAttempt,
  payableLoadPolicy,
  resetPayableFilters,
  type PayableModulePreflight,
  usePayableList,
} from "./use-payable-list";

const FILTER_TYPES = ["project", "supplier", "purchase_order"] as const;
type OptionPagination = { page: number; totalPages: number };

export function PayableWorkspace({
  canView,
  canCreate,
  canReadSettings,
}: {
  canView: boolean;
  canCreate: boolean;
  canReadSettings: boolean;
}) {
  const router = useRouter();
  const [modulePreflight, setModulePreflight] =
    useState<PayableModulePreflight>("unknown");
  const [options, setOptions] = useState(emptyOptionState);
  const [optionPages, setOptionPages] = useState(emptyOptionPages);
  const [optionsReady, setOptionsReady] = useState(false);
  const [optionsRetryAttempt, setOptionsRetryAttempt] = useState(0);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [loadingMoreOptions, setLoadingMoreOptions] = useState(false);
  const [filters, setFilters] = useState(initialPayableFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const loadPolicy = payableLoadPolicy({
    canView,
    canReadSettings,
    preflight: modulePreflight,
  });
  const {
    records,
    loading,
    loadingMore,
    error,
    errorCode,
    hasLoaded,
    clear,
    reload,
    loadMore,
  } = usePayableList(loadPolicy.shouldLoadPayables, filters);

  useEffect(() => {
    if (!canView || !canReadSettings) return;
    let active = true;
    setModulePreflight("checking");
    void loadTenantSupplierSettings().then(() => {
      if (active) setModulePreflight("enabled");
    }).catch((caught) => {
      if (!active) return;
      if (requestErrorCode(caught) === "SUPPLIER_MODULE_DISABLED") {
        setModulePreflight("disabled");
      } else {
        setModulePreflight("error");
        setWorkspaceError(errorMessage(caught, "供应商模块配置加载失败"));
      }
    });
    return () => {
      active = false;
    };
  }, [canReadSettings, canView]);

  useEffect(() => {
    if (!loadPolicy.shouldLoadPayables || !hasLoaded || optionsReady) return;
    let active = true;
    setOptionsLoading(true);
    void Promise.all(FILTER_TYPES.map((type) =>
      listSupplierPayableFilterOptions({ type, page: 1, pageSize: 20 })
    )).then((results) => {
      if (!active) return;
      setOptions(Object.fromEntries(results.map((result, index) => [
        FILTER_TYPES[index],
        result.list,
      ])) as Record<SupplierPayableFilterOptionType, SupplierPayableFilterOption[]>);
      setOptionPages(Object.fromEntries(results.map((result, index) => [
        FILTER_TYPES[index],
        {
          page: result.pagination.page,
          totalPages: pageCount(result.pagination.totalPages),
        },
      ])) as Record<SupplierPayableFilterOptionType, OptionPagination>);
      setOptionsReady(true);
    }).catch((caught) => {
      if (active) {
        setWorkspaceError(errorMessage(caught, "应付筛选项加载失败"));
      }
    }).finally(() => {
      if (active) setOptionsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [
    hasLoaded,
    loadPolicy.shouldLoadPayables,
    optionsReady,
    optionsRetryAttempt,
  ]);

  const projectOptions = useMemo(
    () => withAllOption("全部项目", options.project),
    [options.project],
  );
  const supplierOptions = useMemo(
    () => withAllOption("全部供应商", options.supplier),
    [options.supplier],
  );
  const purchaseOrderOptions = useMemo(
    () => withAllOption("全部采购单", options.purchase_order),
    [options.purchase_order],
  );

  async function loadMoreFilterOptions(type: SupplierPayableFilterOptionType) {
    const currentPage = optionPages[type];
    if (loadingMoreOptions || currentPage.page >= currentPage.totalPages) return;
    setLoadingMoreOptions(true);
    try {
      const next = await listSupplierPayableFilterOptions({
        type,
        page: currentPage.page + 1,
        pageSize: 20,
      });
      setOptions((current) => ({
        ...current,
        [type]: mergeOptions(current[type], next.list),
      }));
      setOptionPages((current) => ({
        ...current,
        [type]: {
          page: next.pagination.page,
          totalPages: pageCount(next.pagination.totalPages),
        },
      }));
    } catch (caught) {
      setWorkspaceError(errorMessage(caught, "更多应付筛选项加载失败"));
    } finally {
      setLoadingMoreOptions(false);
    }
  }

  function handleFilterChange(
    patch: Parameters<typeof resetPayableFilters>[1],
  ) {
    clear();
    setSelectedIds(new Set());
    setFilters((current) => resetPayableFilters(current, patch));
  }

  function handleFilterReset() {
    clear();
    setSelectedIds(new Set());
    setFilters(initialPayableFilters);
  }

  function retryFilterOptions() {
    setWorkspaceError(null);
    setOptionsReady(false);
    setOptionsRetryAttempt(nextPayableRetryAttempt);
  }

  function togglePayable(record: SupplierPayable) {
    const hasAvailableAmount = canSelectPayable({
      available_to_request_amount: record.available_to_request_amount,
    });
    const selectionScope = {
      project_id: record.project_id,
      tenant_supplier_id: record.tenant_supplier_id,
      currency: record.currency,
    };
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.delete(record.id)) return next;
      if (!canCreate || !hasAvailableAmount || next.size >= 100) return current;
      const first = records.list.find(({ id }) => next.has(id));
      if (first && !canMergePayables(first, selectionScope)) return current;
      next.add(record.id);
      return next;
    });
  }

  if (!canView) {
    return (
      <StatusAlert>
        当前账号没有 supplier.payable.view 权限，无法查看供应商应付。
      </StatusAlert>
    );
  }
  if (modulePreflight === "checking" || (loading && !hasLoaded)) {
    return <PayableWorkspaceSkeleton />;
  }
  if (modulePreflight === "error") {
    return <StatusAlert>{workspaceError ?? "供应商模块配置加载失败"}</StatusAlert>;
  }
  const moduleDisabled = modulePreflight === "disabled" ||
    errorCode === "SUPPLIER_MODULE_DISABLED";
  if (moduleDisabled) return <DisabledModule />;

  const selectedPayables = records.list.filter(({ id }) => selectedIds.has(id));
  return (
    <PageContainer>
      <PageHeader
        title="供应商应付"
        description="按项目、供应商和到期日跟踪采购应付。"
        action={canCreate ? (
          <Button
            type="button"
            disabled={selectedPayables.length === 0}
            onClick={() => router.push(buildPaymentRequestHref(
              selectedPayables.map(({ id }) => id),
            ))}
          >
            <CircleDollarSign data-icon="inline-start" />
            创建付款申请{selectedPayables.length
              ? `（${selectedPayables.length}）`
              : ""}
          </Button>
        ) : undefined}
      />
      {!canCreate ? (
        <StatusAlert tone="warning">
          当前账号没有 supplier.payment-request.manage 权限，仅可查看应付。
        </StatusAlert>
      ) : null}
      <PayableSummary records={records.list} />
      {error ? (
        <RetryAlert
          message={error}
          label="重试加载应付"
          onRetry={() => void reload()}
        />
      ) : null}
      {workspaceError ? (
        <RetryAlert
          message={workspaceError}
          label="重试筛选项"
          onRetry={retryFilterOptions}
        />
      ) : null}
      <Card className="overflow-hidden shadow-none">
        <CardHeader className="border-b bg-muted/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>应付列表</CardTitle>
              <CardDescription>
                服务端稳定排序，每页 20 条，当前已加载 {records.list.length} / {records.pagination.total} 条。
              </CardDescription>
            </div>
            <Badge variant="outline">已选 {selectedIds.size} 条</Badge>
          </div>
          <PayableFilters
            filters={filters}
            projectOptions={projectOptions}
            supplierOptions={supplierOptions}
            purchaseOrderOptions={purchaseOrderOptions}
            loading={loading || optionsLoading}
            loadingMoreOptions={loadingMoreOptions}
            canLoadMoreProjects={hasMore(optionPages.project)}
            canLoadMoreSuppliers={hasMore(optionPages.supplier)}
            canLoadMorePurchaseOrders={hasMore(optionPages.purchase_order)}
            onChange={handleFilterChange}
            onReset={handleFilterReset}
            onLoadMoreProjects={() => void loadMoreFilterOptions("project")}
            onLoadMoreSuppliers={() => void loadMoreFilterOptions("supplier")}
            onLoadMorePurchaseOrders={() =>
              void loadMoreFilterOptions("purchase_order")}
          />
        </CardHeader>
        <CardContent className="p-0">
          <PayableList
            records={records.list}
            loading={loading}
            canCreate={canCreate}
            selectedIds={selectedIds}
            onToggle={togglePayable}
            onCreateOne={(record) =>
              router.push(buildPaymentRequestHref([record.id]))}
          />
          {records.pagination.page < records.pagination.totalPages ? (
            <div className="flex justify-center border-t p-3">
              <Button
                type="button"
                variant="outline"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? "加载中…" : "加载更多"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function DisabledModule() {
  return (
    <PageContainer>
      <PageHeader title="供应商应付" description="按项目、供应商和到期日跟踪采购应付。" />
      <Card className="flex min-h-80 items-center justify-center shadow-none">
        <CardContent className="p-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><PackageSearch /></EmptyMedia>
              <EmptyTitle>供应商模块尚未启用</EmptyTitle>
              <EmptyDescription>
                当前不会加载应付数据，请联系平台管理员启用供应商模块。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function RetryAlert({ message, label, onRetry }: {
  message: string;
  label: string;
  onRetry: () => void;
}) {
  return (
    <StatusAlert>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{message}</span>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          {label}
        </Button>
      </div>
    </StatusAlert>
  );
}

function PageContainer({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col gap-5">{children}</div>;
}

function PageHeader({ title, description, action }: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
      <div>
        <h1 className="text-xl font-semibold tracking-normal">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function PayableWorkspaceSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="min-h-80 flex-1 rounded-lg" />
    </div>
  );
}

function emptyOptionState() {
  return { project: [], supplier: [], purchase_order: [] } as Record<
    SupplierPayableFilterOptionType,
    SupplierPayableFilterOption[]
  >;
}

function emptyOptionPages() {
  const initial = { page: 1, totalPages: 1 };
  return {
    project: initial,
    supplier: initial,
    purchase_order: initial,
  } as Record<SupplierPayableFilterOptionType, OptionPagination>;
}

function withAllOption(label: string, items: SupplierPayableFilterOption[]) {
  return [{ value: "all", label }, ...items.map(({ id, label: optionLabel }) =>
    ({ value: id, label: optionLabel }))];
}

function mergeOptions(
  current: SupplierPayableFilterOption[],
  next: SupplierPayableFilterOption[],
) {
  const seen = new Set(current.map(({ id }) => id));
  return [...current, ...next.filter(({ id }) => !seen.has(id))];
}

function hasMore(pagination: OptionPagination) {
  return pagination.page < pagination.totalPages;
}

function pageCount(value: number) {
  return Math.max(1, value || 1);
}

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}

function requestErrorCode(caught: unknown) {
  if (!caught || typeof caught !== "object" || !("code" in caught)) return null;
  const code = (caught as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}
