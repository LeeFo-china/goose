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
import type { TenantCatalogBrand } from "./tenant-catalog-types";
import { TenantPlatformBrandPicker } from "./tenant-platform-brand-picker";

export function TenantBrandDialogButton({
  record,
}: {
  record?: TenantCatalogBrand;
}) {
  const router = useRouter();
  const intentRef = useRef<CatalogCreateIntent | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState(record?.code ?? "");
  const [name, setName] = useState(record?.name ?? "");
  const [legalName, setLegalName] = useState(record?.legal_name ?? "");
  const [mappingId, setMappingId] = useState(
    record?.mapped_platform_brand_id ?? "",
  );
  const [sortOrder, setSortOrder] = useState(String(record?.sort_order ?? 100));
  const editing = Boolean(record);

  function reset() {
    setCode(record?.code ?? "");
    setName(record?.name ?? "");
    setLegalName(record?.legal_name ?? "");
    setMappingId(record?.mapped_platform_brand_id ?? "");
    setSortOrder(String(record?.sort_order ?? 100));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      ...(record ? { expected_version: record.version } : { status: "active" }),
      code: code.trim(),
      name: name.trim(),
      legal_name: legalName.trim() || null,
      mapped_platform_brand_id: mappingId || null,
      sort_order: Number(sortOrder),
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
          <DialogDescription>平台映射不会改变品牌名称和租户所有权。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="tenant-brand-code">编码</FieldLabel><Input id="tenant-brand-code" required maxLength={64} value={code} onChange={(event) => setCode(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="tenant-brand-name">品牌名称</FieldLabel><Input id="tenant-brand-name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="tenant-brand-legal">法定名称</FieldLabel><Input id="tenant-brand-legal" maxLength={160} value={legalName} onChange={(event) => setLegalName(event.target.value)} /></Field>
            <Field>
              <FieldLabel>平台品牌映射</FieldLabel>
              <TenantPlatformBrandPicker
                value={mappingId}
                pinned={record?.mapped_platform_brand ?? null}
                onChange={setMappingId}
              />
            </Field>
            <Field><FieldLabel htmlFor="tenant-brand-sort">排序</FieldLabel><Input id="tenant-brand-sort" type="number" required value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} /></Field>
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
