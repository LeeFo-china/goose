"use client";

import { useCallback, useEffect, useState } from "react";
import { PackageSearch, Search } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { requestBackendJson } from "@/lib/backend-client";

import { AddSupplierDialog } from "./add-supplier-dialog";
import { SupplierContractPolicyCard } from "./supplier-contract-policy-card";
import { loadTenantSupplierSettings } from "./supplier-settings-api";
import { shouldLoadSupplierResources } from "./supplier-workspace-rules";
import {
  currentSelectedRelationship,
  type PageData,
  type TenantSupplierRelationship,
  type TenantSupplierSettings,
} from "./supplier-types";
import { TenantSupplierDetail } from "./tenant-supplier-detail";
import { TenantSupplierTable } from "./tenant-supplier-table";

const disabledModule: TenantSupplierSettings = {
  tenant_id: "",
  module_enabled: false,
  require_active_contract_for_new_order: false,
  ownership_reads_enabled: false,
  private_supplier_writes_enabled: false,
  private_catalog_writes_enabled: false,
  procurement_snapshot_v1_enabled: false,
  enabled_by_employee_id: null,
  enabled_at: null,
  version: 0,
  created_at: "",
  updated_at: "",
};
const emptyPage: PageData<TenantSupplierRelationship> = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

export function SupplierWorkspace({
  canView,
  canManage,
  canManagePrivate,
  canManageContracts,
}: {
  canView: boolean;
  canManage: boolean;
  canManagePrivate: boolean;
  canManageContracts: boolean;
}) {
  const [settings, setSettings] = useState<TenantSupplierSettings | null>(null);
  const [relationships, setRelationships] = useState(emptyPage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRelationships = useCallback(async () => {
    if (!settings || !shouldLoadSupplierResources(settings.module_enabled)) return;
    setListLoading(true);
    setError(null);
    const query = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (appliedKeyword) query.set("keyword", appliedKeyword);
    try {
      const data = await requestBackendJson<PageData<TenantSupplierRelationship>>(
        `/suppliers?${query}`,
        { fallbackMessage: "合作供应商列表加载失败" },
      );
      setRelationships(data);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "合作供应商列表加载失败",
      );
    } finally {
      setListLoading(false);
    }
  }, [appliedKeyword, page, settings]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let active = true;
    void loadTenantSupplierSettings().then((data) => {
      if (active) setSettings(data);
    }).catch((requestError) => {
      const code = (requestError as { code?: string }).code;
      if (active && code === "SUPPLIER_MODULE_DISABLED") {
        setSettings(disabledModule);
      } else if (active) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "供应商模块配置加载失败",
        );
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [canView]);

  useEffect(() => {
    if (!settings) return;
    if (!shouldLoadSupplierResources(settings.module_enabled)) return;
    void loadRelationships();
  }, [loadRelationships, settings]);

  const selected = currentSelectedRelationship(
    relationships.list,
    selectedId,
  );

  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selected, selectedId]);

  if (!canView) {
    return <StatusAlert>当前账号没有 supplier.view 权限，无法查看合作供应商。</StatusAlert>;
  }
  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="min-h-80 flex-1 rounded-lg" />
      </div>
    );
  }
  if (!settings) {
    return <StatusAlert>{error ?? "供应商模块配置加载失败"}</StatusAlert>;
  }
  if (!settings.module_enabled) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold tracking-normal">合作供应商</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理租户与平台供应商之间的合作关系、合同和新订单资格。
          </p>
        </div>
        <Card className="flex min-h-80 flex-1 items-center justify-center shadow-none">
          <CardContent className="p-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageSearch />
                </EmptyMedia>
                <EmptyTitle>供应商模块尚未启用</EmptyTitle>
                <EmptyDescription>
                  当前页面为只读状态，不会加载供应商列表或目录。请联系平台管理员为本租户启用模块。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPages = Math.max(1, relationships.pagination.totalPages || 1);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-xl font-semibold tracking-normal">合作供应商</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            核对合作状态、准入阻断、结算条款、合同健康和负责人。
          </p>
        </div>
        {canManage ? (
          <AddSupplierDialog
            disabled={listLoading}
            privateCreationEnabled={
              canManagePrivate && settings.private_supplier_writes_enabled
            }
            onCreated={loadRelationships}
          />
        ) : null}
      </div>
      <SupplierContractPolicyCard
        settings={settings}
        canManage={canManage}
        onSettingsChange={setSettings}
      />
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b bg-muted/20 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Input
              className="md:max-w-sm"
              aria-label="搜索合作供应商"
              value={keyword}
              placeholder="搜索供应商名称或编码"
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setPage(1);
                  setAppliedKeyword(keyword.trim());
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={listLoading}
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
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            {listLoading && relationships.list.length === 0 ? (
              <div className="flex flex-col gap-2 p-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (
              <TenantSupplierTable
                relationships={relationships.list}
                pagination={relationships.pagination}
                onOpen={(relationship) => setSelectedId(relationship.id)}
              />
            )}
          </div>
          <div className="flex flex-col gap-3 border-t px-4 py-3 md:flex-row md:items-center md:justify-between">
            <span className="text-sm text-muted-foreground">
              第 {relationships.pagination.page} / {totalPages} 页，共{" "}
              {relationships.pagination.total} 个合作供应商
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1 || listLoading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                上一页
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={page >= totalPages || listLoading}
                onClick={() => setPage((current) => current + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      {selected ? (
        <TenantSupplierDetail
          relationship={selected}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setSelectedId(null);
          }}
          canManage={canManage}
          canManageContracts={canManageContracts}
          contractRequired={settings.require_active_contract_for_new_order}
          onChanged={() => {
            void loadRelationships();
          }}
        />
      ) : null}
    </div>
  );
}
