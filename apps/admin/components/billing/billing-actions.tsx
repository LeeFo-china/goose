"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Radar, WalletCards } from "lucide-react";
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SwitchSelect } from "@/components/billing/switch-select";
import type { BillingPricingRule, BillingTenant } from "@/components/billing/billing-types";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as {
    success?: boolean;
    data?: T;
    message?: string;
  };

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.data as T;
}

function buildIdempotencyKey(tenantId: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `manual_${tenantId}_${crypto.randomUUID()}`;
  }

  return `manual_${tenantId}_${Date.now()}`;
}

export function ManualRechargeButton({ tenant }: { tenant: BillingTenant }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const amountFen = Math.round(Number(formData.get("amount_yuan") || 0) * 100);
    const credits = Number(formData.get("credits") || 0);
    const bonusCredits = Number(formData.get("bonus_credits") || 0);
    const remark = String(formData.get("remark") || "").trim();

    startTransition(async () => {
      try {
        await requestJson(`/api/backend/platform/billing/tenants/${tenant.id}/manual-recharge`, {
          method: "POST",
          body: JSON.stringify({
            amount_fen: amountFen,
            credits,
            bonus_credits: bonusCredits,
            remark,
            idempotency_key: buildIdempotencyKey(tenant.id),
          }),
        });
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "充值失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <WalletCards className="size-4" />
          充值
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>人工充值</DialogTitle>
          <DialogDescription>
            {tenant.name || tenant.slug || tenant.id} 的积分会立即入账，并生成订单、流水和审计记录。
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`amount-${tenant.id}`}>充值金额（元）</FieldLabel>
              <Input id={`amount-${tenant.id}`} name="amount_yuan" type="number" min="0.01" step="0.01" required />
            </Field>
            <Field>
              <FieldLabel htmlFor={`credits-${tenant.id}`}>到账积分</FieldLabel>
              <Input id={`credits-${tenant.id}`} name="credits" type="number" min="1" step="1" required />
              <FieldDescription>建议按 1 元 = 1000 积分。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`bonus-${tenant.id}`}>赠送积分</FieldLabel>
              <Input id={`bonus-${tenant.id}`} name="bonus_credits" type="number" min="0" step="1" defaultValue="0" />
            </Field>
            <Field>
              <FieldLabel htmlFor={`remark-${tenant.id}`}>备注</FieldLabel>
              <Input id={`remark-${tenant.id}`} name="remark" maxLength={300} placeholder="线下收款凭证、审批单号" />
            </Field>
          </FieldGroup>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>取消</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              确认入账
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PricingRuleCreateButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [scope, setScope] = useState("platform_default");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const payload = {
      scope,
      tenant_id: scope === "tenant_override" ? String(formData.get("tenant_id") || "").trim() || null : null,
      metric_code: String(formData.get("metric_code") || "").trim(),
      scene_code: String(formData.get("scene_code") || "").trim() || null,
      provider: String(formData.get("provider") || "").trim() || null,
      model: String(formData.get("model") || "").trim() || null,
      unit: String(formData.get("unit") || "").trim(),
      unit_credits: Number(formData.get("unit_credits") || 0),
      min_charge_credits: Number(formData.get("min_charge_credits") || 0),
      priority: Number(formData.get("priority") || 100),
      version: Number(formData.get("version") || 1),
      enabled: true,
    };

    startTransition(async () => {
      try {
        await requestJson("/api/backend/platform/billing/pricing-rules", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "创建价格规则失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          新增规则
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>新增价格规则</DialogTitle>
          <DialogDescription>优先级越小越先命中，历史账单只读取生成时保存的价格快照。</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            <SwitchSelect
              label="规则范围"
              value={scope}
              onValueChange={setScope}
              options={[
                { value: "platform_default", label: "平台默认价" },
                { value: "tenant_override", label: "租户定制价" },
              ]}
            />
            <Field>
              <FieldLabel htmlFor="billing-rule-tenant">租户 ID</FieldLabel>
              <Input id="billing-rule-tenant" name="tenant_id" disabled={scope !== "tenant_override"} placeholder="定制价必填" />
            </Field>
            <Field>
              <FieldLabel htmlFor="billing-rule-metric">计费项</FieldLabel>
              <Input id="billing-rule-metric" name="metric_code" required placeholder="sms_domestic_success" />
            </Field>
            <Field>
              <FieldLabel htmlFor="billing-rule-scene">场景</FieldLabel>
              <Input id="billing-rule-scene" name="scene_code" placeholder="decoration_qa" />
            </Field>
            <Field>
              <FieldLabel htmlFor="billing-rule-provider">供应商</FieldLabel>
              <Input id="billing-rule-provider" name="provider" placeholder="openai/tencent" />
            </Field>
            <Field>
              <FieldLabel htmlFor="billing-rule-model">模型</FieldLabel>
              <Input id="billing-rule-model" name="model" placeholder="gpt-5.4-mini" />
            </Field>
            <Field>
              <FieldLabel htmlFor="billing-rule-unit">单位</FieldLabel>
              <Input id="billing-rule-unit" name="unit" required placeholder="message / minute / 1k_tokens" />
            </Field>
            <Field>
              <FieldLabel htmlFor="billing-rule-unit-credits">单价积分</FieldLabel>
              <Input id="billing-rule-unit-credits" name="unit_credits" type="number" min="0" step="1" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="billing-rule-min">最低扣费</FieldLabel>
              <Input id="billing-rule-min" name="min_charge_credits" type="number" min="0" step="1" defaultValue="0" />
            </Field>
            <Field>
              <FieldLabel htmlFor="billing-rule-priority">优先级</FieldLabel>
              <Input id="billing-rule-priority" name="priority" type="number" min="0" step="1" defaultValue="100" />
            </Field>
            <Field>
              <FieldLabel htmlFor="billing-rule-version">版本</FieldLabel>
              <Input id="billing-rule-version" name="version" type="number" min="1" step="1" defaultValue="1" />
            </Field>
          </FieldGroup>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>取消</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              保存规则
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PricingRuleStatusButton({ rule }: { rule: BillingPricingRule }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      await requestJson(`/api/backend/platform/billing/pricing-rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={toggle} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {rule.enabled ? "停用" : "启用"}
    </Button>
  );
}

export function ShadowBillingRunButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function run() {
    setError("");
    startTransition(async () => {
      try {
        await requestJson("/api/backend/platform/billing/shadow-run", {
          method: "POST",
          body: JSON.stringify({
            limit: 100,
            sources: ["ai", "sms", "social_video"],
          }),
        });
        router.refresh();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "影子计费执行失败");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={run} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
        运行影子计费
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
