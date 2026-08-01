"use client";

import { type FormEvent, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { formatFenAsYuanInput } from "@/components/branding-addon/platform-branding-addon-product-form-data";
import {
  createVirtualMappingDraft,
  virtualPaymentEnvironmentLabels,
  type VirtualPaymentMappingDraft,
} from "@/components/settings/platform-virtual-payment-settings-data";
import {
  type SafeVirtualPaymentMutationFeedback,
  toSafeVirtualPaymentMutationMessage,
} from "@/components/settings/platform-virtual-payment-errors";
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

export function VirtualPaymentMappingCard({
  summary,
  productAmountFen,
  readonly,
  onSave,
  onValidate,
  validationFeedback,
}: {
  summary: PlatformVirtualPaymentProductSummary;
  productAmountFen: number | null;
  readonly: boolean;
  onSave: (
    summary: PlatformVirtualPaymentProductSummary,
    draft: VirtualPaymentMappingDraft,
    amountYuan: string,
  ) => Promise<void>;
  onValidate: (summary: PlatformVirtualPaymentProductSummary) => Promise<void>;
  validationFeedback: SafeVirtualPaymentMutationFeedback | null;
}) {
  const [draft, setDraft] = useState(() => createVirtualMappingDraft(summary.mapping));
  const [amountYuan, setAmountYuan] = useState(() =>
    formatFenAsYuanInput(summary.mapping?.expected_amount_fen ?? productAmountFen)
  );
  const [pendingAction, setPendingAction] = useState<"save" | "validate" | null>(null);
  const [error, setError] = useState("");

  function updateDraft(patch: Partial<VirtualPaymentMappingDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readonly || pendingAction) return;
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

  async function validate() {
    if (readonly || pendingAction) return;
    setError("");
    setPendingAction("validate");
    try {
      await onValidate(summary);
    } catch (caught) {
      setError(toSafeVirtualPaymentMutationMessage(
        caught,
        "虚拟商品映射校验失败，请检查配置。",
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
            {validationFeedback ? (
              <div className="md:col-span-2">
                <StatusAlert title="校验未通过">
                  <span>{validationFeedback.message}</span>
                  {validationFeedback.code || validationFeedback.requestId ? (
                    <span className="mt-1 block break-all text-xs">
                      {validationFeedback.code
                        ? `错误码：${validationFeedback.code}`
                        : null}
                      {validationFeedback.code && validationFeedback.requestId
                        ? "；"
                        : null}
                      {validationFeedback.requestId
                        ? `Request-ID：${validationFeedback.requestId}`
                        : null}
                    </span>
                  ) : null}
                </StatusAlert>
              </div>
            ) : null}
            <MappingTextField
              id={`${summary.environment}-app-id`}
              label="小程序 AppID"
              value={draft.appId}
              disabled={readonly || Boolean(pendingAction)}
              onChange={(value) => updateDraft({ appId: value })}
            />
            <MappingTextField
              id={`${summary.environment}-virtual-merchant-id`}
              label="虚拟支付商户号"
              value={draft.virtualMerchantId}
              disabled={readonly || Boolean(pendingAction)}
              onChange={(value) => updateDraft({ virtualMerchantId: value })}
            />
            <MappingTextField
              id={`${summary.environment}-offer-id`}
              label="Offer ID"
              value={draft.offerId}
              disabled={readonly || Boolean(pendingAction)}
              onChange={(value) => updateDraft({ offerId: value })}
            />
            <MappingTextField
              id={`${summary.environment}-provider-product-id`}
              label="渠道商品 ID"
              value={draft.providerProductId}
              disabled={readonly || Boolean(pendingAction)}
              onChange={(value) => updateDraft({ providerProductId: value })}
            />
            <Field data-disabled={readonly || Boolean(pendingAction)}>
              <FieldLabel htmlFor={`${summary.environment}-amount`}>
                核验价格（元）
              </FieldLabel>
              <Input
                id={`${summary.environment}-amount`}
                type="text"
                inputMode="decimal"
                value={amountYuan}
                onChange={(event) => setAmountYuan(event.target.value)}
                disabled={readonly || Boolean(pendingAction)}
                required
              />
              <FieldDescription>
                必须与平台权益统一售价和微信渠道价格一致。
              </FieldDescription>
            </Field>
            <Field data-disabled={readonly || Boolean(pendingAction)}>
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
                disabled={readonly || Boolean(pendingAction)}
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
        </CardContent>
        <CardFooter className="flex-wrap justify-end gap-2 border-t pt-5">
          <Button
            type="button"
            variant="outline"
            disabled={readonly || Boolean(pendingAction) || !mapping}
            onClick={() => void validate()}
          >
            {pendingAction === "validate"
              ? <Spinner data-icon="inline-start" />
              : <CheckCircle2 data-icon="inline-start" />}
            {pendingAction === "validate" ? "校验中" : "校验映射"}
          </Button>
          <Button type="submit" disabled={readonly || Boolean(pendingAction)}>
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
