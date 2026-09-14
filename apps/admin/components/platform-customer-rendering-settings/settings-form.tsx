"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import { buildSettingsCommand, fenToYuan, type SettingsFormErrors,
  type SettingsFormValues } from "./settings-form-data";
import type { TenantRenderingSettings } from "./settings-types";

function initialValues(settings: TenantRenderingSettings): SettingsFormValues {
  return { enabled: settings.enabled,
    dailyTaskLimit: settings.daily_task_limit?.toString() ?? "",
    dailyBudgetYuan: fenToYuan(settings.daily_budget_fen),
    perJobReserveYuan: fenToYuan(settings.per_job_reserve_fen), reason: "" };
}

export function TenantRenderingSettingsForm({ tenantId, tenantActive, settings }: {
  tenantId: string; tenantActive: boolean; settings: TenantRenderingSettings;
}) {
  const router = useRouter();
  const [values, setValues] = useState(() => initialValues(settings));
  const [errors, setErrors] = useState<SettingsFormErrors>({});
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function change<K extends keyof SettingsFormValues>(key: K, value: SettingsFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSaveError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || conflict) return;
    const result = buildSettingsCommand(values, settings.version);
    if (!result.ok) { setErrors(result.errors); return; }
    setErrors({});
    setPending(true);
    setSaveError(null);
    try {
      await requestBackendJson<TenantRenderingSettings>(
        `/platform/customer-rendering-settings/${tenantId}`,
        { method: "PUT", body: JSON.stringify(result.command),
          fallbackMessage: "客户生图额度保存失败" },
      );
      toast.success("客户生图额度已保存");
      router.refresh();
    } catch (error) {
      const failure = error as { status?: number; code?: string };
      if (failure.status === 409 && failure.code === "RENDERING_SETTINGS_VERSION_STALE") {
        setConflict(true);
        setSaveError("设置已被其他管理员修改。请刷新核对后重新提交，当前输入会保留到刷新前。");
      } else if (failure.status === 409 && failure.code === "RENDERING_SETTINGS_TENANT_INACTIVE") {
        setSaveError("租户未启用，不能开放客户生图。请先核对租户状态。");
      } else {
        setSaveError("保存结果未确认，请刷新当前设置和审计记录后再决定是否重试。");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>修改试点额度</CardTitle>
        <CardDescription>金额按元填写，保存时以整数分提交；每次修改都会记录操作原因。</CardDescription>
      </CardHeader>
      <form onSubmit={(event) => void save(event)}>
        <CardContent className="flex flex-col gap-4">
          {!tenantActive ? (
            <Alert><AlertTitle>租户已停用</AlertTitle>
              <AlertDescription>可保存关闭状态的额度，启用试点需先恢复租户。</AlertDescription>
            </Alert>
          ) : null}
          {saveError ? (
            <Alert variant="destructive"><AlertTitle>设置未更新</AlertTitle>
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field data-invalid={Boolean(errors.dailyTaskLimit)}>
              <FieldLabel htmlFor="rendering-daily-task-limit">每日任务上限</FieldLabel>
              <Input id="rendering-daily-task-limit" inputMode="numeric" value={values.dailyTaskLimit}
                onChange={(event) => change("dailyTaskLimit", event.target.value)}
                disabled={pending || conflict} aria-invalid={Boolean(errors.dailyTaskLimit)} />
              <FieldError>{errors.dailyTaskLimit}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.dailyBudgetYuan)}>
              <FieldLabel htmlFor="rendering-daily-budget">日预算（元）</FieldLabel>
              <Input id="rendering-daily-budget" inputMode="decimal" value={values.dailyBudgetYuan}
                onChange={(event) => change("dailyBudgetYuan", event.target.value)}
                disabled={pending || conflict} aria-invalid={Boolean(errors.dailyBudgetYuan)} />
              <FieldError>{errors.dailyBudgetYuan}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.perJobReserveYuan)}>
              <FieldLabel htmlFor="rendering-per-job-reserve">单任务预占（元）</FieldLabel>
              <Input id="rendering-per-job-reserve" inputMode="decimal" value={values.perJobReserveYuan}
                onChange={(event) => change("perJobReserveYuan", event.target.value)}
                disabled={pending || conflict} aria-invalid={Boolean(errors.perJobReserveYuan)} />
              <FieldDescription>预占不能超过日预算，且应覆盖一次任务的最高计费。</FieldDescription>
              <FieldError>{errors.perJobReserveYuan}</FieldError>
            </Field>
            <Field orientation="horizontal" className="md:self-center">
              <Switch id="rendering-pilot-enabled" checked={values.enabled}
                onCheckedChange={(checked) => change("enabled", checked)}
                disabled={pending || conflict || (!tenantActive && !values.enabled)} />
              <FieldLabel htmlFor="rendering-pilot-enabled">开启客户生图试点</FieldLabel>
            </Field>
            <Field data-invalid={Boolean(errors.reason)} className="md:col-span-2">
              <FieldLabel htmlFor="rendering-settings-reason">操作原因</FieldLabel>
              <Textarea id="rendering-settings-reason" value={values.reason} maxLength={240}
                onChange={(event) => change("reason", event.target.value)}
                disabled={pending || conflict} aria-invalid={Boolean(errors.reason)} />
              <FieldDescription>填写 3–240 字，不含客户隐私或换行。</FieldDescription>
              <FieldError>{errors.reason}</FieldError>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || conflict}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {values.enabled ? "保存并开启试点" : "保存并保持关闭"}
          </Button>
          {conflict ? <Button type="button" variant="outline" onClick={() => router.refresh()}>
            刷新当前设置
          </Button> : null}
          {errors.form ? <span className="text-sm text-destructive">{errors.form}</span> : null}
        </CardFooter>
      </form>
    </Card>
  );
}
