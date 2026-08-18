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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requestBackendJson } from "@/lib/backend-client";

import { buildTenantCategoryCommand } from "./tenant-catalog-requests";
import { newTenantCatalogCommandKey } from "./tenant-catalog-rules";
import type { TenantCatalogCategory } from "./tenant-catalog-types";

const NO_MAPPING = "none";

export function TenantCategoryDialogButton({
  record,
  parentId = null,
  platformCategories,
}: {
  record?: TenantCatalogCategory;
  parentId?: string | null;
  platformCategories: TenantCatalogCategory[];
}) {
  const router = useRouter();
  const intentRef = useRef<CatalogCreateIntent | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [code, setCode] = useState(record?.code ?? "");
  const [name, setName] = useState(record?.name ?? "");
  const [sortOrder, setSortOrder] = useState(String(record?.sort_order ?? 100));
  const [mappingId, setMappingId] = useState(
    record?.mapped_platform_category_id ?? NO_MAPPING,
  );

  const editing = Boolean(record);

  function reset() {
    setCode(record?.code ?? "");
    setName(record?.name ?? "");
    setSortOrder(String(record?.sort_order ?? 100));
    setMappingId(record?.mapped_platform_category_id ?? NO_MAPPING);
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
      code: code.trim(),
      name: name.trim(),
      mapped_platform_category_id: mappingId === NO_MAPPING ? null : mappingId,
      sort_order: Number(sortOrder),
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
            私有类目永久属于当前租户，平台映射仅用于标准化。
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
                required
                maxLength={64}
                value={code}
                onChange={(event) => setCode(event.target.value)}
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
            <Field>
              <FieldLabel>平台分类映射</FieldLabel>
              <Select value={mappingId} onValueChange={setMappingId}>
                <SelectTrigger aria-label="平台分类映射">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NO_MAPPING}>暂不映射</SelectItem>
                    {platformCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.full_name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={`tenant-category-sort-${record?.id ?? "new"}`}>
                排序
              </FieldLabel>
              <Input
                id={`tenant-category-sort-${record?.id ?? "new"}`}
                type="number"
                required
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
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
