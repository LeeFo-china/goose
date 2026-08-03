"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { ExternalLink, Save } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  buildVirtualChannelPatch,
  createVirtualChannelDraft,
  virtualPaymentEnvironmentLabels,
  type VirtualPaymentChannelDraft,
} from "@/components/settings/platform-virtual-payment-settings-data";
import { toSafeVirtualPaymentMutationMessage } from
  "@/components/settings/platform-virtual-payment-errors";
import type {
  PlatformVirtualPaymentChannelStatus,
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

export function PlatformVirtualPaymentChannelCard({
  summary,
  readonly,
  onSave,
}: {
  summary: PlatformVirtualPaymentProductSummary;
  readonly: boolean;
  onSave: (
    summary: PlatformVirtualPaymentProductSummary,
    draft: VirtualPaymentChannelDraft,
  ) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() =>
    createVirtualChannelDraft(summary.mapping)
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function update(patch: Partial<VirtualPaymentChannelDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readonly || pending) return;
    const patch = buildVirtualChannelPatch({ summary, draft });
    if (!patch.ok) {
      setError(patch.message);
      return;
    }

    setPending(true);
    setError("");
    try {
      await onSave(summary, draft);
    } catch (caught) {
      setError(toSafeVirtualPaymentMutationMessage(
        caught,
        "虚拟支付渠道配置保存失败，请刷新后重试。",
      ));
    } finally {
      setPending(false);
    }
  }

  const disabled = readonly || pending;
  const mapping = summary.mapping;
  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle>
            {virtualPaymentEnvironmentLabels[summary.environment]}渠道配置
          </CardTitle>
          <CardDescription>
            配置微信虚拟支付环境参数。商品事实、价格和微信侧发布操作在虚拟商品管理维护。
          </CardDescription>
        </div>
        <Badge variant={draft.status === "active" ? "success" : "secondary"}>
          {draft.status === "active" ? "已启用" : "已停用"}
        </Badge>
      </CardHeader>
      <form onSubmit={(event) => void submit(event)}>
        <CardContent className="flex flex-col gap-4">
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <ChannelTextField
              id={`${summary.environment}-channel-app-id`}
              label="小程序 AppID"
              value={draft.appId}
              disabled={disabled}
              onChange={(value) => update({ appId: value })}
            />
            <ChannelTextField
              id={`${summary.environment}-channel-merchant-id`}
              label="虚拟支付商户号"
              value={draft.virtualMerchantId}
              disabled={disabled}
              onChange={(value) => update({ virtualMerchantId: value })}
            />
            <ChannelTextField
              id={`${summary.environment}-channel-offer-id`}
              label="Offer ID"
              value={draft.offerId}
              disabled={disabled}
              onChange={(value) => update({ offerId: value })}
            />
            <Field data-disabled={disabled}>
              <FieldLabel htmlFor={`${summary.environment}-channel-status`}>
                渠道状态
              </FieldLabel>
              <Select
                value={draft.status}
                onValueChange={(value) =>
                  update({ status: value as PlatformVirtualPaymentChannelStatus })
                }
                disabled={disabled}
              >
                <SelectTrigger id={`${summary.environment}-channel-status`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="active">启用</SelectItem>
                    <SelectItem value="disabled">停用</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                启用前需配置当前环境 AppKey。渠道变更后关联虚拟商品需重新上传和校验。
              </FieldDescription>
            </Field>
          </FieldGroup>
          <div className="rounded-md border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>
                当前渠道版本：{mapping?.version ?? "-"}；AppKey 版本：{summary.secret.revision ?? mapping?.secret_revision ?? "-"}
              </span>
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href="/platform/virtual-products">
                  <ExternalLink data-icon="inline-start" />
                  去管理虚拟商品
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end border-t pt-5">
          <Button type="submit" disabled={disabled}>
            {pending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            {pending ? "保存中" : "保存渠道配置"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function ChannelTextField({
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
