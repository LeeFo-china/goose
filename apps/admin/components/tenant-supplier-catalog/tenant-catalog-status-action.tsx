"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  initializeCatalogCreateIntent,
  resolveCatalogCreateIntent,
} from "@/components/supplier-catalog/supplier-catalog-rules";
import type {
  CatalogCreateIntent,
  CatalogStatus,
} from "@/components/supplier-catalog/supplier-catalog-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requestBackendJson } from "@/lib/backend-client";

import {
  buildTenantBrandCommand,
  buildTenantCategoryCommand,
} from "./tenant-catalog-requests";
import { newTenantCatalogCommandKey } from "./tenant-catalog-rules";

export function TenantCatalogStatusAction({
  kind,
  record,
}: {
  kind: "category" | "brand";
  record: { id: string; name: string; status: CatalogStatus; version: number };
}) {
  const router = useRouter();
  const intentRef = useRef<CatalogCreateIntent | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const nextStatus = record.status === "active" ? "inactive" : "active";
  const label = nextStatus === "active" ? "启用" : "停用";

  async function submit() {
    const payload = { expected_version: record.version, status: nextStatus };
    const intent = resolveCatalogCreateIntent(
      intentRef.current,
      payload,
      () => newTenantCatalogCommandKey(`${kind}-status`),
    );
    intentRef.current = intent;
    const request = kind === "category"
      ? buildTenantCategoryCommand({
          id: record.id,
          payload,
          idempotencyKey: intent.key,
        })
      : buildTenantBrandCommand({
          id: record.id,
          payload,
          idempotencyKey: intent.key,
        });
    setPending(true);
    try {
      await requestBackendJson(request.path, {
        ...request.init,
        fallbackMessage: `${label}目录数据失败`,
      });
      toast.success(`${record.name}已${label}`);
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${label}目录数据失败`);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (pending) return;
          setOpen(value);
          intentRef.current = value
            ? initializeCatalogCreateIntent(
                () => newTenantCatalogCommandKey(`${kind}-status`),
              )
            : null;
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}“{record.name}”</DialogTitle>
            <DialogDescription>
              停用后仅影响新增业务，历史引用仍可追溯。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              取消操作
            </Button>
            <Button type="button" variant={nextStatus === "inactive" ? "destructive" : "default"} disabled={pending} onClick={() => void submit()}>
              {pending ? "正在提交" : `${label}目录数据`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
