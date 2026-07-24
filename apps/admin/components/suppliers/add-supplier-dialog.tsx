"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { requestBackendJson } from "@/lib/backend-client";

import {
  newIdempotencyKey,
  supplierTypeLabel,
  type PageData,
  type SupplierDirectoryItem,
} from "./supplier-types";

const emptyDirectory: PageData<SupplierDirectoryItem> = {
  list: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
};

export function AddSupplierDialog({
  disabled,
  onCreated,
}: {
  disabled?: boolean;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [directory, setDirectory] = useState(emptyDirectory);
  const [loading, setLoading] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (page: number, search: string) => {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      page: String(page),
      pageSize: "10",
    });
    if (search.trim()) query.set("keyword", search.trim());
    try {
      const data = await requestBackendJson<PageData<SupplierDirectoryItem>>(
        `/suppliers/directory?${query}`,
        { fallbackMessage: "可合作供应商目录加载失败" },
      );
      setDirectory(data);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "可合作供应商目录加载失败",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadDirectory(1, "");
  }, [loadDirectory, open]);

  async function createRelationship(supplier: SupplierDirectoryItem) {
    setCreatingId(supplier.id);
    try {
      await requestBackendJson("/suppliers", {
        method: "POST",
        headers: { "Idempotency-Key": newIdempotencyKey("tenant-supplier-create") },
        body: JSON.stringify({ supplier_id: supplier.id }),
        fallbackMessage: "添加合作供应商失败",
      });
      toast.success("已添加合作供应商，当前状态为评估中");
      setOpen(false);
      onCreated();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : "添加合作供应商失败",
      );
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled}>
          <Plus data-icon="inline-start" />
          添加合作供应商
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(80vh,680px)] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>添加合作供应商</DialogTitle>
          <DialogDescription>
            只显示平台已准入且当前租户尚未建立关系的供应商。添加后进入 evaluating（评估中）状态。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="supplier-directory-keyword">搜索供应商</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="supplier-directory-keyword"
                value={keyword}
                placeholder="供应商名称、编码或法定名称"
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void loadDirectory(1, keyword);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => void loadDirectory(1, keyword)}
              >
                <Search data-icon="inline-start" />
                搜索
              </Button>
            </div>
          </Field>
        </FieldGroup>
        <div className="min-h-48 flex-1 overflow-y-auto rounded-md border">
          {loading ? (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : error ? (
            <div className="p-4 text-sm text-destructive">{error}</div>
          ) : directory.list.length ? (
            <div className="divide-y">
              {directory.list.map((supplier) => (
                <div
                  key={supplier.id}
                  className="flex items-center justify-between gap-3 px-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{supplier.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{supplier.code}</span>
                      <Badge variant="outline">
                        {supplierTypeLabel[supplier.supplier_type]}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={creatingId !== null}
                    onClick={() => void createRelationship(supplier)}
                  >
                    {creatingId === supplier.id ? "正在添加" : "建立合作"}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              没有可添加的供应商
            </div>
          )}
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">
            第 {directory.pagination.page} / {Math.max(1, directory.pagination.totalPages)} 页，共{" "}
            {directory.pagination.total} 个
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={loading || directory.pagination.page <= 1}
              onClick={() =>
                void loadDirectory(directory.pagination.page - 1, keyword)
              }
            >
              上一页
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={
                loading ||
                directory.pagination.page >=
                  Math.max(1, directory.pagination.totalPages)
              }
              onClick={() =>
                void loadDirectory(directory.pagination.page + 1, keyword)
              }
            >
              下一页
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
