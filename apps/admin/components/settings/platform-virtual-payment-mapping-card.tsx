"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { Save } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { formatFenAsYuanInput } from "@/components/branding-addon/platform-branding-addon-product-form-data";
import {
  createVirtualMappingDraft,
  virtualPaymentEnvironmentLabels,
  type VirtualPaymentMappingDraft,
} from "@/components/settings/platform-virtual-payment-settings-data";
import { VirtualPaymentImageField } from
  "@/components/settings/platform-virtual-payment-image-field";
import { toSafeVirtualPaymentMutationMessage } from
  "@/components/settings/platform-virtual-payment-errors";
import { formatDateTime } from "@/components/settings/platform-payment-settings-shared";
import type {
  PlatformVirtualPaymentMappingStatus,
  PlatformVirtualPaymentProductSummary,
} from "@/components/settings/platform-virtual-payment-settings-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";

export function VirtualPaymentMappingCard({
  summary,
  productAmountFen,
  readonly,
  onSave,
  goodsFlow,
}: {
  summary: PlatformVirtualPaymentProductSummary;
  productAmountFen: number | null;
  readonly: boolean;
  onSave: (
    summary: PlatformVirtualPaymentProductSummary,
    draft: VirtualPaymentMappingDraft,
    amountYuan: string,
  ) => Promise<void>;
  goodsFlow: ReactNode;
}) {
  const [draft, setDraft] = useState(() => createVirtualMappingDraft(summary.mapping));
  const [amountYuan, setAmountYuan] = useState(() =>
    formatFenAsYuanInput(summary.mapping?.expected_amount_fen ?? productAmountFen)
  );
  const [pendingAction, setPendingAction] = useState<"save" | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [error, setError] = useState("");
  const formPending = Boolean(pendingAction || imageUploading);

  function updateDraft(patch: Partial<VirtualPaymentMappingDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readonly || formPending) return;
    setError("");
    setPendingAction("save");
    try {
      await onSave(summary, draft, amountYuan);
    } catch (caught) {
      setError(toSafeVirtualPaymentMutationMessage(
        caught,
        "虚拟商品映射保存失败，请刷新后重试。",
      ));
    } finally {
      setPendingAction(null);
    }
  }

  const mapping = summary.mapping;
  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle>
            {virtualPaymentEnvironmentLabels[summary.environment]}映射
          </CardTitle>
          <CardDescription>
            关联微信虚拟商品与平台年度权益，敏感字段变化后必须重新校验。
          </CardDescription>
          <p className="text-xs text-muted-foreground">
            最近校验：{mapping?.validated_at
              ? formatDateTime(mapping.validated_at)
              : "暂无"}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge variant={mapping?.status === "active" ? "success" : "secondary"}>
            {mappingStatusLabel(mapping?.status)}
          </Badge>
          <Badge variant={mapping?.validation_status === "valid" ? "success" : "warning"}>
            {validationStatusLabel(mapping?.validation_status)}
          </Badge>
        </div>
      </CardHeader>
      <form onSubmit={submit}>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            {error ? (
              <div className="md:col-span-2">
                <StatusAlert>{error}</StatusAlert>
              </div>
            ) : null}
            <MappingTextField
              id={`${summary.environment}-app-id`}
              label="小程序 AppID"
              value={draft.appId}
              disabled={readonly || formPending}
              onChange={(value) => updateDraft({ appId: value })}
            />
            <MappingTextField
              id={`${summary.environment}-virtual-merchant-id`}
              label="虚拟支付商户号"
              value={draft.virtualMerchantId}
              disabled={readonly || formPending}
              onChange={(value) => updateDraft({ virtualMerchantId: value })}
            />
            <MappingTextField
              id={`${summary.environment}-offer-id`}
              label="Offer ID"
              value={draft.offerId}
              disabled={readonly || formPending}
              onChange={(value) => updateDraft({ offerId: value })}
            />
            <MappingTextField
              id={`${summary.environment}-provider-product-id`}
              label="渠道商品 ID"
              value={draft.providerProductId}
              disabled={readonly || formPending}
              onChange={(value) => updateDraft({ providerProductId: value })}
            />
            <VirtualPaymentImageField
              id={`${summary.environment}-item-url`}
              value={draft.itemUrl}
              disabled={readonly || Boolean(pendingAction)}
              onChange={(itemUrl) => updateDraft({ itemUrl })}
              onPendingChange={setImageUploading}
            />
            <Field data-disabled={readonly || formPending}>
              <FieldLabel htmlFor={`${summary.environment}-amount`}>
                核验价格（元）
              </FieldLabel>
              <Input
                id={`${summary.environment}-amount`}
                type="text"
                inputMode="decimal"
                value={amountYuan}
                onChange={(event) => setAmountYuan(event.target.value)}
                disabled={readonly || formPending}
                required
              />
              <FieldDescription>
                必须与平台权益统一售价和微信渠道价格一致。
              </FieldDescription>
            </Field>
            <Field data-disabled={readonly || formPending}>
              <FieldLabel htmlFor={`${summary.environment}-mapping-status`}>
                映射状态
              </FieldLabel>
              <Select
                value={draft.status}
                onValueChange={(value) =>
                  updateDraft({
                    status: value as PlatformVirtualPaymentMappingStatus,
                  })
                }
                disabled={readonly || formPending}
              >
                <SelectTrigger id={`${summary.environment}-mapping-status`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="draft">草稿</SelectItem>
                    <SelectItem value="active">启用</SelectItem>
                    <SelectItem value="disabled">停用</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                敏感配置变化会自动退回草稿状态。
              </FieldDescription>
            </Field>
          </FieldGroup>
          <Separator className="my-5" />
          {goodsFlow}
        </CardContent>
        <CardFooter className="flex-wrap justify-end gap-2 border-t pt-5">
          <Button
            type="submit"
            disabled={readonly || Boolean(pendingAction || imageUploading)}
          >
            {pendingAction === "save"
              ? <Spinner data-icon="inline-start" />
              : <Save data-icon="inline-start" />}
            {pendingAction === "save" ? "保存中" : "保存映射"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function MappingTextField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required
      />
    </Field>
  );
}

function mappingStatusLabel(status?: PlatformVirtualPaymentMappingStatus) {
  if (status === "active") return "已启用";
  if (status === "disabled") return "已停用";
  return status === "draft" ? "草稿" : "未配置";
}

function validationStatusLabel(status?: "pending" | "valid" | "invalid") {
  if (status === "valid") return "校验通过";
  if (status === "invalid") return "校验失败";
  return status === "pending" ? "待校验" : "未校验";
}
