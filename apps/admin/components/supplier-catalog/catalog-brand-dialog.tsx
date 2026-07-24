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
import { buildCatalogMutationRequest } from "./supplier-catalog-requests";
import {
  initializeCatalogCreateIntent,
  isCatalogVersionConflict,
  newCatalogIdempotencyKey,
  resolveCatalogCreateIntent,
} from "./supplier-catalog-rules";
import type {
  CatalogBrand,
  CatalogCreateIntent,
} from "./supplier-catalog-types";

export function CatalogBrandDialogButton({
  record,
}: {
  record?: CatalogBrand;
}) {
  const router = useRouter();
  const editing = Boolean(record);
  const intentRef = useRef<CatalogCreateIntent | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [code, setCode] = useState(record?.code ?? "");
  const [name, setName] = useState(record?.name ?? "");
  const [legalName, setLegalName] = useState(record?.legal_name ?? "");
  const [sortOrder, setSortOrder] = useState(String(record?.sort_order ?? 100));

  function reset() {
    setCode(record?.code ?? "");
    setName(record?.name ?? "");
    setLegalName(record?.legal_name ?? "");
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
      ...(record ? { expected_version: record.version } : { status: "active" }),
      code: code.trim(),
      name: name.trim(),
      legal_name: legalName.trim() || null,
      sort_order: Number(sortOrder),
    };
    setPending(true);
    setConflict(false);
    try {
      if (record) {
        await requestBackendJson(`/platform/catalog/brands/${record.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
          fallbackMessage: "保存品牌失败",
        });
      } else {
        const intent = resolveCatalogCreateIntent(
          intentRef.current,
          payload,
          () => newCatalogIdempotencyKey("brand"),
        );
        intentRef.current = intent;
        const request = buildCatalogMutationRequest({
          kind: "brand",
          payload,
          intent,
        });
        await requestBackendJson(request.path, {
          ...request.init,
          fallbackMessage: "新建品牌失败",
        });
      }
      toast.success(editing ? "品牌已保存" : "品牌已创建");
      close();
      router.refresh();
    } catch (error) {
      if (isCatalogVersionConflict(error)) setConflict(true);
      else {
        toast.error(error instanceof Error ? error.message : "保存品牌失败");
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
              () => newCatalogIdempotencyKey("brand"),
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
          label={editing ? "编辑" : "新建品牌"}
        />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑品牌" : "新建品牌"}</DialogTitle>
          <DialogDescription>
            维护统一品牌名称，法定名称可留空。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`brand-code-${record?.id ?? "new"}`}>
                编码
              </FieldLabel>
              <Input
                id={`brand-code-${record?.id ?? "new"}`}
                required
                maxLength={64}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`brand-name-${record?.id ?? "new"}`}>
                品牌
              </FieldLabel>
              <Input
                id={`brand-name-${record?.id ?? "new"}`}
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`brand-legal-${record?.id ?? "new"}`}>
                法定名称
              </FieldLabel>
              <Input
                id={`brand-legal-${record?.id ?? "new"}`}
                maxLength={160}
                value={legalName}
                onChange={(event) => setLegalName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`brand-sort-${record?.id ?? "new"}`}>
                排序
              </FieldLabel>
              <Input
                id={`brand-sort-${record?.id ?? "new"}`}
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
              {pending ? "正在保存" : "保存品牌"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
