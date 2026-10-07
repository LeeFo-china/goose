"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusAlert } from "@/components/admin/status-alert";
import { requestBackendJson } from "@/lib/backend-client";
import type { PlatformTenantRecord } from "./platform-tenant-types";

export function PlatformTenantTrialExtension({ tenant }: { tenant: PlatformTenantRecord }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [intent, setIntent] = useState("");
  const trial = tenant.service_access;
  if (!trial?.can_extend || !trial.trial_id || !trial.version) return null;
  const trialId = trial.trial_id;
  const version = trial.version;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await requestBackendJson(`/platform/billing/service-trials/${trialId}/extend`, {
        method: "POST",
        body: JSON.stringify({
          extension_days: Number(data.get("extension_days")),
          reason: String(data.get("reason") || "").trim(),
          expected_version: version,
          idempotency_key: intent,
        }),
        fallbackMessage: "延长试用失败",
      });
      toast.success("试用期限已延长");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "延长试用失败");
    } finally {
      setPending(false);
    }
  }

  return <>
    <Button variant="outline" size="sm" onClick={() => {
      setIntent(crypto.randomUUID());
      setError("");
      setOpen(true);
    }}>延长试用</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>延长试用期限</DialogTitle>
          <DialogDescription>{tenant.name}，当前试用截止：{trial.trial_ends_at
            ? new Date(trial.trial_ends_at).toLocaleString("zh-CN") : "—"}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`extend-days-${tenant.id}`}>延长天数</FieldLabel>
              <Input id={`extend-days-${tenant.id}`} name="extension_days" type="number"
                min={1} max={365} step={1} defaultValue={7} required disabled={pending} />
              <FieldDescription>
                试用中从原截止时间延长；只读宽限期内从现在重新计时并恢复试用。延期后保留原有只读宽限时长（手动新建租户为 7 天）。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`extend-reason-${tenant.id}`}>延长原因</FieldLabel>
              <Textarea id={`extend-reason-${tenant.id}`} name="reason" maxLength={500}
                required disabled={pending} />
            </Field>
          </FieldGroup>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit" disabled={pending}>{pending ? "提交中…" : "确认延长"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
