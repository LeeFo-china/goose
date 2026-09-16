"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import { buildPromotionPayload, createInitialPlatformServicePromotionFormValues } from "./platform-service-promotion-form-data";
import type { PlatformServicePromotionFormValues, PlatformServicePromotionListItem } from "./platform-service-promotion-types";

export function PlatformServicePromotionFormButton({ promotion, disabled, onSaved }: {
  promotion?: PlatformServicePromotionListItem;
  disabled?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState(() => createInitialPlatformServicePromotionFormValues(promotion));

  function changeOpen(nextOpen: boolean) {
    if (!pendingRef.current) {
      if (nextOpen) {
        setValues(createInitialPlatformServicePromotionFormValues(promotion));
        setError("");
      }
      setOpen(nextOpen);
    }
  }

  function update(patch: Partial<PlatformServicePromotionFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    const payload = buildPromotionPayload(values, promotion?.version);
    if (!payload.ok) {
      setError(payload.message);
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      await requestBackendJson(
        promotion ? `/platform/billing/service-promotions/${promotion.id}` : "/platform/billing/service-promotions",
        {
          method: promotion ? "PATCH" : "POST",
          body: JSON.stringify(payload.body),
          fallbackMessage: "保存活动草稿失败",
        },
      );
      setOpen(false);
      router.refresh();
      onSaved?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存活动草稿失败");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant={promotion ? "outline" : "default"} disabled={disabled}>
          {promotion ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
          {promotion ? "编辑活动草稿" : "新建限时活动"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto" aria-busy={pending}>
        <DialogHeader>
          <DialogTitle>{promotion ? "编辑活动草稿" : "新建限时活动"}</DialogTitle>
          <DialogDescription>保存为草稿后，可在活动详情确认三档价格并发布。</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
          <FieldSet disabled={pending}>
            <FieldLegend variant="label">运营内容</FieldLegend>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${fieldId}-name`}>活动名称</FieldLabel>
                <Input id={`${fieldId}-name`} required maxLength={80} value={values.name} onChange={(event) => update({ name: event.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldId}-badge`}>活动角标</FieldLabel>
                <Input id={`${fieldId}-badge`} required maxLength={20} value={values.badgeText} onChange={(event) => update({ badgeText: event.target.value })} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor={`${fieldId}-title`}>活动标题</FieldLabel>
                <Input id={`${fieldId}-title`} required maxLength={60} value={values.title} onChange={(event) => update({ title: event.target.value })} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor={`${fieldId}-summary`}>活动说明</FieldLabel>
                <Textarea id={`${fieldId}-summary`} required rows={2} maxLength={200} value={values.summary} onChange={(event) => update({ summary: event.target.value })} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor={`${fieldId}-rules`}>活动规则</FieldLabel>
                <Textarea id={`${fieldId}-rules`} rows={3} maxLength={2000} value={values.rulesText} onChange={(event) => update({ rulesText: event.target.value })} />
              </Field>
            </FieldGroup>
          </FieldSet>
          <Separator />
          <FieldSet disabled={pending}>
            <FieldLegend variant="label">价格与时间</FieldLegend>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor={`${fieldId}-discount`}>折扣</FieldLabel>
                <Input id={`${fieldId}-discount`} inputMode="decimal" required value={values.discountRate} onChange={(event) => update({ discountRate: event.target.value })} />
                <FieldDescription>填写 0.1 至 9.9 折，例如 2 表示 2 折。适用于 1 年、2 年、3 年套餐。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldId}-start`}>开始时间</FieldLabel>
                <Input id={`${fieldId}-start`} type="datetime-local" value={values.startsAt} onChange={(event) => update({ startsAt: event.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldId}-end`}>结束时间</FieldLabel>
                <Input id={`${fieldId}-end`} type="datetime-local" value={values.endsAt} onChange={(event) => update({ endsAt: event.target.value })} />
              </Field>
            </FieldGroup>
            <FieldDescription>使用当前浏览器时区；草稿可暂不排期，发布前需填写完整时间。</FieldDescription>
          </FieldSet>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => changeOpen(false)}>取消</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              保存活动草稿
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
