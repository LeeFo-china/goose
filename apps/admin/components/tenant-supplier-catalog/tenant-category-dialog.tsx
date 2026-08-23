"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  initializeCatalogCreateIntent,
  isCatalogVersionConflict,
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

import { buildTenantCategoryCommand } from "./tenant-catalog-requests";
import { newTenantCatalogCommandKey } from "./tenant-catalog-rules";
import type { TenantCatalogCategory } from "./tenant-catalog-types";

export function TenantCategoryDialogButton({
  record,
  parentId = null,
}: {
  record?: TenantCatalogCategory;
  parentId?: string | null;
}) {
  const router = useRouter();
  const intentRef = useRef<CatalogCreateIntent | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [name, setName] = useState(record?.name ?? "");

  const editing = Boolean(record);

  function reset() {
    setName(record?.name ?? "");
    setConflict(false);
  }

  function close() {
    intentRef.current = null;
    setOpen(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      ...(record
        ? { expected_version: record.version }
        : { parent_id: parentId, status: "active" }),
      name: name.trim(),
    };
    const intent = resolveCatalogCreateIntent(
      intentRef.current,
      payload,
      () => newTenantCatalogCommandKey("category"),
    );
    intentRef.current = intent;
    setPending(true);
    setConflict(false);
    try {
      const request = buildTenantCategoryCommand({
        id: record?.id,
        payload,
        idempotencyKey: intent.key,
      });
      await requestBackendJson(request.path, {
        ...request.init,
        fallbackMessage: "保存私有类目失败",
      });
      toast.success(editing ? "私有类目已保存" : "私有类目已创建");
      close();
      router.refresh();
    } catch (error) {
      if (isCatalogVersionConflict(error)) setConflict(true);
      else toast.error(error instanceof Error ? error.message : "保存私有类目失败");
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
            () => newTenantCatalogCommandKey("category"),
          );
        } else {
          intentRef.current = null;
        }
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant={editing ? "ghost" : "default"}>
          {editing ? "编辑" : "新建私有类目"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑私有类目" : "新建私有类目"}</DialogTitle>
          <DialogDescription>
            私有类目永久属于当前租户，编码和排序由系统维护。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`tenant-category-code-${record?.id ?? "new"}`}>
                编码
              </FieldLabel>
              <Input
                id={`tenant-category-code-${record?.id ?? "new"}`}
                value={record?.code ?? "保存后自动生成"}
                disabled
                readOnly
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`tenant-category-name-${record?.id ?? "new"}`}>
                名称
              </FieldLabel>
              <Input
                id={`tenant-category-name-${record?.id ?? "new"}`}
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            {conflict ? (
              <p className="text-sm text-destructive">
                数据版本已变化，请刷新后重新检查本次修改。
              </p>
            ) : null}
          </FieldGroup>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" disabled={pending} onClick={close}>
              取消编辑
            </Button>
            <Button type="submit" disabled={pending || conflict}>
              {pending ? "正在保存" : "保存类目"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
