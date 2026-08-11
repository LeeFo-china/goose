"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";

import { trialCapabilityOptions } from "./platform-service-trial-rules";
import { createTrialIdempotencyIntent } from "./platform-service-trial-idempotency";
import type {
  PlatformServiceTrialCapability,
  PlatformServiceTrialPolicyData,
} from "./platform-service-trial-types";

export function PlatformServiceTrialPolicyDialog({
  disabledReason,
}: {
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<PlatformServiceTrialPolicyData | null>(null);
  const [allowRepeat, setAllowRepeat] = useState(false);
  const [standardScope, setStandardScope] = useState<PlatformServiceTrialCapability[]>([]);
  const [guidedScope, setGuidedScope] = useState<PlatformServiceTrialCapability[]>([]);
  const idempotencyIntent = useRef(createTrialIdempotencyIntent()).current;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    requestBackendJson<PlatformServiceTrialPolicyData>(
      "/platform/billing/service-trial-policy",
      { fallbackMessage: "试用规则加载失败" },
    )
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setAllowRepeat(result.policy.allow_repeat);
        setStandardScope(result.policy.standard_scope.capabilities);
        setGuidedScope(result.policy.guided_scope.capabilities);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "试用规则加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const form = new FormData(event.currentTarget);
    const reminderDays = String(form.get("reminder_days") || "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0)
      .sort((left, right) => right - left);
    if (!reminderDays.length || !standardScope.length || !guidedScope.length) {
      setError("提醒节点、标准试用范围和陪跑试用范围不能为空");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const result = await requestBackendJson<PlatformServiceTrialPolicyData>(
        "/platform/billing/service-trial-policy",
        {
          method: "PUT",
          body: JSON.stringify({
            default_trial_days: Number(form.get("default_trial_days")),
            default_grace_days: Number(form.get("default_grace_days")),
            max_trial_days: Number(form.get("max_trial_days")),
            max_grace_days: Number(form.get("max_grace_days")),
            max_schedule_ahead_days: Number(form.get("max_schedule_ahead_days")),
            max_extension_count: Number(form.get("max_extension_count")),
            max_extension_days: Number(form.get("max_extension_days")),
            reminder_days: reminderDays,
            reapply_cooldown_days: Number(form.get("reapply_cooldown_days")),
            allow_repeat_application: allowRepeat,
            standard_scope: { version: 1, capabilities: standardScope },
            guided_scope: { version: 1, capabilities: guidedScope },
            expected_version: data.policy.version,
            idempotency_key: idempotencyIntent.current(),
            reason: String(form.get("reason") || "").trim(),
          }),
          fallbackMessage: "试用规则保存失败",
        },
      );
      setData(result);
      toast.success("试用规则已保存");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "试用规则保存失败";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) idempotencyIntent.beginNew();
    setOpen(nextOpen);
  }

  const updateAction = data?.available_actions.update_policy;
  const canUpdate = updateAction?.enabled === true;
  const policy = data?.policy;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" title={disabledReason}>
          <SlidersHorizontal data-icon="inline-start" />
          试用规则
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>技术服务试用规则</DialogTitle>
          <DialogDescription>
            只影响以后新开的试用，不影响已生效记录。
          </DialogDescription>
        </DialogHeader>
        {error && !policy ? (
          <div className="flex flex-col gap-2">
            <StatusAlert>{error}</StatusAlert>
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setOpen(false)}>
              <RefreshCw data-icon="inline-start" />
              关闭后重试
            </Button>
          </div>
        ) : null}
        {loading && !policy ? <PolicySkeleton /> : null}
        {policy ? (
          <form key={policy.version} className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <NumberField name="default_trial_days" label="默认试用天数" value={policy.trial_days} min={1} max={60} disabled={!canUpdate} />
                <NumberField name="default_grace_days" label="默认宽限期" value={policy.grace_days} min={0} max={14} disabled={!canUpdate} />
                <NumberField name="max_trial_days" label="最大试用天数" value={policy.max_trial_days} min={1} max={60} disabled={!canUpdate} />
                <NumberField name="max_grace_days" label="最大宽限期" value={policy.max_grace_days} min={0} max={14} disabled={!canUpdate} />
                <NumberField name="max_schedule_ahead_days" label="最多提前安排" value={policy.max_schedule_days} min={0} max={30} disabled={!canUpdate} />
                <NumberField name="max_extension_count" label="最多延期次数" value={policy.max_extension_count} min={0} max={10} disabled={!canUpdate} />
                <NumberField name="max_extension_days" label="单次最大延期" value={policy.max_extension_days} min={1} max={30} disabled={!canUpdate} />
                <NumberField name="reapply_cooldown_days" label="重复申请冷却期" value={policy.reapply_cooldown_days} min={0} max={365} disabled={!canUpdate} />
              </div>
              <Field>
                <FieldLabel htmlFor="trial-reminder-days">提醒节点</FieldLabel>
                <Input id="trial-reminder-days" name="reminder_days" defaultValue={policy.reminder_days.join(", ")} disabled={!canUpdate} />
                <FieldDescription>使用英文逗号分隔，按距到期日从大到小填写。</FieldDescription>
              </Field>
              <Field orientation="horizontal" data-disabled={!canUpdate}>
                <Switch id="allow-repeat-trial" checked={allowRepeat} onCheckedChange={setAllowRepeat} disabled={!canUpdate} />
                <div>
                  <FieldLabel htmlFor="allow-repeat-trial">允许租户重复自主申请</FieldLabel>
                  <FieldDescription>仍受冷却期和正式服务状态约束。</FieldDescription>
                </div>
              </Field>
              <ScopeFields title="标准试用默认范围" scope={standardScope} setScope={setStandardScope} disabled={!canUpdate} />
              <ScopeFields title="陪跑试用默认范围" scope={guidedScope} setScope={setGuidedScope} disabled={!canUpdate} />
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="trial-policy-reason">修改原因</FieldLabel>
                <Textarea id="trial-policy-reason" name="reason" maxLength={500} disabled={!canUpdate} required />
              </Field>
            </FieldGroup>
            {!canUpdate && updateAction?.disabled_reason ? (
              <p className="text-sm text-muted-foreground">{updateAction.disabled_reason}</p>
            ) : null}
            <FieldError>{error}</FieldError>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>关闭</Button>
              <Button type="submit" disabled={!canUpdate || submitting}>
                <span className="relative inline-flex size-4 items-center justify-center">
                  <SlidersHorizontal className={submitting ? "invisible" : undefined} />
                  <Spinner className={submitting ? "absolute" : "invisible absolute"} />
                </span>
                保存规则
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NumberField({ name, label, value, min, max, disabled }: { name: string; label: string; value: number; min: number; max: number; disabled: boolean }) {
  return <Field><FieldLabel htmlFor={name}>{label}</FieldLabel><Input id={name} name={name} type="number" min={min} max={max} defaultValue={value} disabled={disabled} required /></Field>;
}

function ScopeFields({ title, scope, setScope, disabled }: { title: string; scope: PlatformServiceTrialCapability[]; setScope: (scope: PlatformServiceTrialCapability[]) => void; disabled: boolean }) {
  return <FieldSet><FieldLegend variant="label">{title}</FieldLegend><div className="grid gap-2 sm:grid-cols-3">{trialCapabilityOptions.map((option) => <Field key={option.value} orientation="horizontal" data-disabled={disabled}><Checkbox id={`${title}-${option.value}`} checked={scope.includes(option.value)} onCheckedChange={(checked) => setScope(checked ? [...scope, option.value] : scope.filter((value) => value !== option.value))} disabled={disabled} /><FieldLabel htmlFor={`${title}-${option.value}`} className="font-normal">{option.label}</FieldLabel></Field>)}</div></FieldSet>;
}

function PolicySkeleton() {
  return <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>;
}
