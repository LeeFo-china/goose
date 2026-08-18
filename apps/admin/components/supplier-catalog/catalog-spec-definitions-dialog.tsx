"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

import { DataTable } from "@/components/admin/data-table";
import { TenantCatalogSourceBadge } from "@/components/tenant-supplier-catalog/tenant-catalog-display";
import { buildTenantCopySpecsCommand, buildTenantSpecListPath } from "@/components/tenant-supplier-catalog/tenant-catalog-requests";
import { newTenantCatalogCommandKey } from "@/components/tenant-supplier-catalog/tenant-catalog-rules";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { requestBackendJson } from "@/lib/backend-client";

import { CatalogSpecEditorDialog, type CatalogSpecScope } from "./catalog-spec-editor-dialog";
import {
  completeCatalogSpecCopy,
  createLatestCatalogSpecRequestSequence,
} from "./catalog-spec-copy-runtime";
import {
  initializeCatalogCreateIntent,
  resolveCatalogCreateIntent,
} from "./supplier-catalog-rules";
import type {
  CatalogCreateIntent,
  CatalogPage,
  CatalogSpecDefinition,
  CatalogStatus,
} from "./supplier-catalog-types";
import { buildPlatformSpecListPath } from "./supplier-catalog-v2-requests";

const valueTypeLabels = {
  text: "文本",
  number: "数值",
  boolean: "布尔",
  single_enum: "单选枚举",
  multi_enum: "多选枚举",
  date: "日期",
} as const;

export function CatalogSpecDefinitionsDialogButton({
  scope,
  category,
}: {
  scope: CatalogSpecScope;
  category: {
    id: string;
    name: string;
    version: number;
    ownership_scope?: "platform" | "tenant";
    mapped_platform_category_id?: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<CatalogStatus | "">("active");
  const [result, setResult] = useState<CatalogPage<CatalogSpecDefinition>>({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogSpecDefinition | null>(null);
  const copyIntentRef = useRef<CatalogCreateIntent | null>(null);
  const loadRequestsRef = useRef(createLatestCatalogSpecRequestSequence());
  const [expectedVersion, setExpectedVersion] = useState(category.version);
  const isTenantOwned = scope === "tenant" &&
    category.ownership_scope === "tenant";
  const canManage = scope === "platform" || isTenantOwned;

  const load = useCallback(async () => {
    const request = loadRequestsRef.current.begin();
    setLoading(true);
    setError(null);
    const path = scope === "platform"
      ? buildPlatformSpecListPath(category.id, page, 20, status)
      : buildTenantSpecListPath(category.id, page, 20, status);
    try {
      const nextResult = await requestBackendJson<CatalogPage<CatalogSpecDefinition>>(path, {
        fallbackMessage: "规格模板加载失败",
        signal: request.signal,
      });
      if (request.isCurrent()) setResult(nextResult);
    } catch (caught) {
      if (request.isCurrent()) {
        setError(caught instanceof Error ? caught.message : "规格模板加载失败");
      }
    } finally {
      if (request.isCurrent()) setLoading(false);
      request.finish();
    }
  }, [category.id, page, scope, status]);

  useEffect(() => {
    if (open) void load();
    return () => loadRequestsRef.current.cancel();
  }, [load, open]);

  async function copyPlatformSpecs() {
    if (!category.mapped_platform_category_id) return;
    const payload = {
      platform_category_id: category.mapped_platform_category_id,
      expected_version: expectedVersion,
    };
    const intent = resolveCatalogCreateIntent(
      copyIntentRef.current,
      payload,
      () => newTenantCatalogCommandKey("spec-copy"),
    );
    copyIntentRef.current = intent;
    const request = buildTenantCopySpecsCommand({
      categoryId: category.id,
      platformCategoryId: category.mapped_platform_category_id,
      expectedVersion,
      idempotencyKey: intent.key,
    });
    setLoading(true);
    try {
      const result = await requestBackendJson<unknown>(request.path, {
        ...request.init,
        fallbackMessage: "复制平台规格模板失败",
      });
      const completed = completeCatalogSpecCopy(
        result,
        () => newTenantCatalogCommandKey("spec-copy"),
      );
      setExpectedVersion(completed.expectedVersion);
      copyIntentRef.current = completed.intent;
      toast.success("平台规格模板已复制");
      router.refresh();
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "复制平台规格模板失败");
    } finally {
      setLoading(false);
    }
  }

  const columns: ColumnDef<CatalogSpecDefinition>[] = [
    { accessorKey: "code", header: "编码" },
    { accessorKey: "name", header: "规格名称", cell: ({ row }) => <span className="font-semibold">{row.original.name}</span> },
    { accessorKey: "value_type", header: "类型", cell: ({ row }) => valueTypeLabels[row.original.value_type] },
    { accessorKey: "ownership_scope", header: "来源", cell: ({ row }) => <TenantCatalogSourceBadge ownershipScope={row.original.ownership_scope} /> },
    { accessorKey: "status", header: "状态", cell: ({ row }) => <Badge variant={row.original.status === "active" ? "success" : "secondary"}>{row.original.status === "active" ? "启用" : "停用"}</Badge> },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => canManage && row.original.ownership_scope === (scope === "platform" ? "platform" : "tenant") ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(row.original); setEditorOpen(true); }}>编辑</Button>
      ) : <span className="text-sm text-muted-foreground">只读</span>,
      meta: { headerClassName: "text-right", cellClassName: "text-right" },
    },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setPage(1);
          setExpectedVersion(category.version);
          copyIntentRef.current = initializeCatalogCreateIntent(
            () => newTenantCatalogCommandKey("spec-copy"),
          );
        } else {
          loadRequestsRef.current.cancel();
          copyIntentRef.current = null;
        }
      }}>
        <DialogTrigger asChild>
          <Button type="button" size="sm" variant="ghost">规格模板</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{category.name}规格模板</DialogTitle>
            <DialogDescription>规格定义按分类分页维护，平台模板在租户侧始终只读。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Select value={status || "all"} onValueChange={(value) => { setStatus(value === "all" ? "" : value as CatalogStatus); setPage(1); }}>
              <SelectTrigger className="w-36" aria-label="筛选规格状态"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">启用</SelectItem>
                <SelectItem value="inactive">停用</SelectItem>
              </SelectGroup></SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              {isTenantOwned && category.mapped_platform_category_id ? (
                <Button type="button" variant="outline" disabled={loading} onClick={() => void copyPlatformSpecs()}>复制平台模板</Button>
              ) : null}
              {canManage ? (
                <Button type="button" onClick={() => { setEditing(null); setEditorOpen(true); }}>新建规格</Button>
              ) : null}
            </div>
          </div>
          {error ? <Alert variant="destructive"><AlertTitle>规格模板未加载</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          {loading && result.list.length === 0 ? (
            <div className="flex flex-col gap-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : <DataTable columns={columns} data={result.list} emptyText="当前分类还没有规格定义" minWidth="min-w-[760px]" />}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">第 {result.pagination.page} / {Math.max(1, result.pagination.totalPages)} 页，共 {result.pagination.total} 条</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button>
              <Button type="button" variant="outline" disabled={loading || page >= Math.max(1, result.pagination.totalPages)} onClick={() => setPage((value) => value + 1)}>下一页</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <CatalogSpecEditorDialog
        key={`${editing?.id ?? "new"}-${editorOpen}`}
        scope={scope}
        categoryId={category.id}
        record={editing}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={() => void load()}
      />
    </>
  );
}
