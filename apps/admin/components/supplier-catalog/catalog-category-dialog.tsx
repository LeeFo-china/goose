"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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

import {
  CatalogConflictAlert,
  CatalogDialogTrigger,
} from "./catalog-dialog-shared";
import { buildCatalogMutationRequest } from "./supplier-catalog-api";
import {
  initializeCatalogCreateIntent,
  isCatalogVersionConflict,
  newCatalogIdempotencyKey,
  resolveCatalogCreateIntent,
} from "./supplier-catalog-rules";
import type {
  CatalogCategory,
  CatalogCreateIntent,
} from "./supplier-catalog-types";

export function CatalogCategoryDialogButton({
  record,
  parentId,
  parentName,
  parentLevel,
}: {
  record?: CatalogCategory;
  parentId: string | null;
  parentName: string;
  parentLevel: number;
}) {
  const router = useRouter();
  const editing = Boolean(record);
  const intentRef = useRef<CatalogCreateIntent | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [code, setCode] = useState(record?.code ?? "");
  const [name, setName] = useState(record?.name ?? "");
  const [sortOrder, setSortOrder] = useState(String(record?.sort_order ?? 100));

  function reset() {
    setCode(record?.code ?? "");
    setName(record?.name ?? "");
    setSortOrder(String(record?.sort_order ?? 100));
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
        : {
            parent_id: parentId,
            level: parentLevel + 1,
            status: "active",
          }),
      code: code.trim(),
      name: name.trim(),
      sort_order: Number(sortOrder),
    };
    setPending(true);
    setConflict(false);
    try {
      if (record) {
        await requestBackendJson(`/platform/catalog/categories/${record.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
          fallbackMessage: "保存标准类目失败",
        });
      } else {
        const intent = resolveCatalogCreateIntent(
          intentRef.current,
          payload,
          () => newCatalogIdempotencyKey("category"),
        );
        intentRef.current = intent;
        const request = buildCatalogMutationRequest({
          kind: "category",
          payload,
          intent,
        });
        await requestBackendJson(request.path, {
          ...request.init,
          fallbackMessage: "新建标准类目失败",
        });
      }
      toast.success(editing ? "标准类目已保存" : "标准类目已创建");
      close();
      router.refresh();
    } catch (error) {
      if (isCatalogVersionConflict(error)) setConflict(true);
      else {
        toast.error(
          error instanceof Error ? error.message : "保存标准类目失败",
        );
      }
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
          if (!record) {
            intentRef.current = initializeCatalogCreateIntent(
              () => newCatalogIdempotencyKey("category"),
            );
          }
        } else {
          intentRef.current = null;
        }
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <CatalogDialogTrigger
          editing={editing}
          label={editing ? "编辑" : "新建类目"}
        />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑标准类目" : "新建标准类目"}</DialogTitle>
          <DialogDescription>
            当前上级：{parentName || "根级"}，层级由当前位置确定。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`category-code-${record?.id ?? "new"}`}>
                编码
              </FieldLabel>
              <Input
                id={`category-code-${record?.id ?? "new"}`}
                required
                maxLength={64}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`category-name-${record?.id ?? "new"}`}>
                名称
              </FieldLabel>
              <Input
                id={`category-name-${record?.id ?? "new"}`}
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`category-sort-${record?.id ?? "new"}`}>
                排序
              </FieldLabel>
              <Input
                id={`category-sort-${record?.id ?? "new"}`}
                type="number"
                required
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              />
            </Field>
            {conflict ? (
              <CatalogConflictAlert onRefresh={() => {
                close();
                router.refresh();
              }} />
            ) : null}
          </FieldGroup>
          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={close}
            >
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
