"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Clock3, Settings2, UserRoundPlus, X } from "lucide-react";
import { toast } from "sonner";

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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";

import { runTrialMutationFlow } from "./platform-service-trial-action-execution";
import {
  buildPlatformServiceTrialActionBody,
  describePlatformServiceTrialAssigneeChange,
  type PlatformServiceTrialDialogKind,
} from "./platform-service-trial-action-body";
import { PlatformServiceTrialAssigneeCombobox } from "./platform-service-trial-assignee-combobox";
import { createBoundTrialAssigneeCandidate } from "./platform-service-trial-assignee-options";
import { createTrialIdempotencyIntent } from "./platform-service-trial-idempotency";
import { PlatformServiceTrialApprovalFields } from "./platform-service-trial-approval-fields";
import { trialCapabilityOptions } from "./platform-service-trial-rules";
import type {
  PlatformServiceTrialAction,
  PlatformServiceTrialAssigneeCandidate,
  PlatformServiceTrialCapability,
  PlatformServiceTrialDetailData,
  PlatformServiceTrialRecord,
  PlatformServiceTrialType,
} from "./platform-service-trial-types";

const dialogMeta: Record<PlatformServiceTrialDialogKind, {
  label: string;
  title: string;
  success: string;
  variant: "default" | "outline" | "destructive";
}> = {
  approve: { label: "通过", title: "通过试用申请", success: "试用申请已通过", variant: "default" },
  reject: { label: "驳回", title: "驳回试用申请", success: "试用申请已驳回", variant: "destructive" },
  extend: { label: "延期", title: "延长试用期限", success: "试用期限已延长", variant: "outline" },
  revoke: { label: "撤销", title: "提前撤销试用", success: "试用已撤销", variant: "destructive" },
  assign: { label: "分配", title: "分配平台跟进人", success: "跟进人已更新", variant: "outline" },
};

const dialogIcons = {
  approve: Check,
  reject: X,
  extend: Clock3,
  revoke: X,
  assign: UserRoundPlus,
} as const;

