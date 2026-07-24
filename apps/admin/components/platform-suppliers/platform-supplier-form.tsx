"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requestBackendJson } from "@/lib/backend-client";

import {
  newIdempotencyKey,
  type PlatformSupplierDetailRecord,
  type SupplierType,
  supplierTypeOptions,
} from "./platform-supplier-types";

type SupplierFormState = {
  code: string;
  name: string;
  legalName: string;
  creditCode: string;
  supplierType: SupplierType;
};

const emptyForm: SupplierFormState = {
  code: "",
  name: "",
  legalName: "",
  creditCode: "",
  supplierType: "manufacturer",
};

function initialSupplierForm(
  supplier?: PlatformSupplierDetailRecord,
): SupplierFormState {
  return supplier
    ? {
      code: supplier.code,
      name: supplier.name,
      legalName: supplier.legal_name,
      creditCode: supplier.unified_social_credit_code ?? "",
      supplierType: supplier.supplier_type,
    }
    : { ...emptyForm };
}

export function PlatformSupplierFormButton({
  supplier,
  onSaved,
}: {
  supplier?: PlatformSupplierDetailRecord;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState<SupplierFormState>(() =>
    initialSupplierForm(supplier)
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const payload = {
        ...(supplier ? { expected_version: supplier.version } : {}),
        code: form.code.trim(),
        name: form.name.trim(),
        legal_name: form.legalName.trim(),
        unified_social_credit_code: form.creditCode.trim() || null,
        supplier_type: form.supplierType,
      };
      await requestBackendJson(
        supplier
          ? `/platform/suppliers/${supplier.id}`
          : "/platform/suppliers",
        {
          method: supplier ? "PATCH" : "POST",
          headers: supplier
            ? undefined
            : { "Idempotency-Key": newIdempotencyKey("supplier-create") },
          body: JSON.stringify(payload),
          fallbackMessage: supplier ? "保存供应商资料失败" : "新增供应商失败",
        },
      );
      toast.success(supplier ? "供应商资料已保存" : "供应商已创建");
      setOpen(false);
      router.refresh();
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存供应商资料失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setForm(initialSupplierForm(supplier));
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={supplier ? "outline" : "default"}
        >
          {supplier ? (
            <Pencil data-icon="inline-start" />
          ) : (
            <Plus data-icon="inline-start" />
          )}
          {supplier ? "编辑基本资料" : "新增供应商"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{supplier ? "编辑供应商" : "新增供应商"}</DialogTitle>
          <DialogDescription>
            {supplier
              ? "保存后版本号会更新，状态变更需使用对应操作按钮。"
              : "先创建平台唯一供应商主体，再补充资质和服务区域。"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="supplier-code">供应商编码</FieldLabel>
              <Input
                id="supplier-code"
                value={form.code}
                required
                maxLength={64}
                onChange={(event) =>
                  setForm((current) => ({ ...current, code: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-name">供应商名称</FieldLabel>
              <Input
                id="supplier-name"
                value={form.name}
                required
                maxLength={120}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-legal-name">法定名称</FieldLabel>
              <Input
                id="supplier-legal-name"
                value={form.legalName}
                required
                maxLength={160}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    legalName: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-credit-code">
                统一社会信用代码
              </FieldLabel>
              <Input
                id="supplier-credit-code"
                value={form.creditCode}
                maxLength={64}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    creditCode: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-type">供应商类型</FieldLabel>
              <Select
                value={form.supplierType}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    supplierType: value as SupplierType,
                  }))
                }
              >
                <SelectTrigger id="supplier-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {supplierTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              取消编辑
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "正在保存" : "保存供应商"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
