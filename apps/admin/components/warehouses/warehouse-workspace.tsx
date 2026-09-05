"use client";

import { useEffect, useState } from "react";
import { Plus, RotateCcw, Search, Warehouse as WarehouseIcon } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  createWarehouse,
  listWarehouses,
  updateWarehouse,
} from "./warehouse-api";
import { WarehouseDialog } from "./warehouse-dialog";
import { WarehouseTable } from "./warehouse-table";
import type {
  Warehouse,
  WarehouseCreateRequest,
  WarehouseStatus,
  WarehouseUpdateRequest,
} from "./warehouse-types";

type WarehouseWorkspaceProps = {
  canView: boolean;
  canManage: boolean;
};

const PAGE_SIZE = 20;

export function WarehouseWorkspace({
  canView,
  canManage,
}: WarehouseWorkspaceProps) {
  const [records, setRecords] = useState<Warehouse[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<WarehouseStatus | "all">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) return;
    let active = true;
    setLoading(true);
    setError(null);
    void listWarehouses({
      page,
      pageSize: PAGE_SIZE,
      ...(keyword ? { keyword } : {}),
      ...(status !== "all" ? { status } : {}),
    }).then((data) => {
      if (!active) return;
      setRecords(data.list);
      setTotalPages(data.pagination.totalPages);
    }).catch((caught) => {
      if (active) setError(errorMessage(caught, "仓库列表加载失败"));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [canView, keyword, page, status]);

  function openCreateDialog() {
    setEditing(null);
    setDialogError(null);
    setDialogOpen(true);
  }

  function openEditDialog(warehouse: Warehouse) {
    setEditing(warehouse);
    setDialogError(null);
    setDialogOpen(true);
  }

  async function handleCreateWarehouse(payload: WarehouseCreateRequest) {
    if (!canManage) return;
    setSubmitting(true);
    setDialogError(null);
    try {
      await createWarehouse(payload);
      setDialogOpen(false);
      await reload();
    } catch (caught) {
      setDialogError(errorMessage(caught, "仓库保存失败"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateWarehouse(payload: WarehouseUpdateRequest) {
    if (!canManage || !editing) return;
    setSubmitting(true);
    setDialogError(null);
    try {
      await updateWarehouse(editing.id, payload);
      setDialogOpen(false);
      await reload();
    } catch (caught) {
      setDialogError(errorMessage(caught, "仓库保存失败"));
    } finally {
      setSubmitting(false);
    }
  }

  async function mutateStatus(warehouse: Warehouse, patch: WarehouseUpdateRequest) {
    if (!canManage) return;
    if (patch.status) {
      const action = patch.status === "active" ? "启用" : "停用";
      if (!window.confirm(`确认${action}仓库「${warehouse.name}」？`)) return;
    }
    setError(null);
    try {
      await updateWarehouse(warehouse.id, patch);
      await reload();
    } catch (caught) {
      setError(errorMessage(caught, "仓库状态更新失败"));
    }
  }

  async function reload() {
    const data = await listWarehouses({
      page,
      pageSize: PAGE_SIZE,
      ...(keyword ? { keyword } : {}),
      ...(status !== "all" ? { status } : {}),
    });
    setRecords(data.list);
    setTotalPages(data.pagination.totalPages);
  }

  function applyFilters() {
    setPage(1);
    setKeyword(keywordInput.trim());
  }

  function resetFilters() {
    setPage(1);
    setKeyword("");
    setKeywordInput("");
    setStatus("all");
  }

  if (!canView) {
    return (
      <main className="space-y-4 p-6">
        <StatusAlert title="无法访问仓库设置">当前账号缺少查看仓库设置权限。</StatusAlert>
      </main>
    );
  }

  return (
    <main className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">仓库设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            维护公司收货仓库，后续仓库采购和项目领料将以这里为基础。
          </p>
        </div>
        {canManage ? (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 size-4" />
            新增仓库
          </Button>
        ) : null}
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <section className="rounded-md border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b p-4">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyFilters();
              }}
              className="pl-9"
              placeholder="搜索仓库名称或地址"
            />
          </div>
          <Select
            value={status}
            onValueChange={(value) => {
              setPage(1);
              setStatus(value as WarehouseStatus | "all");
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">启用</SelectItem>
              <SelectItem value="inactive">停用</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={applyFilters}>筛选</Button>
          <Button variant="ghost" onClick={resetFilters}>
            <RotateCcw className="mr-2 size-4" />
            重置
          </Button>
        </div>

        {records.length === 0 && !loading ? (
          <Empty className="min-h-80 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WarehouseIcon className="size-5" />
              </EmptyMedia>
              <EmptyTitle>暂未设置仓库</EmptyTitle>
              <EmptyDescription>
                {canManage ? "新增一个仓库后即可作为公司收货地址。" : "请联系管理员维护仓库。"}
              </EmptyDescription>
            </EmptyHeader>
            {canManage ? <Button onClick={openCreateDialog}>新增仓库</Button> : null}
          </Empty>
        ) : (
          <WarehouseTable
            records={records}
            canManage={canManage}
            onEdit={openEditDialog}
            onMutate={(warehouse, patch) => void mutateStatus(warehouse, patch)}
          />
        )}

        <div className="flex items-center justify-between border-t p-4 text-sm text-muted-foreground">
          <span>第 {page} / {Math.max(totalPages, 1)} 页</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              disabled={page >= Math.max(totalPages, 1) || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </section>

      <WarehouseDialog
        open={dialogOpen}
        warehouse={editing}
        submitting={submitting}
        error={dialogError}
        onOpenChange={setDialogOpen}
        onCreate={handleCreateWarehouse}
        onUpdate={handleUpdateWarehouse}
      />
    </main>
  );
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
