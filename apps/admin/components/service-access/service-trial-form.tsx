"use client";

import { useRef, useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import {
  applyForServiceTrial,
  createServiceTrialSubmissionIntent,
  formatServiceTrialError,
  parseServiceTrialRequest,
  type ServiceTrialFormValues,
} from "./service-trial-api";

const EMPTY_VALUES: ServiceTrialFormValues = {
  applicationReason: "",
  expectedUserCount: "",
  expectedProjectCount: "",
  contactName: "",
  contactPhone: "",
};

type FormFeedback = {
  tone: "success" | "error";
  message: string;
};

export function ServiceTrialForm({
  onSubmitted,
}: {
  onSubmitted: () => Promise<void>;
}) {
  const [values, setValues] = useState<ServiceTrialFormValues>(EMPTY_VALUES);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);
  const submissionIntentRef = useRef(createServiceTrialSubmissionIntent());

  function updateField(
    field: keyof ServiceTrialFormValues,
    value: string,
  ): void {
    submissionIntentRef.current.clearAfterChange();
    setValues((current) => ({ ...current, [field]: value }));
    setFeedback(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const parsed = parseServiceTrialRequest(values);
    if (!parsed.success) {
      setFeedback({ tone: "error", message: parsed.message });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const key = submissionIntentRef.current.keyFor(parsed.data);
      await applyForServiceTrial(parsed.data, key);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: formatServiceTrialError(error, "试用申请提交失败，请稍后重试"),
      });
      setSubmitting(false);
      return;
    }

    submissionIntentRef.current.clearAfterSuccess();
    setValues({ ...EMPTY_VALUES });
    setFeedback({ tone: "success", message: "试用申请已提交，请等待平台审核。" });
    try {
      await onSubmitted();
    } catch (error) {
      setFeedback({
        tone: "success",
        message: `试用申请已提交。${formatServiceTrialError(
          error,
          "状态刷新失败，请稍后手动刷新",
        )}`,
      });
    }
    setSubmitting(false);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="service-trial-reason">试用目的</Label>
        <Textarea
          id="service-trial-reason"
          value={values.applicationReason}
          minLength={1}
          maxLength={1_000}
          rows={4}
          placeholder="请简要说明计划如何使用平台技术服务"
          disabled={submitting}
          required
          onChange={(event) => updateField("applicationReason", event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="service-trial-users">预计使用人数</Label>
        <Input
          id="service-trial-users"
          type="number"
          min={1}
          max={10_000}
          step={1}
          value={values.expectedUserCount}
          disabled={submitting}
          required
          onChange={(event) => updateField("expectedUserCount", event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="service-trial-projects">预计项目数量</Label>
        <Input
          id="service-trial-projects"
          type="number"
          min={1}
          max={100_000}
          step={1}
          value={values.expectedProjectCount}
          disabled={submitting}
          required
          onChange={(event) => updateField("expectedProjectCount", event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="service-trial-contact-name">联系人</Label>
        <Input
          id="service-trial-contact-name"
          value={values.contactName}
          minLength={1}
          maxLength={60}
          autoComplete="name"
          disabled={submitting}
          required
          onChange={(event) => updateField("contactName", event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="service-trial-contact-phone">中国大陆手机号</Label>
        <Input
          id="service-trial-contact-phone"
          type="tel"
          value={values.contactPhone}
          pattern="^1[3-9]\\d{9}$"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={11}
          disabled={submitting}
          required
          onChange={(event) => updateField("contactPhone", event.target.value)}
        />
      </div>

      {feedback ? (
        <Alert variant={feedback.tone === "error" ? "destructive" : "default"}>
          {feedback.tone === "error" ? (
            <CircleAlert aria-hidden="true" />
          ) : (
            <CircleCheck aria-hidden="true" />
          )}
          <AlertTitle>{feedback.tone === "error" ? "提交失败" : "提交成功"}</AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? <Spinner data-icon="inline-start" /> : null}
        {submitting ? "正在提交" : "提交试用申请"}
      </Button>
    </form>
  );
}
