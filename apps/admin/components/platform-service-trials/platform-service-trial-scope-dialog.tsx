"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import { createTrialIdempotencyIntent } from "./platform-service-trial-idempotency";
import { formatTrialDateTime } from "./platform-service-trial-rules";
import { PlatformServiceTrialScopeSelector } from "./platform-service-trial-scope-selector";
import { buildTrialScopeCommand, getTrialScopeAction, isTrialScopeConflict } from "./platform-service-trial-scope-state";
import type { PlatformServiceTrialCapability, PlatformServiceTrialDetailData } from "./platform-service-trial-types";

export function PlatformServiceTrialScopeDialog({ trialId, tenantName, disabledReason, onTrialUpdated }: {
  trialId: string;
  tenantName: string;
  disabledReason?: string;
  onTrialUpdated?: (detail: PlatformServiceTrialDetailData) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PlatformServiceTrialDetailData | null>(null);
  const [scope, setScope] = useState<PlatformServiceTrialCapability[]>([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const submitting = useRef(false);
  const intent = useRef(createTrialIdempotencyIntent()).current;
  const action = getTrialScopeAction(data);
  const errorId = `trial-scope-error-${trialId}`;

  useEffect(() => () => { requestSequence.current += 1; }, []);

  async function loadDetail() {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setData(null);
    setError("");
    try {
      const detail = await requestBackendJson<PlatformServiceTrialDetailData>(
        `/platform/billing/service-trials/${trialId}`, { cache: "no-store", fallbackMessage: "试用详情加载失败" },
      );
      if (sequence !== requestSequence.current) return;
      setData(detail);
      setScope([...detail.trial.scope.capabilities]);
      setConflict(false);
      intent.beginNew();
    } catch (caught) {
      if (sequence === requestSequence.current) setError(caught instanceof Error ? caught.message : "试用详情加载失败");
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }

  function changeOpen(next: boolean) {
    if (submitting.current) return;
    setOpen(next);
    if (next) {
      setReason("");
      setConflict(false);
      void loadDetail();
    } else {
      requestSequence.current += 1;
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || loading || conflict || !data || !action.enabled || disabledReason) return;
    if (!scope.length || !reason.trim()) { setError("请选择至少一个模块并填写调整原因"); return; }
    const command = buildTrialScopeCommand({ scope, version: data.trial.version, reason, idempotencyKey: "" });
    command.idempotency_key = intent.forPayload(command);
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      // commandResponse is a snapshot, not the joined detail with tenant and events.
      await requestBackendJson(`/platform/billing/service-trials/${trialId}/scope`, {
        method: "PUT", body: JSON.stringify(command), fallbackMessage: "试用范围调整失败",
      });
      toast.success("试用范围已调整，原期限保持不变");
      setOpen(false);
      router.refresh();
      if (onTrialUpdated) {
        try {
          const detail = await requestBackendJson<PlatformServiceTrialDetailData>(
            `/platform/billing/service-trials/${trialId}`, { cache: "no-store", fallbackMessage: "详情刷新失败" },
          );
          onTrialUpdated(detail);
        } catch {
          toast.error("范围已保存，但详情刷新失败，请重新打开详情核对");
        }
      }
    } catch (caught) {
      const versionConflict = isTrialScopeConflict(caught);
      setConflict(versionConflict);
      setError(versionConflict ? "记录版本已变化。请重新加载最新范围，核对后再提交；不会自动覆盖。"
        : caught instanceof Error ? caught.message : "试用范围调整失败");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild>
      <Button type="button" size="sm" variant="outline" disabled={Boolean(disabledReason)} title={disabledReason}
        onClick={(event) => event.stopPropagation()}>调整试用范围</Button>
    </DialogTrigger>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl" onClick={(event) => event.stopPropagation()}>
      <DialogHeader>
        <DialogTitle>调整试用范围</DialogTitle>
        <DialogDescription>{tenantName}。仅调整模块范围，不缩短或延长试用；保留原只读宽限期（新建租户为 7 天）。</DialogDescription>
      </DialogHeader>
      {loading ? <div role="status" aria-live="polite"><span className="sr-only">正在加载最新试用范围</span><Skeleton className="h-32 w-full" /></div> : null}
      {error ? <div id={errorId} role="alert"><StatusAlert>{error}</StatusAlert></div> : null}
      {(!data || conflict) && !loading ? <Button type="button" variant="outline" onClick={() => void loadDetail()}>重新加载最新范围</Button> : null}
      {data && !loading ? <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={pending}>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt>试用截止</dt><dd>{formatTrialDateTime(data.trial.trial_ends_at)}</dd>
          <dt>只读宽限截止</dt><dd>{formatTrialDateTime(data.trial.grace_ends_at)}</dd>
          <dt>当前版本</dt><dd>{data.trial.version}</dd>
        </dl>
        <FieldGroup>
          <PlatformServiceTrialScopeSelector key={`${trialId}-${data.trial.version}`} scope={scope} setScope={setScope}
            disabled={pending || conflict || !action.enabled} scopeErrorId={error && !scope.length ? errorId : undefined} />
          <Field>
            <FieldLabel htmlFor={`trial-scope-reason-${trialId}`}>调整原因</FieldLabel>
            <Textarea id={`trial-scope-reason-${trialId}`} value={reason} onChange={(event) => setReason(event.target.value)}
              required maxLength={500} disabled={pending || conflict || !action.enabled} />
          </Field>
        </FieldGroup>
        {!action.enabled ? <p role="status" className="text-sm text-muted-foreground">{action.disabled_reason}</p> : null}
        <Button asChild variant="link" className="self-start" disabled={pending}>
          <Link href="/platform/billing?tab=tenants" aria-disabled={pending}
            onClick={(event) => { if (pending) event.preventDefault(); }}>前往计费账户办理充值或赠送积分</Link>
        </Button>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => changeOpen(false)}>取消</Button>
          <Button type="submit" disabled={pending || conflict || !action.enabled || !scope.length || !reason.trim()}>
            {pending ? <Spinner /> : null}确认调整范围
          </Button>
        </DialogFooter>
      </form> : null}
    </DialogContent>
  </Dialog>;
}
