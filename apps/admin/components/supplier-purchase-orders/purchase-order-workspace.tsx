"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardPlus, Search } from "lucide-react";

import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import {
  loadPurchaseOrderProjects,
  loadPurchaseOrderRelationships,
  loadPurchaseOrders,
} from "./purchase-order-api";
import { PurchaseOrderDetail } from "./purchase-order-detail";
import { PurchaseOrderEditor } from "./purchase-order-editor";
import { PurchaseOrderList } from "./purchase-order-list";
import type {
  ProjectOption,
  PurchaseOrderPage,
  PurchaseOrderWithReferences,
  TenantSupplierRelationship,
} from "./purchase-order-types";

const emptyOrders: PurchaseOrderPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};
const statusOptions = [
  { value: "all", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "submitted", label: "已提交" },
  { value: "cancelled", label: "已取消" },
];

export function PurchaseOrderWorkspace({
  canViewPurchaseOrders,
  canManagePurchaseOrders,
}: {
  canViewPurchaseOrders: boolean;
  canManagePurchaseOrders: boolean;
}) {
  const [orders, setOrders] = useState(emptyOrders);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [relationships, setRelationships] = useState<
    TenantSupplierRelationship[]
  >([]);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [tenantSupplierId, setTenantSupplierId] = useState("all");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorOrder, setEditorOrder] =
    useState<PurchaseOrderWithReferences | null>(null);
  const [newOrderId, setNewOrderId] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailOrder, setDetailOrder] =
    useState<PurchaseOrderWithReferences | null>(null);

  useEffect(() => {
    if (!canViewPurchaseOrders) {
      setLoadingOptions(false);
      return;
    }
    let active = true;
    void Promise.all([
      loadPurchaseOrderProjects(),
      loadPurchaseOrderRelationships(),
    ]).then(([projectOptions, relationshipPage]) => {
      if (!active) return;
      setProjects(projectOptions);
      setRelationships(relationshipPage.list);
    }).catch((caught) => {
      if (active) setError(errorMessage(caught, "采购单选项加载失败"));
    }).finally(() => {
      if (active) setLoadingOptions(false);
    });
    return () => {
      active = false;
    };
  }, [canViewPurchaseOrders]);

  const loadOrders = useCallback(async () => {
    if (!canViewPurchaseOrders) return;
    setLoadingOrders(true);
    setError(null);
    try {
      setOrders(await loadPurchaseOrders(page, {
        ...(appliedKeyword ? { keyword: appliedKeyword } : {}),
        ...(status !== "all" ? { status } : {}),
        ...(projectId !== "all" ? { projectId } : {}),
        ...(tenantSupplierId !== "all" ? { tenantSupplierId } : {}),
      }));
    } catch (caught) {
      setError(errorMessage(caught, "采购单加载失败"));
    } finally {
      setLoadingOrders(false);
    }
  }, [
    appliedKeyword,
    canViewPurchaseOrders,
    page,
    projectId,
    status,
    tenantSupplierId,
  ]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const projectOptions = useMemo(() => [
    { value: "all", label: "全部项目" },
    ...projects.map((project) => ({
      value: project.id,
      label: project.name,
    })),
  ], [projects]);
  const relationshipOptions = useMemo(() => [
    { value: "all", label: "全部供应商" },
    ...relationships.map((relationship) => ({
      value: relationship.id,
      label: relationship.supplier.name,
    })),
  ], [relationships]);

  if (!canViewPurchaseOrders) {
    return (
      <StatusAlert>
        当前账号没有 supplier.purchase-order.view 权限，无法查看采购单。
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

  const totalPages = Math.max(1, orders.pagination.totalPages || 1);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-xl font-semibold tracking-normal">采购单</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            按项目向合作供应商创建采购单，提交前自动复核当前有效基础供货价。
          </p>
        </div>
        {canManagePurchaseOrders ? (
          <Button
            type="button"
            onClick={() => {
              setEditorOrder(null);
              setNewOrderId(crypto.randomUUID());
              setEditorOpen(true);
            }}
          >
            <ClipboardPlus data-icon="inline-start" />
            新建采购单
          </Button>
        ) : null}
      </div>
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      <Card className="overflow-hidden shadow-none">
        <CardHeader className="bg-muted/20 p-4">
          <CardTitle className="text-base">采购单列表</CardTitle>
          <CardDescription>共 {orders.pagination.total} 张采购单</CardDescription>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <Input
              aria-label="搜索采购单"
              value={keyword}
              placeholder="搜索采购单号"
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setPage(1);
                  setAppliedKeyword(keyword.trim());
                }
              }}
            />
            <FormSelect
              id="purchase-order-status-filter"
              value={status}
              options={statusOptions}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            />
            <FormSelect
              id="purchase-order-project-filter"
              value={projectId}
              options={projectOptions}
              onChange={(value) => {
                setProjectId(value);
                setPage(1);
              }}
            />
            <FormSelect
              id="purchase-order-supplier-filter"
              value={tenantSupplierId}
              options={relationshipOptions}
              onChange={(value) => {
                setTenantSupplierId(value);
                setPage(1);
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={loadingOrders}
              onClick={() => {
                setPage(1);
                setAppliedKeyword(keyword.trim());
              }}
            >
              <Search data-icon="inline-start" />
              搜索
            </Button>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          <PurchaseOrderList
            orders={orders.list}
            loading={loadingOrders}
            canManage={canManagePurchaseOrders}
            onOpen={(order) => {
              setDetailOrder(order);
              setDetailOpen(true);
            }}
            onEdit={(order) => {
              setEditorOrder(order);
              setNewOrderId("");
              setEditorOpen(true);
            }}
          />
          <Separator />
          <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <span className="text-sm text-muted-foreground">
              第 {orders.pagination.page} / {totalPages} 页，共{" "}
              {orders.pagination.total} 张采购单
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1 || loadingOrders}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                上一页
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={page >= totalPages || loadingOrders}
                onClick={() => setPage((current) => current + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      {canManagePurchaseOrders && (editorOrder || newOrderId) ? (
        <PurchaseOrderEditor
          open={editorOpen}
          orderId={editorOrder?.id ?? newOrderId}
          order={editorOrder}
          projects={projects}
          relationships={relationships}
          onOpenChange={setEditorOpen}
          onSaved={() => {
            void loadOrders();
          }}
        />
      ) : null}
      <PurchaseOrderDetail
        open={detailOpen}
        order={detailOrder}
        canManage={canManagePurchaseOrders}
        onOpenChange={setDetailOpen}
        onChanged={loadOrders}
      />
    </div>
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
