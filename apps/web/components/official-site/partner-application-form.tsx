"use client";

import { type FormEvent, useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

import { PartnerApplicationFields } from "./partner-application-fields";
import {
  buildPartnerApplicationPayload,
  focusFirstInvalidField,
  type PartnerApplicationFormErrors,
  validatePartnerApplicationForm,
  validatePhone,
} from "./partner-application-form-utils";

interface PublicApplicationResponse {
  readonly code?: string;
  readonly data?: {
    readonly application_no?: string;
    readonly cooldown_seconds?: number;
  };
  readonly details?: {
    readonly cooldown_seconds?: number;
  };
  readonly error?: string;
  readonly message?: string;
  readonly success?: boolean;
}

type SubmissionState =
  | { readonly status: "idle"; readonly message: "" }
  | { readonly status: "submitting"; readonly message: "" }
  | { readonly status: "success"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

export function PartnerApplicationForm(): React.JSX.Element {
  const [subjectType, setSubjectType] = useState("company");
  const [phone, setPhone] = useState("");
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [errors, setErrors] = useState<PartnerApplicationFormErrors>({});
  const [submission, setSubmission] = useState<SubmissionState>({
    status: "idle",
    message: "",
  });
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [codeMessage, setCodeMessage] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const pending = submission.status === "submitting";

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1_000);

    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  async function handleSendCode(): Promise<void> {
    if (cooldownSeconds > 0) return;
    const phoneError = validatePhone(phone);
    if (phoneError) {
      setErrors((current) => ({ ...current, phone: phoneError }));
      return;
    }

    setErrors((current) => ({ ...current, phone: undefined }));
    setCodeMessage("");
    setIsSendingCode(true);
    try {
      const response = await fetch(
        "/api/public/partner-applications/send-code",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phone: phone.trim() }),
        },
      );
      const result = await readResponse(response);
      const responseCooldown = normalizeCooldownSeconds(result);
      if (!response.ok || result.success === false) {
        if (responseCooldown > 0) setCooldownSeconds(responseCooldown);
        setErrors((current) => ({
          ...current,
          phone: getResponseMessage(result, "验证码发送失败，请稍后再试"),
        }));
        return;
      }

      setCooldownSeconds(responseCooldown);
      setCodeMessage("验证码已发送。官网申请不强制填写验证码，可直接提交申请。");
    } catch {
      setErrors((current) => ({
        ...current,
        phone: "验证码发送失败，请稍后再试",
      }));
    } finally {
      setIsSendingCode(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const nextErrors = validatePartnerApplicationForm(formData, agreePrivacy);
    setErrors(nextErrors);
    setSubmission({ status: "idle", message: "" });
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidField(form, nextErrors);
      return;
    }

    setSubmission({ status: "submitting", message: "" });
    try {
      const response = await fetch("/api/public/partner-applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildPartnerApplicationPayload(formData, subjectType, agreePrivacy),
        ),
      });
      const result = await readResponse(response);
      if (!response.ok || result.success === false) {
        setSubmission({
          status: "error",
          message: getResponseMessage(result, "申请提交失败，请稍后再试"),
        });
        return;
      }

      form.reset();
      setPhone("");
      setSubjectType("company");
      setAgreePrivacy(false);
      setCodeMessage("");
      setCooldownSeconds(0);
      setSubmission({
        status: "success",
        message: result.data?.application_no
          ? `申请已提交，编号 ${result.data.application_no}。平台运营会联系你核实信息。`
          : "申请已提交。平台运营会联系你核实信息。",
      });
    } catch {
      setSubmission({
        status: "error",
        message: "申请提交失败，请稍后再试",
      });
    }
  }

  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={handleSubmit}>
      <PartnerApplicationFields
        agreePrivacy={agreePrivacy}
        codeMessage={codeMessage}
        cooldownSeconds={cooldownSeconds}
        errors={errors}
        isSendingCode={isSendingCode}
        onAgreePrivacyChange={setAgreePrivacy}
        onPhoneChange={setPhone}
        onSendCode={handleSendCode}
        onSubjectTypeChange={setSubjectType}
        pending={pending}
        phone={phone}
        subjectType={subjectType}
      />

      {submission.status === "success" ? (
        <Alert aria-live="polite" role="status">
          <AlertTitle>提交成功</AlertTitle>
          <AlertDescription>{submission.message}</AlertDescription>
        </Alert>
      ) : null}
      {submission.status === "error" ? (
        <FieldError>{submission.message}</FieldError>
      ) : null}

      <Button
        aria-busy={pending}
        className="h-11 w-full sm:w-fit"
        disabled={pending}
        type="submit"
      >
        {pending ? (
          <Spinner aria-hidden="true" data-icon="inline-start" />
        ) : null}
        {pending ? "提交中" : "提交合作申请"}
      </Button>
    </form>
  );
}

async function readResponse(
  response: Response,
): Promise<PublicApplicationResponse> {
  return response.json().catch(() => ({})) as Promise<PublicApplicationResponse>;
}

function normalizeCooldownSeconds(response: PublicApplicationResponse): number {
  const cooldown =
    response.data?.cooldown_seconds ?? response.details?.cooldown_seconds ?? 0;

  return Number.isFinite(cooldown) ? Math.max(0, Math.floor(cooldown)) : 0;
}

function getResponseMessage(
  response: PublicApplicationResponse,
  fallback: string,
): string {
  return response.message || response.error || fallback;
}
