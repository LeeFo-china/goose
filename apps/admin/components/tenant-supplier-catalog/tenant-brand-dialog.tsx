"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  initializeCatalogCreateIntent,
  resolveCatalogCreateIntent,
} from "@/components/supplier-catalog/supplier-catalog-rules";
import type { CatalogCreateIntent } from "@/components/supplier-catalog/supplier-catalog-types";
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
import { requestBackendJson } from "@/lib/backend-client";

import { buildTenantBrandCommand } from "./tenant-catalog-requests";
import { newTenantCatalogCommandKey } from "./tenant-catalog-rules";
import { TenantCategorySelect } from "./tenant-category-select";
import type { TenantCatalogBrand } from "./tenant-catalog-types";

export function TenantBrandDialogButton({
  record,
}: {
  record?: TenantCatalogBrand;
}) {
  const router = useRouter();
  const intentRef = useRef<CatalogCreateIntent | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [categoryId, setCategoryId] = useState(record?.category_id ?? "");
  const [name, setName] = useState(record?.name ?? "");
  const editing = Boolean(record);

  function reset() {
    setCategoryId(record?.category_id ?? "");
    setName(record?.name ?? "");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryId) {
      toast.error("请选择所属分类");
      return;
    }
    const payload = {
      ...(record ? { expected_version: record.version } : { status: "active" }),
      category_id: categoryId,
      name: name.trim(),
    };
    const intent = resolveCatalogCreateIntent(
      intentRef.current,
      payload,
      () => newTenantCatalogCommandKey("brand"),
    );
    intentRef.current = intent;
    const request = buildTenantBrandCommand({
      id: record?.id,
      payload,
      idempotencyKey: intent.key,
    });
    setPending(true);
    try {
      await requestBackendJson(request.path, {
        ...request.init,
        fallbackMessage: "保存私有品牌失败",
      });
      toast.success(editing ? "私有品牌已保存" : "私有品牌已创建");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存私有品牌失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        if (value) {
          reset();
          intentRef.current = initializeCatalogCreateIntent(
            () => newTenantCatalogCommandKey("brand"),
          );
        } else intentRef.current = null;
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant={editing ? "ghost" : "default"}>
          {editing ? "编辑" : "新建私有品牌"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑私有品牌" : "新建私有品牌"}</DialogTitle>
          <DialogDescription>私有品牌永久属于当前租户，编码由系统维护。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <TenantCategorySelect
              id={`tenant-brand-category-${record?.id ?? "new"}`}
              value={categoryId}
              selectedCategory={record?.category}
              onChange={setCategoryId}
            />
            <Field>
              <FieldLabel htmlFor={`tenant-brand-name-${record?.id ?? "new"}`}>
                品牌名称
              </FieldLabel>
              <Input
                id={`tenant-brand-name-${record?.id ?? "new"}`}
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>取消编辑</Button>
            <Button type="submit" disabled={pending}>{pending ? "正在保存" : "保存品牌"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
