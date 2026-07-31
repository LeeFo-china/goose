"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleDollarSign, PackageSearch } from "lucide-react";
import { useRouter } from "next/navigation";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  loadPurchaseOrderProjects,
  loadPurchaseOrderRelationships,
} from "@/components/supplier-purchase-orders/purchase-order-api";
import type {
  ProjectOption,
  PurchaseOrderSupplierOption,
} from "@/components/supplier-purchase-orders/purchase-order-types";
import { loadTenantSupplierSettings } from "@/components/suppliers/supplier-settings-api";
import type { TenantSupplierSettings } from "@/components/suppliers/supplier-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

import { PayableFilters } from "./payable-filters";
import { PayableList } from "./payable-list";
import { canMergePayables, canSelectPayable } from "./payable-rules";
import { PayableSummary } from "./payable-summary";
import type { SupplierPayable } from "./payable-types";
import {
  buildPaymentRequestHref,
  initialPayableFilters,
  resetPayableFilters,
  usePayableList,
} from "./use-payable-list";

const disabledModule: TenantSupplierSettings = {
  tenant_id: "",
  module_enabled: false,
  require_active_contract_for_new_order: false,
  enabled_by_employee_id: null,
  enabled_at: null,
  version: 0,
  created_at: "",
  updated_at: "",
};