export function PlatformServiceTrialActionDialog({
  kind,
  trial,
  action,
  onTrialUpdated,
}: {
  kind: PlatformServiceTrialDialogKind;
  trial: PlatformServiceTrialRecord;
  action: PlatformServiceTrialAction;
  onTrialUpdated: (data: PlatformServiceTrialDetailData) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const boundAssignee = trial.assignee
    ? createBoundTrialAssigneeCandidate(trial.assignee)
    : null;
  const [assigneeEmployeeId, setAssigneeEmployeeId] = useState<string | null>(
    trial.assignee_employee_id,
  );
  const [selectedAssignee, setSelectedAssignee] = useState<
    PlatformServiceTrialAssigneeCandidate | null
  >(boundAssignee);
  const [trialType, setTrialType] = useState<PlatformServiceTrialType>(trial.trial_type);
  const [startsAt, setStartsAt] = useState("");
  const [trialDays, setTrialDays] = useState("30");
  const [graceDays, setGraceDays] = useState("7");
  const [extensionDays, setExtensionDays] = useState("7");
  const [scope, setScope] = useState<PlatformServiceTrialCapability[]>(
    trial.scope.capabilities,
  );
  const idempotencyIntent = useRef(createTrialIdempotencyIntent()).current;
  const meta = dialogMeta[kind];
  const Icon = dialogIcons[kind];
  const errorId = `trial-action-error-${kind}-${trial.id}`;
  const scopeErrorId = error === "请至少选择一项试用范围" && scope.length === 0
    ? errorId
    : undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedReason = reason.trim();
    if (kind !== "assign" && !normalizedReason) {
      setError("请填写操作原因");
      return;
    }
    if (kind === "approve" && scope.length === 0) {
      setError("请至少选择一项试用范围");
      return;
    }
    if (kind === "approve" && trialType === "guided" && !selectedAssignee?.selectable) {
      setError("请选择有效的陪跑跟进人");
      return;
    }
    if (kind === "approve" && assigneeEmployeeId && !selectedAssignee?.selectable) {
      setError("请选择有效的平台跟进人或取消分配");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const result = await runTrialMutationFlow({
        mutate: async () => {
          await requestBackendJson(actionPath(trial.id, kind), {
            method: "POST",
            body: JSON.stringify(buildPlatformServiceTrialActionBody({
              kind,
              trial,
              reason: normalizedReason,
              assigneeEmployeeId,
              trialType,
              startsAt,
              trialDays,
              graceDays,
              extensionDays,
              scope,
              idempotencyKey: idempotencyIntent.current(),
            })),
            fallbackMessage: `${meta.label}试用失败`,
          });
        },
        refreshList: () => router.refresh(),
        onMutationSucceeded: () => {
          toast.success(meta.success);
          setOpen(false);
        },
        loadDetail: () => requestBackendJson<PlatformServiceTrialDetailData>(
          `/platform/billing/service-trials/${trial.id}`,
          { fallbackMessage: "操作成功，但详情刷新失败" },
        ),
        updateDetail: onTrialUpdated,
      });
      if (result.detailRefreshError) {
        toast.error("操作已成功，但详情刷新失败，请重新打开详情核对");
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : `${meta.label}试用失败`;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) {
      idempotencyIntent.beginNew();
      setAssigneeEmployeeId(trial.assignee_employee_id);
      setSelectedAssignee(boundAssignee);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={action.enabled ? open : false} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={meta.variant}
          disabled={!action.enabled}
          title={action.disabled_reason || undefined}
        >
          <Icon data-icon="inline-start" />
          {meta.label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{meta.title}</DialogTitle>
          <DialogDescription>
            {trial.tenant.name}，当前版本 {trial.version}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            {kind === "approve" ? (
              <PlatformServiceTrialApprovalFields
                trialId={trial.id}
                trialType={trialType}
                setTrialType={setTrialType}
                startsAt={startsAt}
                setStartsAt={setStartsAt}
                trialDays={trialDays}
                setTrialDays={setTrialDays}
                graceDays={graceDays}
                setGraceDays={setGraceDays}
                assigneeEmployeeId={assigneeEmployeeId}
                setAssigneeEmployeeId={setAssigneeEmployeeId}
                assigneeCandidate={selectedAssignee}
                setAssigneeCandidate={setSelectedAssignee}
                scope={scope}
                setScope={setScope}
                scopeErrorId={scopeErrorId}
              />
            ) : null}
            {kind === "extend" ? (
              <Field>
                <FieldLabel htmlFor={`trial-extension-${trial.id}`}>延期天数</FieldLabel>
                <Input
                  id={`trial-extension-${trial.id}`}
                  type="number"
                  min={1}
                  max={365}
                  value={extensionDays}
                  onChange={(event) => setExtensionDays(event.target.value)}
                  required
                />
              </Field>
            ) : null}
            {kind === "assign" ? (
              <Field>
                <FieldLabel htmlFor={`trial-assignee-${trial.id}`}>平台跟进人</FieldLabel>
                <PlatformServiceTrialAssigneeCombobox
                  id={`trial-assignee-${trial.id}`}
                  value={assigneeEmployeeId}
                  onChange={setAssigneeEmployeeId}
                  onCandidateChange={setSelectedAssignee}
                  initialCandidate={boundAssignee}
                  allowClear
                />
                <AssigneeChangeSummary
                  currentCandidate={boundAssignee}
                  nextCandidate={selectedAssignee}
                />
              </Field>
            ) : null}
            {kind !== "assign" ? (
              <Field data-invalid={Boolean(error && !reason.trim())}>
                <FieldLabel htmlFor={`trial-reason-${kind}-${trial.id}`}>操作原因</FieldLabel>
                <Textarea
                  id={`trial-reason-${kind}-${trial.id}`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  aria-invalid={Boolean(error && !reason.trim())}
                  aria-describedby={error ? errorId : undefined}
                  required
                />
              </Field>
            ) : null}
          </FieldGroup>
          <div id={errorId} role="alert" aria-live="assertive">
            <FieldError>{error}</FieldError>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button type="submit" variant={meta.variant} disabled={submitting}>
              <span className="relative inline-flex size-4 items-center justify-center">
                <Icon className={submitting ? "invisible" : undefined} aria-hidden="true" />
                <Spinner className={submitting ? "absolute" : "invisible absolute"} />
              </span>
              确认{meta.label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlatformServiceTrialGrantDialog({
  disabledReason,
}: {
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [trialType, setTrialType] = useState<PlatformServiceTrialType>("standard");
  const [startsAt, setStartsAt] = useState("");
  const [trialDays, setTrialDays] = useState("30");
  const [graceDays, setGraceDays] = useState("7");
  const [assigneeEmployeeId, setAssigneeEmployeeId] = useState<string | null>(null);
  const [selectedAssignee, setSelectedAssignee] = useState<
    PlatformServiceTrialAssigneeCandidate | null
  >(null);
  const [scope, setScope] = useState<PlatformServiceTrialCapability[]>(
    trialCapabilityOptions.map((option) => option.value),
  );
  const idempotencyIntent = useRef(createTrialIdempotencyIntent()).current;
  const errorId = "grant-trial-error";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const tenantId = String(form.get("tenant_id") || "").trim();
    const reason = String(form.get("reason") || "").trim();
    if (!tenantId || !reason || scope.length === 0
      || trialType === "guided" && !selectedAssignee?.selectable) {
      setError("请完整填写租户、原因、范围和陪跑跟进人");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await requestBackendJson("/platform/billing/service-trials", {
        method: "POST",
        body: JSON.stringify({
          tenant_id: tenantId,
          trial_type: trialType,
          starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
          trial_days: Number(trialDays),
          grace_days: Number(graceDays),
          scope: { version: 1, capabilities: scope },
          assignee_employee_id: assigneeEmployeeId,
          reason,
          idempotency_key: idempotencyIntent.current(),
        }),
        fallbackMessage: "主动开通试用失败",
      });
      toast.success("试用已开通");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "主动开通试用失败";
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

  return (
    <Dialog open={!disabledReason ? open : false} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" disabled={Boolean(disabledReason)} title={disabledReason}>
          <CalendarPlus data-icon="inline-start" />
          主动开通试用
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>主动开通试用</DialogTitle>
          <DialogDescription>为已核验企业配置一次技术服务试用。</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="grant-trial-tenant">租户 ID</FieldLabel><Input id="grant-trial-tenant" name="tenant_id" required /></Field>
            <PlatformServiceTrialApprovalFields
              trialId="grant"
              trialType={trialType}
              setTrialType={setTrialType}
              startsAt={startsAt}
              setStartsAt={setStartsAt}
              trialDays={trialDays}
              setTrialDays={setTrialDays}
              graceDays={graceDays}
              setGraceDays={setGraceDays}
              assigneeEmployeeId={assigneeEmployeeId}
              setAssigneeEmployeeId={setAssigneeEmployeeId}
              assigneeCandidate={selectedAssignee}
              setAssigneeCandidate={setSelectedAssignee}
              scope={scope}
              setScope={setScope}
              scopeErrorId={error && scope.length === 0 ? errorId : undefined}
            />
            <Field><FieldLabel htmlFor="grant-trial-reason">开通原因</FieldLabel><Textarea id="grant-trial-reason" name="reason" maxLength={500} required /></Field>
          </FieldGroup>
          <div id={errorId} role="alert" aria-live="assertive">
            <FieldError>{error}</FieldError>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>取消</Button>
            <Button type="submit" disabled={submitting}>
              <span className="relative inline-flex size-4 items-center justify-center"><Settings2 className={submitting ? "invisible" : undefined} /><Spinner className={submitting ? "absolute" : "invisible absolute"} /></span>
              确认开通
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function actionPath(trialId: string, kind: PlatformServiceTrialDialogKind) {
  return `/platform/billing/service-trials/${trialId}/${kind === "approve" || kind === "reject" ? "review" : kind}`;
}

function AssigneeChangeSummary({
  currentCandidate,
  nextCandidate,
}: {
  currentCandidate: PlatformServiceTrialAssigneeCandidate | null;
  nextCandidate: PlatformServiceTrialAssigneeCandidate | null;
}) {
  const summary = describePlatformServiceTrialAssigneeChange(
    currentCandidate,
    nextCandidate,
  );
  return (
    <dl className="grid gap-1 rounded-md bg-muted/50 px-3 py-2 text-xs">
      <div className="flex min-w-0 justify-between gap-3">
        <dt className="shrink-0 text-muted-foreground">当前负责人</dt>
        <dd className="truncate text-right">{summary.current}</dd>
      </div>
      <div className="flex min-w-0 justify-between gap-3">
        <dt className="shrink-0 text-muted-foreground">调整结果</dt>
        <dd className="truncate text-right font-medium">{summary.next}</dd>
      </div>
    </dl>
  );
}
