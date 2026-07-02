"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Power, Settings } from "lucide-react";
import type {
  PlatformRechargeProduct,
  PlatformWechatPayConfigResult,
} from "@/components/billing/billing-types";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

type SelectOption = { label: string; value: string };

const statusOptions: SelectOption[] = [
  { label: "待配置", value: "pending" },
  { label: "启用", value: "active" },
  { label: "停用", value: "disabled" },
  { label: "暂停", value: "suspended" },
];

const enabledOptions: SelectOption[] = [
  { label: "启用", value: "true" },
  { label: "停用", value: "false" },
];

async function requestJson<T>(path: string, init?: RequestInit) {
  return requestBackendJson<T>(path, init);
}

export function PlatformWechatPayConfigButton({
  configResult,
}: {
  configResult: PlatformWechatPayConfigResult;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const config = configResult.config;
  const [status, setStatus] = useState<string>(config?.status || "pending");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const serialNo = stringField(formData, "serial_no");
    const payload: Record<string, unknown> = {
      merchant_mode: "direct_merchant",
      merchant_name: stringField(formData, "merchant_name"),
      merchant_id: stringField(formData, "merchant_id"),
      app_id: stringField(formData, "app_id"),
      encrypted_config_ref: stringField(formData, "encrypted_config_ref"),
      notify_url: stringField(formData, "notify_url"),
      enabled_channels: ["tenant_recharge"],
      status,
    };
    if (serialNo) payload.serial_no = serialNo;

    startTransition(async () => {
      try {
        await requestJson("/api/backend/platform/payment/wechat-pay/config", {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "保存平台微信支付配置失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={!configResult.can_manage}>
          <Settings data-icon="inline-start" />
          配置商户
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>平台微信支付配置</DialogTitle>
          <DialogDescription>用于小程序员工侧积分充值，密钥只保存引用，不在页面展示明文。</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            <TextField label="商户名称" name="merchant_name" defaultValue={config?.merchant_name} />
            <TextField label="商户号" name="merchant_id" defaultValue={config?.merchant_id} required />
            <TextField label="小程序 AppID" name="app_id" defaultValue={config?.app_id} required />
            <TextField label="密钥引用" name="encrypted_config_ref" defaultValue={config?.encrypted_config_ref} required />
            <TextField label="证书序列号" name="serial_no" placeholder={config?.serial_no_masked || ""} />
            <TextField label="回调地址" name="notify_url" defaultValue={config?.notify_url} required />
            <SelectField label="配置状态" value={status} onValueChange={setStatus} options={statusOptions} />
          </FieldGroup>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>取消</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存配置
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RechargeProductCreateButton() {
  return <RechargeProductDialog mode="create" />;
}

export function RechargeProductEditButton({ product }: { product: PlatformRechargeProduct }) {
  return <RechargeProductDialog mode="edit" product={product} />;
}

export function RechargeProductStatusButton({ product }: { product: PlatformRechargeProduct }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      await requestJson(`/api/backend/platform/billing/recharge-products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !product.enabled }),
      });
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={toggle} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Power data-icon="inline-start" />}
      {product.enabled ? "停用" : "启用"}
    </Button>
  );
}

function RechargeProductDialog({
  mode,
  product,
}: {
  mode: "create" | "edit";
  product?: PlatformRechargeProduct;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(product?.enabled === false ? "false" : "true");
  const isEdit = mode === "edit" && Boolean(product);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const payload = {
      code: stringField(formData, "code"),
      title: stringField(formData, "title"),
      amount_fen: Math.round(Number(formData.get("amount_yuan") || 0) * 100),
      credits: numberField(formData, "credits"),
      bonus_credits: numberField(formData, "bonus_credits"),
      enabled: enabled === "true",
      sort_order: numberField(formData, "sort_order"),
      metadata: {},
    };
    const path = isEdit && product
      ? `/api/backend/platform/billing/recharge-products/${product.id}`
      : "/api/backend/platform/billing/recharge-products";

    startTransition(async () => {
      try {
        await requestJson(path, {
          method: isEdit ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        });
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "保存充值套餐失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={isEdit ? "outline" : "default"}>
          {isEdit ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
          {isEdit ? "编辑" : "新增套餐"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑充值套餐" : "新增充值套餐"}</DialogTitle>
          <DialogDescription>套餐金额和到账积分由后端保存，小程序下单时只传套餐编码。</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            <TextField label="套餐编码" name="code" defaultValue={product?.code} required readOnly={isEdit} />
            <TextField label="套餐名称" name="title" defaultValue={product?.title} required />
            <TextField label="金额（元）" name="amount_yuan" type="number" defaultValue={product ? String(product.amount_fen / 100) : ""} required />
            <TextField label="到账积分" name="credits" type="number" defaultValue={product?.credits} required />
            <TextField label="赠送积分" name="bonus_credits" type="number" defaultValue={product?.bonus_credits ?? 0} />
            <TextField label="排序" name="sort_order" type="number" defaultValue={product?.sort_order ?? 100} />
            <SelectField label="套餐状态" value={enabled} onValueChange={setEnabled} options={enabledOptions} />
          </FieldGroup>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>取消</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存套餐
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TextField({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  required,
  disabled,
  readOnly,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  type?: "text" | "number";
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
      />
    </Field>
  );
}

function SelectField({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function stringField(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  return value || null;
}

function numberField(formData: FormData, key: string) {
  return Number(formData.get(key) || 0);
}