export function PayableWorkspace({
  canView,
  canCreate,
  canReadSettings,
  canViewPurchaseOrders,
}: {
  canView: boolean;
  canCreate: boolean;
  canReadSettings: boolean;
  canViewPurchaseOrders: boolean;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<TenantSupplierSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [loadingMoreOptions, setLoadingMoreOptions] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [suppliers, setSuppliers] = useState<PurchaseOrderSupplierOption[]>([]);
  const [projectPage, setProjectPage] = useState(1);
  const [projectTotalPages, setProjectTotalPages] = useState(1);
  const [supplierPage, setSupplierPage] = useState(1);
  const [supplierTotalPages, setSupplierTotalPages] = useState(1);
  const [filters, setFilters] = useState(initialPayableFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const moduleEnabled = settings?.module_enabled === true;
  const canLoad = canView && canReadSettings && moduleEnabled;
  const canLoadOptions = canLoad && canViewPurchaseOrders;
  const { records, loading, loadingMore, error, loadMore } =
    usePayableList(canLoad, filters);

  useEffect(() => {
    if (!canView || !canReadSettings) {
      setSettingsLoading(false);
      return;
    }
    let active = true;
    setSettingsLoading(true);
    void loadTenantSupplierSettings().then((next) => {
      if (active) setSettings(next);
    }).catch((caught) => {
      if (!active) return;
      if ((caught as { code?: string }).code === "SUPPLIER_MODULE_DISABLED") {
        setSettings(disabledModule);
      } else {
        setWorkspaceError(errorMessage(caught, "供应商模块配置加载失败"));
      }
    }).finally(() => {
      if (active) setSettingsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [canReadSettings, canView]);

  useEffect(() => {
    if (!canLoadOptions) return;
    let active = true;
    setOptionsLoading(true);
    void Promise.all([
      loadPurchaseOrderProjects(1),
      loadPurchaseOrderRelationships(1),
    ]).then(([projectResult, supplierResult]) => {
      if (!active) return;
      setProjects(projectResult.list);
      setProjectPage(projectResult.pagination.page);
      setProjectTotalPages(pageCount(projectResult.pagination.totalPages));
      setSuppliers(supplierResult.list);
      setSupplierPage(supplierResult.pagination.page);
      setSupplierTotalPages(pageCount(supplierResult.pagination.totalPages));
    }).catch((caught) => {
      if (active) setWorkspaceError(errorMessage(caught, "应付筛选项加载失败"));
    }).finally(() => {
      if (active) setOptionsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [canLoadOptions]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    filters.dueFrom,
    filters.dueTo,
    filters.projectId,
    filters.status,
    filters.tenantSupplierId,
  ]);

  const projectOptions = useMemo(() => [
    { value: "all", label: "全部项目" },
    ...projects.map(({ id, name }) => ({ value: id, label: name })),
  ], [projects]);
  const supplierOptions = useMemo(() => [
    { value: "all", label: "全部供应商" },
    ...suppliers.map(({ tenant_supplier_id, supplier }) => ({
      value: tenant_supplier_id,
      label: supplier.name,
    })),
  ], [suppliers]);
  const projectNames = useMemo(
    () => Object.fromEntries(projects.map(({ id, name }) => [id, name])),
    [projects],
  );
  const supplierNames = useMemo(
    () => Object.fromEntries(suppliers.map(({ tenant_supplier_id, supplier }) =>
      [tenant_supplier_id, supplier.name]
    )),
    [suppliers],
  );

  async function loadMoreProjects() {
    if (loadingMoreOptions || projectPage >= projectTotalPages) return;
    setLoadingMoreOptions(true);
    try {
      const next = await loadPurchaseOrderProjects(projectPage + 1);
      setProjects((current) => mergeBy(current, next.list, "id"));
      setProjectPage(next.pagination.page);
      setProjectTotalPages(pageCount(next.pagination.totalPages));
    } catch (caught) {
      setWorkspaceError(errorMessage(caught, "更多项目筛选项加载失败"));
    } finally {
      setLoadingMoreOptions(false);
    }
  }

  async function loadMoreSuppliers() {
    if (loadingMoreOptions || supplierPage >= supplierTotalPages) return;
    setLoadingMoreOptions(true);
    try {
      const next = await loadPurchaseOrderRelationships(supplierPage + 1);
      setSuppliers((current) =>
        mergeBy(current, next.list, "tenant_supplier_id")
      );
      setSupplierPage(next.pagination.page);
      setSupplierTotalPages(pageCount(next.pagination.totalPages));
    } catch (caught) {
      setWorkspaceError(errorMessage(caught, "更多供应商筛选项加载失败"));
    } finally {
      setLoadingMoreOptions(false);
    }
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
      if (!canCreate || !hasAvailableAmount || next.size >= 100) {
        return current;
      }
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
  if (!canReadSettings) {
    return (
      <StatusAlert>
        当前账号没有 supplier.view 权限，无法确认供应商模块状态。
      </StatusAlert>
    );
  }
  if (settingsLoading) return <PayableWorkspaceSkeleton />;
  if (!settings) {
    return <StatusAlert>{workspaceError ?? "供应商模块配置加载失败"}</StatusAlert>;
  }
  if (!settings.module_enabled) {
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
            创建付款申请{selectedPayables.length ? `（${selectedPayables.length}）` : ""}
          </Button>
        ) : undefined}
      />
      {!canCreate ? (
        <StatusAlert tone="warning">
          当前账号没有 supplier.payment-request.manage 权限，仅可查看应付。
        </StatusAlert>
      ) : null}
      <PayableSummary records={records.list} />
      {workspaceError || error ? (
        <StatusAlert>{workspaceError ?? error}</StatusAlert>
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
            loading={loading || optionsLoading}
            loadingMoreOptions={loadingMoreOptions}
            canLoadMoreProjects={projectPage < projectTotalPages}
            canLoadMoreSuppliers={supplierPage < supplierTotalPages}
            onChange={(patch) =>
              setFilters((current) => resetPayableFilters(current, patch))}
            onReset={() => setFilters(initialPayableFilters)}
            onLoadMoreProjects={() => void loadMoreProjects()}
            onLoadMoreSuppliers={() => void loadMoreSuppliers()}
          />
        </CardHeader>
        <CardContent className="p-0">
          <PayableList
            records={records.list}
            loading={loading}
            canCreate={canCreate}
            selectedIds={selectedIds}
            projectNames={projectNames}
            supplierNames={supplierNames}
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

function pageCount(value: number) {
  return Math.max(1, value || 1);
}

function mergeBy<T, Key extends keyof T>(current: T[], next: T[], key: Key) {
  const seen = new Set(current.map((item) => item[key]));
  return [...current, ...next.filter((item) => !seen.has(item[key]))];
}

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}
