"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { StatusAlert } from "@/components/admin/status-alert";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

import { createTrialIdempotencyIntent } from "./platform-service-trial-idempotency";
import type {
  PlatformServiceTrialFollowUp,
  ServiceTrialFollowUpStatus,
  ServiceTrialFollowUpType,
} from "./platform-service-trial-types";

const typeOptions: Array<{ value: ServiceTrialFollowUpType; label: string }> = [
  { value: "phone", label: "电话" },
  { value: "wechat", label: "微信" },
  { value: "online_meeting", label: "线上会议" },
  { value: "onsite", label: "现场沟通" },
  { value: "other", label: "其他" },
];

export function PlatformServiceTrialFollowUpForm({
  trialId,
  canManage,
  onCreated,
}: {
  trialId: string;
  canManage: boolean;
  onCreated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState<ServiceTrialFollowUpType>("phone");
  const [status, setStatus] = useState<Exclude<ServiceTrialFollowUpStatus, "canceled">>("completed");
  const [summary, setSummary] = useState("");
  const [result, setResult] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const idempotencyIntent = useRef(createTrialIdempotencyIntent()).current;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedSummary = summary.trim();
    const normalizedResult = result.trim();
    if (!normalizedSummary || !normalizedResult) {
      setError("请填写跟进摘要和结果");
      return;
    }
    if (status === "pending" && !nextFollowUpAt) {
      setError("待跟进任务必须指定下次跟进时间");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await requestBackendJson<PlatformServiceTrialFollowUp>(
        `/platform/billing/service-trials/${trialId}/follow-ups`,
        {
          method: "POST",
          body: JSON.stringify({
            follow_up_type: type,
            status,
            summary: normalizedSummary,
            result: normalizedResult,
            next_follow_up_at: nextFollowUpAt
              ? new Date(nextFollowUpAt).toISOString()
              : null,
            idempotency_key: idempotencyIntent.current(),
          }),
          fallbackMessage: "新增试用跟进失败",
        },
      );
      toast.success("试用跟进已记录");
      setOpen(false);
      setSummary("");
      setResult("");
      setNextFollowUpAt("");
      await onCreated();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "新增试用跟进失败";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) {
      idempotencyIntent.beginNew();
      setError("");
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canManage}
          title={canManage ? undefined : "无试用跟进管理权限"}
        >
          <Plus data-icon="inline-start" />
          新增跟进
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>记录试用跟进</DialogTitle>
          <DialogDescription>记录本次沟通结果和可选的下次跟进时间。</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>跟进方式</FieldLabel>
                <Select value={type} onValueChange={(value) => setType(value as ServiceTrialFollowUpType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>{typeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}</SelectGroup></SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>记录状态</FieldLabel>
                <Select value={status} onValueChange={(value) => setStatus(value as "pending" | "completed")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="completed">已完成</SelectItem>
                    <SelectItem value="pending">待继续跟进</SelectItem>
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
            </div>
            <Field data-invalid={error && !summary.trim() ? true : undefined}>
              <FieldLabel htmlFor={`trial-follow-up-summary-${trialId}`}>跟进摘要</FieldLabel>
              <Input
                id={`trial-follow-up-summary-${trialId}`}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                maxLength={500}
                aria-invalid={Boolean(error && !summary.trim())}
              />
            </Field>
            <Field data-invalid={error && !result.trim() ? true : undefined}>
              <FieldLabel htmlFor={`trial-follow-up-result-${trialId}`}>跟进结果</FieldLabel>
              <Textarea
                id={`trial-follow-up-result-${trialId}`}
                value={result}
                onChange={(event) => setResult(event.target.value)}
                rows={4}
                maxLength={1000}
                aria-invalid={Boolean(error && !result.trim())}
              />
            </Field>
            <Field data-invalid={error && status === "pending" && !nextFollowUpAt ? true : undefined}>
              <FieldLabel htmlFor={`trial-follow-up-next-${trialId}`}>下次跟进时间</FieldLabel>
              <Input
                id={`trial-follow-up-next-${trialId}`}
                type="datetime-local"
                value={nextFollowUpAt}
                onChange={(event) => setNextFollowUpAt(event.target.value)}
                required={status === "pending"}
                aria-invalid={Boolean(error && status === "pending" && !nextFollowUpAt)}
              />
              <FieldError>{status === "pending" && !nextFollowUpAt && error
                ? "待跟进任务必须指定下次跟进时间" : null}</FieldError>
            </Field>
          </FieldGroup>
          {error ? <div role="alert"><StatusAlert>{error}</StatusAlert></div> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>取消</Button>
            <Button type="submit" disabled={submitting} className="min-w-24">
              <span data-icon="inline-start" className="relative size-4">
                <Plus className={cn(submitting && "invisible")} />
                {submitting ? <Spinner className="absolute inset-0" /> : null}
              </span>
              {submitting ? "提交中" : "记录跟进"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
