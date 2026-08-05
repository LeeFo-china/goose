"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";

import {
  buildPlatformServiceProductPayload,
  createInitialPlatformServiceProductFormValues,
  DEFAULT_PLATFORM_SERVICE_PRODUCT_FORM_VALUES,
} from "./platform-service-product-form-data";
import type {
  PlatformServiceProductFormValues,
  PlatformServiceProductListItem,
} from "./platform-service-product-types";

export function PlatformServiceProductFormButton({
  product,
  onSaved,
}: {
  product?: PlatformServiceProductListItem | null;
  onSaved?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() =>
    createInitialPlatformServiceProductFormValues(product)
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isEditing = Boolean(product);

  useEffect(() => {
    if (!open) return;
    setValues(createInitialPlatformServiceProductFormValues(product));
    setError("");
    setNotice("");
  }, [open, product]);

  function update(patch: Partial<PlatformServiceProductFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
    setError("");
    setNotice("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildPlatformServiceProductPayload(values, product?.version);
    if (!payload.ok) {
      setError(payload.message);
      return;
    }

    setPending(true);
    setError("");
    setNotice("");
    try {
      await requestBackendJson(
        product
          ? `/platform/billing/service-products/${product.id}`
          : "/platform/billing/service-products",
        {
          method: product ? "PATCH" : "POST",
          body: JSON.stringify(payload.body),
          fallbackMessage: product ? "技术服务套餐保存失败" : "技术服务套餐创建失败",
        },
      );
      setNotice(product ? "技术服务套餐已保存。" : "技术服务套餐草稿已创建。");
      router.refresh();
      await onSaved?.();
      if (!product) setValues(DEFAULT_PLATFORM_SERVICE_PRODUCT_FORM_VALUES);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "技术服务套餐保存失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant={isEditing ? "outline" : "default"}>
          {isEditing ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
          {isEditing ? "编辑套餐" : "新建套餐草稿"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑技术服务套餐" : "新建技术服务套餐草稿"}</DialogTitle>
          <DialogDescription>
            修改标价、实付价、服务范围和服务条款后，需要发布套餐才能成为新的下单版本。
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="service-product-code">套餐编码</FieldLabel>
              <Input
                id="service-product-code"
                value={values.code}
                onChange={(event) => update({ code: event.target.value })}
                maxLength={80}
                required
                disabled={pending}
              />
              <FieldDescription>已有订单的套餐编码由后端锁定，保存失败时刷新后重试。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="service-product-title">套餐名称</FieldLabel>
              <Input
                id="service-product-title"
                value={values.title}
                onChange={(event) => update({ title: event.target.value })}
                maxLength={120}
                required
                disabled={pending}
              />
            </Field>
            <TermYearsField
              value={values.termYears}
              disabled={pending}
              onChange={(termYears) => update({ termYears })}
            />
            <Field>
              <FieldLabel htmlFor="service-product-list-amount">标价</FieldLabel>
              <Input
                id="service-product-list-amount"
                value={values.listAmountYuan}
                onChange={(event) => update({ listAmountYuan: event.target.value })}
                inputMode="decimal"
                placeholder="例如 9800.00"
                required
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="service-product-amount">实付价</FieldLabel>
              <Input
                id="service-product-amount"
                value={values.amountYuan}
                onChange={(event) => update({ amountYuan: event.target.value })}
                inputMode="decimal"
                placeholder="例如 9800.00"
                required
                disabled={pending}
              />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="service-product-scope">服务范围</FieldLabel>
              <Textarea
                id="service-product-scope"
                rows={5}
                value={values.serviceScopeText}
                onChange={(event) => update({ serviceScopeText: event.target.value })}
                placeholder="每行一条，例如：客户专属系统环境部署"
                required
                disabled={pending}
              />
              <FieldDescription>每行一条，最多 20 条，会展示给小程序购买方确认。</FieldDescription>
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="service-product-terms">服务条款</FieldLabel>
              <Textarea
                id="service-product-terms"
                rows={6}
                value={values.termsContent}
                onChange={(event) => update({ termsContent: event.target.value })}
                required
                disabled={pending}
              />
            </Field>
          </FieldGroup>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          {notice ? <StatusAlert tone="success">{notice}</StatusAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              保存套餐
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TermYearsField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="service-product-term-years">服务年限</FieldLabel>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="service-product-term-years">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="1">1 年</SelectItem>
            <SelectItem value="2">2 年</SelectItem>
            <SelectItem value="3">3 年</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
